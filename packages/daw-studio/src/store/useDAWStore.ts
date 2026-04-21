import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import {
  DAWTrack, AudioTrack, MidiTrack,
  AudioClip, MidiClip, MidiNote,
  TransportState, EffectChain, SynthPreset,
  defaultEffectChain, DEFAULT_SYNTH,
} from '../types'
import { TRACK_COLORS, DEFAULTS } from '../constants'

interface DAWState {
  tracks:       DAWTrack[]
  transport:    TransportState
  selectedTrackId: string | null
  selectedClipId:  string | null
  zoom:         number   // pixels per second

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
  selectClip: (clipId: string | null) => void

  // MIDI clip mutations
  addMidiClip:    (trackId: string, clip: Omit<MidiClip, 'id'>) => string
  removeMidiClip: (trackId: string, clipId: string) => void
  updateMidiClip: (trackId: string, clipId: string, patch: Partial<MidiClip>) => void
  addMidiNote:    (trackId: string, clipId: string, note: Omit<MidiNote, 'id'>) => void
  removeMidiNote: (trackId: string, clipId: string, noteId: string) => void

  // Effects
  updateEffects:  (trackId: string, patch: Partial<EffectChain>) => void
  updateSynth:    (trackId: string, patch: Partial<SynthPreset>) => void

  // Transport
  setBPM:         (bpm: number) => void
  setLoop:        (start: number, end: number) => void
  toggleLoop:     () => void

  // Zoom
  setZoom:        (z: number) => void

  // Project
  reset:          () => void
  loadTracks:     (tracks: DAWTrack[]) => void
  getSaveable:    () => DAWTrack[]
}

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

const initialTransport: TransportState = {
  bpm:           DEFAULTS.BPM,
  loopEnabled:   false,
  loopStart:     0,
  loopEnd:       8,
  timeSignature: [4, 4],
}

export const useDAWStore = create<DAWState>((set, get) => ({
  tracks:          [],
  transport:       initialTransport,
  selectedTrackId: null,
  selectedClipId:  null,
  zoom:            DEFAULTS.PIXELS_PER_SECOND,

  // ── Tracks ────────────────────────────────────────────────────────────────

  addAudioTrack: () =>
    set(s => ({ tracks: [...s.tracks, makeAudioTrack(s.tracks)] })),

  addMidiTrack: () =>
    set(s => ({ tracks: [...s.tracks, makeMidiTrack(s.tracks)] })),

  removeTrack: (trackId) =>
    set(s => ({
      tracks:          s.tracks.filter(t => t.id !== trackId),
      selectedTrackId: s.selectedTrackId === trackId ? null : s.selectedTrackId,
    })),

  updateTrack: (trackId, patch) =>
    set(s => ({
      tracks: s.tracks.map(t =>
        t.id === trackId ? { ...t, ...patch } as DAWTrack : t
      ),
    })),

  selectTrack: (trackId) => set({ selectedTrackId: trackId }),

  // ── Audio clips ───────────────────────────────────────────────────────────

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

  moveClip: (trackId, clipId, newStart) =>
    set(s => ({
      tracks: s.tracks.map(t =>
        t.id === trackId && t.type === 'audio'
          ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, startTime: Math.max(0, newStart) } : c) }
          : t
      ),
    })),

  selectClip: (clipId) => set({ selectedClipId: clipId }),

  // ── MIDI clips ────────────────────────────────────────────────────────────

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

  // ── Effects ───────────────────────────────────────────────────────────────

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

  // ── Transport ─────────────────────────────────────────────────────────────

  setBPM: (bpm) =>
    set(s => ({ transport: { ...s.transport, bpm: Math.max(20, Math.min(300, bpm)) } })),

  setLoop: (start, end) =>
    set(s => ({ transport: { ...s.transport, loopStart: start, loopEnd: end } })),

  toggleLoop: () =>
    set(s => ({ transport: { ...s.transport, loopEnabled: !s.transport.loopEnabled } })),

  // ── Zoom ──────────────────────────────────────────────────────────────────

  setZoom: (z) => set({ zoom: Math.max(DEFAULTS.MIN_ZOOM, Math.min(DEFAULTS.MAX_ZOOM, z)) }),

  // ── Project ───────────────────────────────────────────────────────────────

  reset: () => set({ tracks: [], transport: initialTransport, selectedTrackId: null, selectedClipId: null }),

  loadTracks: (tracks) => set({ tracks }),

  getSaveable: () => get().tracks,
}))
