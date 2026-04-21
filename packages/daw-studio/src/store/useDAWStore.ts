import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import {
  DAWTrack, AudioTrack, MidiTrack,
  AudioClip, MidiClip, MidiNote,
  TransportState, EffectChain, SynthPreset,
  AutomationLane, AutomationPoint, AutomationParam,
  defaultEffectChain, DEFAULT_SYNTH,
} from '../types'
import { TRACK_COLORS, DEFAULTS } from '../constants'

// ── Undo / Redo history (outside Zustand — no re-renders) ────────────────────

interface Snapshot {
  tracks:          DAWTrack[]
  automationLanes: AutomationLane[]
  transport:       TransportState
}

const MAX_HISTORY = 50
const _past:   Snapshot[] = []
const _future: Snapshot[] = []
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

function snapshot(s: DAWState): Snapshot {
  return {
    tracks:          s.tracks,
    automationLanes: s.automationLanes,
    transport:       s.transport,
  }
}

/** Call before every mutation that should be undoable. */
function pushHistory(current: Snapshot) {
  if (_debounceTimer) return   // collapse rapid changes (drag) into one step
  _debounceTimer = setTimeout(() => { _debounceTimer = null }, 200)

  _past.push(current)
  if (_past.length > MAX_HISTORY) _past.shift()
  _future.length = 0   // clear redo stack on new action
}

export function undo() {
  const prev = _past.pop()
  if (!prev) return
  const current = snapshot(useDAWStore.getState())
  _future.push(current)
  useDAWStore.setState({ tracks: prev.tracks, automationLanes: prev.automationLanes, transport: prev.transport })
}

export function redo() {
  const next = _future.pop()
  if (!next) return
  const current = snapshot(useDAWStore.getState())
  _past.push(current)
  useDAWStore.setState({ tracks: next.tracks, automationLanes: next.automationLanes, transport: next.transport })
}

// ── Store ─────────────────────────────────────────────────────────────────────

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
  addClip:       (trackId: string, clip: Omit<AudioClip, 'id'>) => string
  removeClip:    (trackId: string, clipId: string) => void
  updateClip:    (trackId: string, clipId: string, patch: Partial<AudioClip>) => void
  moveClip:      (trackId: string, clipId: string, newStart: number) => void
  duplicateClip: (trackId: string, clipId: string) => void
  selectClip:    (clipId: string | null) => void

  // MIDI clip mutations
  addMidiClip:    (trackId: string, clip: Omit<MidiClip, 'id'>) => string
  removeMidiClip: (trackId: string, clipId: string) => void
  updateMidiClip: (trackId: string, clipId: string, patch: Partial<MidiClip>) => void
  addMidiNote:    (trackId: string, clipId: string, note: Omit<MidiNote, 'id'>) => void
  updateMidiNote: (trackId: string, clipId: string, noteId: string, patch: Partial<Omit<MidiNote, 'id'>>) => void
  removeMidiNote: (trackId: string, clipId: string, noteId: string) => void

  // Effects
  updateEffects: (trackId: string, patch: Partial<EffectChain>) => void
  updateSynth:   (trackId: string, patch: Partial<SynthPreset>) => void

  // Automation
  addAutomationLane:       (trackId: string, param: AutomationParam) => void
  removeAutomationLane:    (laneId: string) => void
  toggleAutomationEnabled: (laneId: string) => void
  addAutomationPoint:      (laneId: string, point: Omit<AutomationPoint, 'id'>) => void
  updateAutomationPoint:   (laneId: string, pointId: string, patch: Partial<Omit<AutomationPoint, 'id'>>) => void
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
    id: uuid(), type: 'audio',
    name: `Track ${tracks.length + 1}`,
    color: nextColor(tracks),
    volume: DEFAULTS.VOLUME, pan: 0,
    muted: false, soloed: false,
    effects: defaultEffectChain(),
    clips: [],
  }
}

