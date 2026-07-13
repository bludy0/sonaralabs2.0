import { create } from 'zustand'
import { getAudioContext, getMasterGain, resumeContext } from '../engine/context'
import { TrackNode }     from '../engine/TrackNode'
import { SynthEngine }   from '../engine/SynthEngine'
import { SamplerEngine } from '../engine/SamplerEngine'
import { useDAWStore }   from './useDAWStore'
import { lerp }          from '../lib/lerp'
import type { AudioTrack, MidiTrack, AutomationPoint } from '../types'

interface EngineState {
  isPlaying:   boolean
  currentTime: number   // seconds, updated at 60fps during playback
  masterVolume:number

  init:         () => () => void
  play:         () => Promise<void>
  pause:        () => void
  stop:         () => void
  seek:         (t: number) => void
  setMasterVol: (v: number) => void
}

// Playback state outside Zustand (no re-render on every frame)
let _startContextTime = 0  // AudioContext.currentTime when play() was called
let _startOffset      = 0  // timeline seconds we started from
let _raf: number | null = null
let _lastReportedTime  = 0 // last currentTime value pushed into Zustand state

// Per-track nodes and synth/sampler engines
const trackNodes     = new Map<string, TrackNode>()
const synthEngines   = new Map<string, SynthEngine>()
const samplerEngines = new Map<string, SamplerEngine>()
const midiTimers:    ReturnType<typeof setTimeout>[] = []
let _unsubStore:    (() => void) | null = null

function clearMidiTimers() {
  midiTimers.forEach(clearTimeout)
  midiTimers.length = 0
}

interface ProjectSigState {
  tracks:         { id: string; muted: boolean; soloed: boolean; volume: number; pan: number }[]
  automationLanes: unknown[]
  transport:       { bpm: number }
}

/** Snapshot key used to decide whether the audio graph needs a resync.
 *  Returns a signature string that only changes when project-affecting state
 *  (tracks, automation lanes, or transport bpm) changes — NOT on pure UI
 *  state like selection/zoom/panel toggles. This avoids rebuilding the
 *  per-track audio graph on every drag of a fader or selection. */
function projectSignature(s: ProjectSigState): string {
  return `${s.tracks.length}:${s.automationLanes.length}:${s.transport.bpm}:${s.tracks.map((t) => t.id + (t.muted?'m':'')+(t.soloed?'s':'')+(t.volume|0)+(t.pan|0)).join(',')}`
}

function syncTrackNodes() {
  const ctx    = getAudioContext()
  const master = getMasterGain()
  const tracks = useDAWStore.getState().tracks

  // Remove nodes for deleted tracks — disconnect the audio graph to avoid leaks
  for (const [id, node] of trackNodes) {
    if (!tracks.find(t => t.id === id)) {
      node.dispose()
      trackNodes.delete(id)
      synthEngines.delete(id)
      samplerEngines.delete(id)
    }
  }

  const hasSolo = tracks.some(t => t.soloed)

  // Create nodes for new tracks + sync all
  for (const track of tracks) {
    if (!trackNodes.has(track.id)) {
      trackNodes.set(track.id, new TrackNode(ctx, track.id, master))
    }
    if (track.type === 'midi') {
      if (!synthEngines.has(track.id)) {
        synthEngines.set(track.id, new SynthEngine())
      }
      // Ensure a SamplerEngine exists; load instrument if set
      if (!samplerEngines.has(track.id)) {
        samplerEngines.set(track.id, new SamplerEngine())
      }
      const sampler = samplerEngines.get(track.id)!
      const midiTrack = track as MidiTrack
      if (midiTrack.instrument && sampler.currentInstrument !== midiTrack.instrument) {
        // Fire-and-forget async load — engine will be ready before playback
        sampler.loadInstrument(midiTrack.instrument, ctx as AudioContext).catch(() => {/* ignore */})
      }
    }
    trackNodes.get(track.id)!.sync(track, hasSolo)
  }
}

