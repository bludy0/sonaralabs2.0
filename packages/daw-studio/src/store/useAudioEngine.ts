import { create } from 'zustand'
import { getAudioContext, getMasterGain, resumeContext } from '../engine/context'
import { TrackNode }     from '../engine/TrackNode'
import { SynthEngine }   from '../engine/SynthEngine'
import { SamplerEngine } from '../engine/SamplerEngine'
import { useDAWStore }   from './useDAWStore'
import type { AudioTrack, MidiTrack, AutomationPoint } from '../types'

/** Linear interpolation between automation points at a given time. */
function lerpAutomation(points: AutomationPoint[], t: number): number {
  if (t <= points[0].time) return points[0].value
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].time) {
      const a  = points[i - 1]
      const b  = points[i]
      const pct = (t - a.time) / (b.time - a.time)
      return a.value + (b.value - a.value) * pct
    }
  }
  return points[points.length - 1].value
}

interface EngineState {
  isPlaying:   boolean
  currentTime: number   // seconds, updated at 60fps during playback
  masterVolume:number

  init:         () => void
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

// Per-track nodes and synth/sampler engines
const trackNodes     = new Map<string, TrackNode>()
const synthEngines   = new Map<string, SynthEngine>()
const samplerEngines = new Map<string, SamplerEngine>()
const midiTimers:    ReturnType<typeof setTimeout>[] = []

function clearMidiTimers() {
  midiTimers.forEach(clearTimeout)
  midiTimers.length = 0
}

function syncTrackNodes() {
  const ctx    = getAudioContext()
  const master = getMasterGain()
  const tracks = useDAWStore.getState().tracks

  // Remove nodes for deleted tracks
  for (const [id] of trackNodes) {
    if (!tracks.find(t => t.id === id)) {
      trackNodes.get(id)!.stopAll()
      trackNodes.delete(id)
      synthEngines.delete(id)
      samplerEngines.delete(id)
    }
  }

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
    trackNodes.get(track.id)!.sync(track)
  }
}

export const useAudioEngine = create<EngineState>((set, get) => ({
  isPlaying:    false,
  currentTime:  0,
  masterVolume: 0.85,

  init: () => {
    syncTrackNodes()
    useDAWStore.subscribe(() => {
      syncTrackNodes()
    })
  },

  play: async () => {
    if (get().isPlaying) return
    await resumeContext()

    const ctx       = getAudioContext()
    const { tracks, transport } = useDAWStore.getState()
    const startSec  = get().currentTime
    _startOffset      = startSec
    _startContextTime = ctx.currentTime

    syncTrackNodes()

    // Schedule all audio clips that overlap playhead
    for (const track of tracks) {
      if (track.muted) continue
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
        const scheduleAt   = _startContextTime + (overlapStart - startSec)

        node.playClip(clip.id, clip.buffer, scheduleAt, trimOffset, playDur, clip.fadeIn ?? 0, clip.fadeOut ?? 0)
      }
    }

    // Schedule MIDI clips
    for (const track of tracks) {
      if (track.muted || track.type !== 'midi') continue
      const midiTrack = track as MidiTrack
      const node      = trackNodes.get(track.id)
      if (!node) continue

      // Choose engine: sampler (if instrument loaded) or synth fallback
      const sampler = samplerEngines.get(track.id)
      const synth   = synthEngines.get(track.id)
      const engine  = (sampler?.isReady) ? sampler : synth
      if (!engine) continue

      for (const clip of midiTrack.clips) {
        const secPerBeat = 60 / transport.bpm
        const clipDur    = clip.durationBeats * secPerBeat
        if (clip.startTime + clipDur <= startSec) continue

        const clipContextStart = _startContextTime + Math.max(0, clip.startTime - startSec)
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

    // RAF loop for playhead + automation
    const tick = () => {
      const elapsed = ctx.currentTime - _startContextTime
      const pos     = _startOffset + elapsed
      const { transport, automationLanes } = useDAWStore.getState()

      // Loop
      if (transport.loopEnabled && pos >= transport.loopEnd) {
        get().stop()
        set({ currentTime: transport.loopStart })
        get().play()
        return
      }

      // Apply automation
      for (const lane of automationLanes) {
        if (!lane.enabled || lane.points.length === 0) continue
        const node = trackNodes.get(lane.trackId)
        if (!node) continue
        node.setParam(lane.param, lerpAutomation(lane.points, pos))
      }

      set({ currentTime: pos })
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
