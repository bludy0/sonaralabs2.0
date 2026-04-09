import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { DAWTrack, AudioClip, TransportState, DEFAULT_EFFECTS, DEFAULT_SYNTH_PRESET } from '../types'

const TRACK_COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#f97316','#06b6d4']

interface DAWState {
  tracks: DAWTrack[]
  transport: TransportState
  selectedTrackId: string | null
  selectedClipId: string | null
  zoom: number  // pixels per second
  masterVolume: number

  // Track actions
  addTrack: (name?: string) => string
  removeTrack: (id: string) => void
  updateTrack: (id: string, patch: Partial<DAWTrack>) => void

  // Clip actions
  addClip: (trackId: string, name: string, audioUrl: string, buffer?: AudioBuffer) => string
  removeClip: (trackId: string, clipId: string) => void
  updateClip: (trackId: string, clipId: string, patch: Partial<AudioClip>) => void
  moveClip: (trackId: string, clipId: string, startTime: number) => void

  // Transport
  setPlaying: (v: boolean) => void
  setCurrentTime: (t: number) => void
  setBPM: (bpm: number) => void
  toggleLoop: () => void
  setLoopRange: (start: number, end: number) => void

  // Selection
  selectTrack: (id: string | null) => void
  selectClip: (id: string | null) => void

  // Zoom & master
  setZoom: (z: number) => void
  setMasterVolume: (v: number) => void

  // Lifecycle
  reset: () => void
  loadTracks: (tracks: { name: string; audioUrl: string }[]) => void
}

const INITIAL_TRANSPORT: TransportState = {
  bpm: 120, isPlaying: false, isRecording: false, currentTime: 0,
  loopStart: 0, loopEnd: 8, loopEnabled: false, timeSignatureNum: 4, timeSignatureDen: 4,
}

export const useDAWStore = create<DAWState>((set, get) => ({
  tracks: [],
  transport: { ...INITIAL_TRANSPORT },
  selectedTrackId: null,
  selectedClipId: null,
  zoom: 80,
  masterVolume: 0.8,

  addTrack: (name) => {
    const id = uuidv4()
    set(s => ({
      tracks: [...s.tracks, {
        id,
        name: name ?? `Track ${s.tracks.length + 1}`,
        color: TRACK_COLORS[s.tracks.length % TRACK_COLORS.length],
        type: 'audio' as const,
        clips: [],
        midiClips: [],
        synthPreset: { ...DEFAULT_SYNTH_PRESET },
        volume: 0.8,
        pan: 0,
        muted: false,
        soloed: false,
        effects: DEFAULT_EFFECTS(),
      }]
    }))
    return id
  },

  removeTrack: (id) => set(s => ({ tracks: s.tracks.filter(t => t.id !== id) })),

  updateTrack: (id, patch) => set(s => ({
    tracks: s.tracks.map(t => t.id === id ? { ...t, ...patch } : t)
  })),

  addClip: (trackId, name, audioUrl, buffer) => {
    const id = uuidv4()
    set(s => ({
      tracks: s.tracks.map(t => {
        if (t.id !== trackId) return t
        const maxEnd = t.clips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0)
        const dur = buffer ? buffer.duration : 0
        const clip: AudioClip = {
          id, trackId, name, audioUrl,
          buffer: buffer ?? null,
          startTime: maxEnd,
          duration: dur,
          trimStart: 0,
          trimEnd: dur,
        }
        return { ...t, clips: [...t.clips, clip] }
      })
    }))
    return id
  },

  removeClip: (trackId, clipId) => set(s => ({
    tracks: s.tracks.map(t =>
      t.id === trackId ? { ...t, clips: t.clips.filter(c => c.id !== clipId) } : t
    )
  })),

  updateClip: (trackId, clipId, patch) => set(s => ({
    tracks: s.tracks.map(t =>
      t.id === trackId
        ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...patch } : c) }
        : t
    )
  })),

  moveClip: (trackId, clipId, startTime) => set(s => ({
    tracks: s.tracks.map(t =>
      t.id === trackId
        ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, startTime: Math.max(0, startTime) } : c) }
        : t
    )
  })),

  setPlaying: (v) => set(s => ({ transport: { ...s.transport, isPlaying: v } })),
  setCurrentTime: (t) => set(s => ({ transport: { ...s.transport, currentTime: t } })),
  setBPM: (bpm) => set(s => ({ transport: { ...s.transport, bpm } })),
  toggleLoop: () => set(s => ({ transport: { ...s.transport, loopEnabled: !s.transport.loopEnabled } })),
  setLoopRange: (start, end) => set(s => ({ transport: { ...s.transport, loopStart: start, loopEnd: end } })),

  selectTrack: (id) => set({ selectedTrackId: id }),
  selectClip: (id) => set({ selectedClipId: id }),
  setZoom: (z) => set({ zoom: z }),
  setMasterVolume: (v) => set({ masterVolume: v }),

  reset: () => set({
    tracks: [],
    transport: { ...INITIAL_TRANSPORT },
    selectedTrackId: null,
    selectedClipId: null,
    zoom: 80,
    masterVolume: 0.8,
  }),

  loadTracks: (tracks) => {
    const { addTrack, addClip } = get()
    tracks.forEach(t => {
      const trackId = addTrack(t.name)
      addClip(trackId, t.name, t.audioUrl)
    })
  },
}))