/**
 * Schedule all clips (audio + MIDI) that overlap or follow `startSec`.
 * Captured out of `play()` so the loop-restart path can re-schedule without
 * tearing down the RAF / AudioContext time anchor — eliminating the audible
 * gap that the previous stop()+play() approach produced at the loop boundary.
 *
 * `baseCtxTime` is the AudioContext.currentTime equivalent of `startSec`
 * (i.e. `_startContextTime + (startSec - _startOffset)`).
 */
function schedulePlayback(startSec: number, baseCtxTime: number) {
  const ctx       = getAudioContext()
  const { tracks, transport } = useDAWStore.getState()
  const hasSolo    = tracks.some(t => t.soloed)

  // Audio clips
  for (const track of tracks) {
    const shouldMute = track.muted || (hasSolo && !track.soloed)
    if (shouldMute) continue
    const node = trackNodes.get(track.id)
    if (!node || track.type !== 'audio') continue

    for (const clip of (track as AudioTrack).clips) {
      if (!clip.buffer) continue
      const effectiveDur = (clip.trimEnd || clip.duration) - clip.trimStart
      const clipEnd = clip.startTime + effectiveDur
      if (clipEnd <= startSec) continue   // already passed

      const overlapStart = Math.max(startSec, clip.startTime)
      const trimOffset   = clip.trimStart + Math.max(0, startSec - clip.startTime)
      const playDur      = clipEnd - overlapStart
      const scheduleAt   = baseCtxTime + (overlapStart - startSec)

      node.playClip(clip.id, clip.buffer, scheduleAt, trimOffset, playDur, clip.fadeIn ?? 0, clip.fadeOut ?? 0)
    }
  }

  // MIDI clips
  for (const track of tracks) {
    const shouldMute = track.muted || (hasSolo && !track.soloed)
    if (shouldMute || track.type !== 'midi') continue
    const midiTrack = track as MidiTrack
    const node      = trackNodes.get(track.id)
    if (!node) continue

    const sampler = samplerEngines.get(track.id)
    const synth   = synthEngines.get(track.id)
    const engine  = (sampler?.isReady) ? sampler : synth
    if (!engine) continue

    for (const clip of midiTrack.clips) {
      const secPerBeat = 60 / transport.bpm
      const clipDur    = clip.durationBeats * secPerBeat
      // Re-schedule every clip whose end is still ahead of us — including
      // ones that started before us (loop wraps them around).  For live
      // re-schedule at the loop boundary, "ahead" is simply > startSec.
      const clipEnd = clip.startTime + (clip.loopBeats ?? clip.durationBeats) * secPerBeat
      if (clipEnd <= startSec) continue

      const clipContextStart = baseCtxTime + Math.max(0, clip.startTime - startSec)
      const timers = engine.scheduleMidiClip(
        clip.notes,
        clipContextStart,
        transport.bpm,
        midiTrack.synth,
        node.input,
        ctx,
      )
      midiTimers.push(...timers)
    }
  }
}

/** Stop all currently-scheduled sources (audio + MIDI) without touching the
 *  RAF loop or playhead anchor.  Used at loop wrap to silence what was
 *  playing so the new schedule can start cleanly. */
function hardStopSources() {
  const ctx = getAudioContext()
  for (const node of trackNodes.values()) node.stopAll()
  for (const [, syn] of synthEngines)    syn.stopAll(ctx)
  for (const [, smp] of samplerEngines)  smp.stopAll(ctx)
  clearMidiTimers()
}

/** Expose the per-track AnalyserNode so UI components (e.g. Mixer meters) can
 *  read *real* frequency/peak data instead of fabricating levels with
 *  Math.random(). Returns null when the track has no live graph yet. */
export function getTrackAnalyser(trackId: string): AnalyserNode | null {
  const node = trackNodes.get(trackId)
  return node ? node.getAnalyser() : null
}

