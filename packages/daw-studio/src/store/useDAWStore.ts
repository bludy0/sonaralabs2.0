import { create } from 'zustand'
import { temporal } from 'zundo'
import { v4 as uuid } from 'uuid'
import {
  DAWTrack, AudioTrack, MidiTrack,
  AudioClip, MidiClip, MidiNote,
  TransportState, EffectChain, SynthPreset,
  AutomationLane, AutomationPoint, AutomationParam,
  defaultEffectChain, DEFAULT_SYNTH,
} from '../types'
import { TRACK_COLORS, DEFAULTS } from '../constants'

interface DAWState {
  tracks:          DAWTrack[]
  transport:       TransportState
  automationLanes: AutomationLane[]
  selectedTrackId: string | null
  selectedClipId:  string | null
  zoom:            number

  // Track mutations
  addAudioTrack: () => void
  addMidiTrack:  () => void
  removeTrack:   (trackId: string) => void
  updateTrack:   (trackId: string, patch: Partial<Omit<AudioTrack | MidiTrack, 'id' | 'type'>>) => void
  selectTrack:   (trackId: string | null) => void

  // Audio clip mutations
  addClip:    (trackId: string, clip: Omit<AudioClip, 'id'>) => string
  removeClip: (trackId: string, clipId: string) => void
  updateClip: (trackId: string, clipId: string, patch: Partial<AudioClip>) => void
  moveClip:   (trackId: string, clipId: string, newStart: number) => void
  duplicateClip: (trackId: string, clipId: string) => void
  selectClip: (clipId: string | null) => void

  // MIDI clip mutations
  addMidiClip:    (trackId: string, clip: Omit<MidiClip, 'id'>) => string
  removeMidiClip: (trackId: string, clipId: string) => void
  updateMidiClip: (trackId: string, clipId: string, patch: Partial<MidiClip>) => void
  addMidiNote:    (trackId: string, clipId: string, note: Omit<MidiNote, 'id'>) => void
  updateMidiNote: (trackId: string, clipId: string, noteId: string, patch: Partial<Omit<MidiNote, 'id'>>) => void
  removeMidiNote: (trackId: string, clipId: string, noteId: string) => void

  // Effects
  updateEffects:  (trackId: string, patch: Partial<EffectChain>) => void
  updateSynth:    (trackId: string, patch: Partial<SynthPreset>) => void

  // Automation
  addAutomationLane:       (trackId: string, param: AutomationParam) => void
  removeAutomationLane:    (laneId: string) => void
  toggleAutomationEnabled: (laneId: string) => void
  addAutomationPoint:      (laneId: string, point: Omit<AutomationPoint, 'id'>) => void
  updateAutomationPoint:   (laneId: string, pointId: string, patch: Partial<Omit<AutomationPoint,'id'>>) => void
  removeAutomationPoint:   (laneId: string, pointId: string) => void

  // Transport
  setBPM:       (bpm: number) => void
  setLoop:      (start: number, end: number) => void
  toggleLoop:   () => void
  toggleSnap:   () => void
  setSnapBeats: (beats: number) => void

  // Zoom
  setZoom: (z: number) => void