function makeMidiTrack(tracks: DAWTrack[]): MidiTrack {
  return {
    id: uuid(), type: 'midi',
    name: `MIDI ${tracks.length + 1}`,
    color: nextColor(tracks),
    volume: DEFAULTS.VOLUME, pan: 0,
    muted: false, soloed: false,
    effects: defaultEffectChain(),
    clips: [],
    synth: { ...DEFAULT_SYNTH },
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
  snapBeats:     0.5,
}

// ── Zustand store ─────────────────────────────────────────────────────────────

export const useDAWStore = create<DAWState>((set, get) => {
  /** Wrap set: push history before applying undoable changes. */
  function record(fn: (s: DAWState) => Partial<DAWState>) {
    pushHistory(snapshot(get()))
    set(fn as Parameters<typeof set>[0])
  }

  return {
    tracks:          [],
    transport:       initialTransport,
    automationLanes: [],
    selectedTrackId: null,
    selectedClipId:  null,
    zoom:            DEFAULTS.PIXELS_PER_SECOND,

    // ── Tracks ────────────────────────────────────────────────────────────────

    addAudioTrack: () =>
      record(s => ({ tracks: [...s.tracks, makeAudioTrack(s.tracks)] })),

    addMidiTrack: () =>
      record(s => ({ tracks: [...s.tracks, makeMidiTrack(s.tracks)] })),

    removeTrack: (trackId) =>
      record(s => ({
        tracks:          s.tracks.filter(t => t.id !== trackId),
        selectedTrackId: s.selectedTrackId === trackId ? null : s.selectedTrackId,
        automationLanes: s.automationLanes.filter(l => l.trackId !== trackId),
      })),

    updateTrack: (trackId, patch) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId ? { ...t, ...patch } as DAWTrack : t
        ),
      })),

    selectTrack: (trackId) => set({ selectedTrackId: trackId }),

    // ── Audio clips ───────────────────────────────────────────────────────────

    addClip: (trackId, clip) => {
      const id = uuid()
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'audio'
            ? { ...t, clips: [...t.clips, { ...clip, id }] }
            : t
        ),
      }))
      return id
    },

    removeClip: (trackId, clipId) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'audio'
            ? { ...t, clips: t.clips.filter(c => c.id !== clipId) }
            : t
        ),
        selectedClipId: get().selectedClipId === clipId ? null : get().selectedClipId,
      })),

    updateClip: (trackId, clipId, patch) =>
      record(s => ({
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
      record(s => ({
        tracks: s.tracks.map(tr =>
          tr.id === trackId && tr.type === 'audio'
            ? { ...tr, clips: tr.clips.map(c => c.id === clipId ? { ...c, startTime: Math.max(0, t) } : c) }
            : tr
        ),
      }))
    },

    duplicateClip: (trackId, clipId) =>
      record(s => ({
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

    // ── MIDI clips ────────────────────────────────────────────────────────────

    addMidiClip: (trackId, clip) => {
      const id = uuid()
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'midi'
            ? { ...t, clips: [...t.clips, { ...clip, id }] }
            : t
        ),
      }))
      return id
    },

    removeMidiClip: (trackId, clipId) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'midi'
            ? { ...t, clips: t.clips.filter(c => c.id !== clipId) }
            : t
        ),
      })),

    updateMidiClip: (trackId, clipId, patch) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'midi'
            ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...patch } : c) }
            : t
        ),
      })),

    addMidiNote: (trackId, clipId, note) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'midi'
            ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, notes: [...c.notes, { ...note, id: uuid() }] } : c) }
            : t
        ),
      })),

    updateMidiNote: (trackId, clipId, noteId, patch) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'midi'
            ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, notes: c.notes.map(n => n.id === noteId ? { ...n, ...patch } : n) } : c) }
            : t
        ),
      })),

    removeMidiNote: (trackId, clipId, noteId) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'midi'
            ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, notes: c.notes.filter(n => n.id !== noteId) } : c) }
            : t
        ),
      })),

    // ── Effects ───────────────────────────────────────────────────────────────

    updateEffects: (trackId, patch) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId ? { ...t, effects: { ...t.effects, ...patch } } : t
        ),
      })),

    updateSynth: (trackId, patch) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'midi'
            ? { ...t, synth: { ...t.synth, ...patch } }
            : t
        ),
      })),

    // ── Automation ────────────────────────────────────────────────────────────

    addAutomationLane: (trackId, param) =>
      record(s => ({
        automationLanes: [...s.automationLanes, { id: uuid(), trackId, param, enabled: true, points: [] }],
      })),

    removeAutomationLane: (laneId) =>
      record(s => ({ automationLanes: s.automationLanes.filter(l => l.id !== laneId) })),

    toggleAutomationEnabled: (laneId) =>
      record(s => ({
        automationLanes: s.automationLanes.map(l =>
          l.id === laneId ? { ...l, enabled: !l.enabled } : l
        ),
      })),

    addAutomationPoint: (laneId, point) =>
      record(s => ({
        automationLanes: s.automationLanes.map(l =>
          l.id === laneId
            ? { ...l, points: [...l.points, { ...point, id: uuid() }].sort((a, b) => a.time - b.time) }
            : l
        ),
      })),

    updateAutomationPoint: (laneId, pointId, patch) =>
      record(s => ({
        automationLanes: s.automationLanes.map(l =>
          l.id === laneId
            ? { ...l, points: l.points.map(p => p.id === pointId ? { ...p, ...patch } : p).sort((a, b) => a.time - b.time) }
            : l
        ),
      })),

    removeAutomationPoint: (laneId, pointId) =>
      record(s => ({
        automationLanes: s.automationLanes.map(l =>
          l.id === laneId ? { ...l, points: l.points.filter(p => p.id !== pointId) } : l
        ),
      })),

    // ── Transport ─────────────────────────────────────────────────────────────

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

    // ── Zoom ──────────────────────────────────────────────────────────────────

    setZoom: (z) => set({ zoom: Math.max(DEFAULTS.MIN_ZOOM, Math.min(DEFAULTS.MAX_ZOOM, z)) }),

    // ── Project ───────────────────────────────────────────────────────────────

    reset: () => {
      _past.length = 0
      _future.length = 0
      set({ tracks: [], automationLanes: [], transport: initialTransport, selectedTrackId: null, selectedClipId: null })
    },

    loadTracks: (tracks) => set({ tracks }),

    getSaveable: () => get().tracks,
  }
})