export const useAudioEngine = create<EngineState>((set, get) => ({
  isPlaying:    false,
  currentTime:  0,
  masterVolume: 0.85,

  init: () => {
    syncTrackNodes()
    // Subscribe with a selector so syncTrackNodes only runs when the
    // project-affecting signature changes, not on every UI tick. This also
    // returns an unsubscribe which callers MUST invoke on teardown to avoid
    // duplicate subscriptions stacking up across remounts.
    let lastSig = projectSignature(useDAWStore.getState())
    if (_unsubStore) { try { _unsubStore() } catch { /* already unsubscribed */ } }
    _unsubStore = useDAWStore.subscribe(
      (s) => projectSignature(s),
      (sig) => {
        if (sig !== lastSig) {
          lastSig = sig
          syncTrackNodes()
        }
      },
    )
    return () => {
      if (_unsubStore) { _unsubStore(); _unsubStore = null }
    }
  },

  play: async () => {
    if (get().isPlaying) return
    await resumeContext()

    const ctx       = getAudioContext()
    const startSec  = get().currentTime
    _startOffset      = startSec
    _startContextTime = ctx.currentTime

    syncTrackNodes()
    schedulePlayback(startSec, _startContextTime)

    // RAF loop for playhead + automation
    const tick = () => {
      const elapsed = ctx.currentTime - _startContextTime
      const pos     = _startOffset + elapsed
      const { transport, automationLanes } = useDAWStore.getState()

      // Loop: instead of stop()+play() (which left an audible gap while the
      // AudioContext re-anchored, RAF re-armed, and clips re-scheduled), we
      // hard-stop the active sources but keep the RAF / context time base
      // running, then schedule from the loop start at the *current* ctx time.
      if (transport.loopEnabled && pos >= transport.loopEnd) {
        hardStopSources()
        _startOffset      = transport.loopStart
        _startContextTime = ctx.currentTime
        _lastReportedTime = -Infinity   // force immediate state push
        schedulePlayback(transport.loopStart, _startContextTime)
        set({ currentTime: transport.loopStart })
        _raf = requestAnimationFrame(tick)
        return
      }

      // Apply automation
      for (const lane of automationLanes) {
        if (!lane.enabled || lane.points.length === 0) continue
        const node = trackNodes.get(lane.trackId)
        if (!node) continue
        node.setParam(lane.param, lerp(lane.points, pos))
      }

      // Only push the playhead position into React state when it has moved by
      // ≥ 33ms since the last push. This caps re-renders during playback to
      // ~30fps while keeping audio scheduling at full 60fps resolution in the
      // RAF loop.  Playhead-follow logic in Timeline.tsx reads currentTime from
      // state, so it still tracks motion but renders far less often.
      if (pos - _lastReportedTime >= 0.033 || pos < _lastReportedTime) {
        _lastReportedTime = pos
        set({ currentTime: pos })
      }
      _raf = requestAnimationFrame(tick)
    }

    set({ isPlaying: true })
    _raf = requestAnimationFrame(tick)
  },

  pause: () => {
    if (!get().isPlaying) return
    if (_raf) cancelAnimationFrame(_raf)
    clearMidiTimers()
    const ctx = getAudioContext()
    for (const node    of trackNodes.values())     node.stopAll()
    for (const [, syn] of synthEngines)             syn.stopAll(ctx)
    for (const [, smp] of samplerEngines)           smp.stopAll(ctx)
    set({ isPlaying: false })
  },

  stop: () => {
    if (_raf) cancelAnimationFrame(_raf)
    clearMidiTimers()
    const ctx = getAudioContext()
    for (const node    of trackNodes.values())     node.stopAll()
    for (const [, syn] of synthEngines)             syn.stopAll(ctx)
    for (const [, smp] of samplerEngines)           smp.stopAll(ctx)
    set({ isPlaying: false, currentTime: 0 })
  },

  seek: (t) => {
    const wasPlaying = get().isPlaying
    if (wasPlaying) get().pause()
    set({ currentTime: Math.max(0, t) })
    if (wasPlaying) get().play()
  },

  setMasterVol: (v) => {
    getMasterGain().gain.value = v
    set({ masterVolume: v })
  },
}))