  // Project
  reset:       () => void
  loadTracks:  (tracks: DAWTrack[]) => void
  getSaveable: () => DAWTrack[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextColor(tracks: DAWTrack[]): string {
  return TRACK_COLORS[tracks.length % TRACK_COLORS.length]
}

function makeAudioTrack(tracks: DAWTrack[]): AudioTrack {
  return {
    id:      uuid(),
    type:    'audio',
    name:    `Track ${tracks.length + 1}`,
    color:   nextColor(tracks),
    volume:  DEFAULTS.VOLUME,
    pan:     0,
    muted:   false,
    soloed:  false,
    effects: defaultEffectChain(),
    clips:   [],
  }
}

function makeMidiTrack(tracks: DAWTrack[]): MidiTrack {
  return {
    id:      uuid(),
    type:    'midi',
    name:    `MIDI ${tracks.length + 1}`,
    color:   nextColor(tracks),
    volume:  DEFAULTS.VOLUME,
    pan:     0,
    muted:   false,
    soloed:  false,
    effects: defaultEffectChain(),
    clips:   [],
    synth:   { ...DEFAULT_SYNTH },
  }
}

/** Snap a time value to the nearest beat grid. */
export function snapTime(t: number, bpm: number, snapBeats: number): number {
  const secPerBeat = 60 / bpm
  const grid = snapBeats * secPerBeat
  return Math.round(t / grid) * grid
}

const initialTransport: TransportState = {
  bpm:           DEFAULTS.BPM,
  loopEnabled:   false,
  loopStart:     0,
  loopEnd:       8,
  timeSignature: [4, 4],
  snapEnabled:   true,
  snapBeats:     0.5,   // 1/8 note default
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDAWStore = create<DAWState>()(
  temporal(
    (set, get) => ({
      tracks:          [],
      transport:       initialTransport,
      automationLanes: [],
      selectedTrackId: null,
      selectedClipId:  null,
      zoom:            DEFAULTS.PIXELS_PER_SECOND,

      // ── Tracks ──────────────────────────────────────────────────────────────

      addAudioTrack: () =>
        set(s => ({ tracks: [...s.tracks, makeAudioTrack(s.tracks)] })),

      addMidiTrack: () =>
        set(s => ({ tracks: [...s.tracks, makeMidiTrack(s.tracks)] })),

      removeTrack: (trackId) =>
        set(s => ({
          tracks:          s.tracks.filter(t => t.id !== trackId),
          selectedTrackId: s.selectedTrackId === trackId ? null : s.selectedTrackId,
          automationLanes: s.automationLanes.filter(l => l.trackId !== trackId),
        })),

      updateTrack: (trackId, patch) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId ? { ...t, ...patch } as DAWTrack : t
          ),
        })),

      selectTrack: (trackId) => set({ selectedTrackId: trackId }),

      // ── Audio clips ─────────────────────────────────────────────────────────

      addClip: (trackId, clip) => {
        const id = uuid()
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'audio'
              ? { ...t, clips: [...t.clips, { ...clip, id }] }
              : t
          ),
        }))
        return id
      },

      removeClip: (trackId, clipId) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'audio'
              ? { ...t, clips: t.clips.filter(c => c.id !== clipId) }
              : t
          ),
          selectedClipId: get().selectedClipId === clipId ? null : get().selectedClipId,
        })),

      updateClip: (trackId, clipId, patch) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'audio'
              ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...patch } : c) }
              : t
          ),
        })),

      moveClip: (trackId, clipId, newStart) => {
        const { transport } = get()
        const t = transport.snapEnabled
          ? snapTime(newStart, transport.bpm, transport.snapBeats)
          : newStart
        set(s => ({
          tracks: s.tracks.map(tr =>
            tr.id === trackId && tr.type === 'audio'
              ? { ...tr, clips: tr.clips.map(c => c.id === clipId ? { ...c, startTime: Math.max(0, t) } : c) }
              : tr
          ),
        }))
      },

      duplicateClip: (trackId, clipId) =>
        set(s => ({
          tracks: s.tracks.map(t => {
            if (t.id !== trackId || t.type !== 'audio') return t
            const src = t.clips.find(c => c.id === clipId)
            if (!src) return t
            const effectiveDur = (src.trimEnd || src.duration) - src.trimStart
            const copy: AudioClip = { ...src, id: uuid(), startTime: src.startTime + effectiveDur }
            return { ...t, clips: [...t.clips, copy] }
          }),
        })),

      selectClip: (clipId) => set({ selectedClipId: clipId }),

      // ── MIDI clips ──────────────────────────────────────────────────────────

      addMidiClip: (trackId, clip) => {
        const id = uuid()
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'midi'
              ? { ...t, clips: [...t.clips, { ...clip, id }] }
              : t
          ),
        }))
        return id
      },

      removeMidiClip: (trackId, clipId) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'midi'
              ? { ...t, clips: t.clips.filter(c => c.id !== clipId) }
              : t
          ),
        })),

      updateMidiClip: (trackId, clipId, patch) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'midi'
              ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...patch } : c) }
              : t
          ),
        })),

      addMidiNote: (trackId, clipId, note) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'midi'
              ? {
                  ...t,
                  clips: t.clips.map(c =>
                    c.id === clipId
                      ? { ...c, notes: [...c.notes, { ...note, id: uuid() }] }
                      : c
                  ),
                }
              : t
          ),
        })),

      updateMidiNote: (trackId, clipId, noteId, patch) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'midi'
              ? {
                  ...t,
                  clips: t.clips.map(c =>
                    c.id === clipId
                      ? { ...c, notes: c.notes.map(n => n.id === noteId ? { ...n, ...patch } : n) }
                      : c
                  ),
                }
              : t
          ),
        })),

      removeMidiNote: (trackId, clipId, noteId) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'midi'
              ? {
                  ...t,
                  clips: t.clips.map(c =>
                    c.id === clipId
                      ? { ...c, notes: c.notes.filter(n => n.id !== noteId) }
                      : c
                  ),
                }
              : t
          ),
        })),

      // ── Effects ─────────────────────────────────────────────────────────────

      updateEffects: (trackId, patch) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId ? { ...t, effects: { ...t.effects, ...patch } } : t
          ),
        })),

      updateSynth: (trackId, patch) =>
        set(s => ({
          tracks: s.tracks.map(t =>
            t.id === trackId && t.type === 'midi'
              ? { ...t, synth: { ...t.synth, ...patch } }
              : t
          ),
        })),

      // ── Automation ──────────────────────────────────────────────────────────

      addAutomationLane: (trackId, param) =>
        set(s => ({
          automationLanes: [
            ...s.automationLanes,
            { id: uuid(), trackId, param, enabled: true, points: [] },
          ],
        })),

      removeAutomationLane: (laneId) =>
        set(s => ({ automationLanes: s.automationLanes.filter(l => l.id !== laneId) })),

      toggleAutomationEnabled: (laneId) =>
        set(s => ({
          automationLanes: s.automationLanes.map(l =>
            l.id === laneId ? { ...l, enabled: !l.enabled } : l
          ),
        })),

      addAutomationPoint: (laneId, point) =>
        set(s => ({
          automationLanes: s.automationLanes.map(l =>
            l.id === laneId
              ? {
                  ...l,
                  points: [...l.points, { ...point, id: uuid() }]
                    .sort((a, b) => a.time - b.time),
                }
              : l
          ),
        })),

      updateAutomationPoint: (laneId, pointId, patch) =>
        set(s => ({
          automationLanes: s.automationLanes.map(l =>
            l.id === laneId
              ? {
                  ...l,
                  points: l.points
                    .map(p => p.id === pointId ? { ...p, ...patch } : p)
                    .sort((a, b) => a.time - b.time),
                }
              : l
          ),
        })),

      removeAutomationPoint: (laneId, pointId) =>
        set(s => ({
          automationLanes: s.automationLanes.map(l =>
            l.id === laneId
              ? { ...l, points: l.points.filter(p => p.id !== pointId) }
              : l
          ),
        })),

      // ── Transport ───────────────────────────────────────────────────────────

      setBPM: (bpm) =>
        set(s => ({ transport: { ...s.transport, bpm: Math.max(20, Math.min(300, bpm)) } })),

      setLoop: (start, end) =>
        set(s => ({ transport: { ...s.transport, loopStart: start, loopEnd: end } })),

      toggleLoop: () =>
        set(s => ({ transport: { ...s.transport, loopEnabled: !s.transport.loopEnabled } })),

      toggleSnap: () =>
        set(s => ({ transport: { ...s.transport, snapEnabled: !s.transport.snapEnabled } })),

      setSnapBeats: (beats) =>
        set(s => ({ transport: { ...s.transport, snapBeats: beats } })),

      // ── Zoom ────────────────────────────────────────────────────────────────

      setZoom: (z) => set({ zoom: Math.max(DEFAULTS.MIN_ZOOM, Math.min(DEFAULTS.MAX_ZOOM, z)) }),

      // ── Project ─────────────────────────────────────────────────────────────

      reset: () => set({
        tracks: [], automationLanes: [], transport: initialTransport,
        selectedTrackId: null, selectedClipId: null,
      }),

      loadTracks: (tracks) => set({ tracks }),

      getSaveable: () => get().tracks,
    }),
    {
      // Only track state that matters for undo — exclude UI selections & zoom
      partialize: (s) => ({
        tracks:          s.tracks,
        automationLanes: s.automationLanes,
        transport:       s.transport,
      }),
      // Collapse rapid continuous changes (e.g. dragging a clip) into one step
      handleSet: (handleSet) => {
        let timer: ReturnType<typeof setTimeout> | null = null
        return (state) => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => handleSet(state), 200)
        }
      },
      limit: 50,
    }
  )
)

// Expose undo/redo helpers on the store object for convenience
export const undo = () => useDAWStore.temporal.getState().undo()
export const redo = () => useDAWStore.temporal.getState().redo()
