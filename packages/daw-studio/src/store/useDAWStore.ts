import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  DAWTrack, AudioTrack, MidiTrack,
  AudioClip, MidiClip, MidiNote,
  TransportState, EffectChain, SynthPreset,
  AutomationLane, AutomationPoint, AutomationParam,
  defaultEffectChain, DEFAULT_SYNTH,
} from '../types'
import { TRACK_COLORS, DEFAULTS } from '../constants'

// Use the built-in crypto.randomUUID() instead of the `uuid` package — drops a
// dependency and matches its behaviour (RFC 4122 v4 UUIDs).  Available in all
// evergreen browsers and Node ≥ 19.
const uuid = () => crypto.randomUUID()

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
  useDAWStore.setState({
    tracks: prev.tracks, automationLanes: prev.automationLanes, transport: prev.transport,
    dirty: true,
  })
}

export function redo() {
  const next = _future.pop()
  if (!next) return
  const current = snapshot(useDAWStore.getState())
  _past.push(current)
  useDAWStore.setState({
    tracks: next.tracks, automationLanes: next.automationLanes, transport: next.transport,
    dirty: true,
  })
}

// ── Store ─────────────────────────────────────────────────────────────────────

// ── Clipboard ─────────────────────────────────────────────────────────────────
interface ClipboardItem {
  type:             'audio' | 'midi'
  trackId:          string
  clipSnapshot:     Omit<AudioClip | MidiClip, 'id'>
  offsetFromAnchor: number   // seconds from earliest selected clip's startTime
}

interface DAWState {
  tracks:           DAWTrack[]
  transport:        TransportState
  automationLanes:  AutomationLane[]
  selectedTrackId:  string | null
  selectedClipId:   string | null   // primary selection (for piano roll)
  selectedClipIds:  string[]        // multi-selection (superset of selectedClipId)
  clipboard:        ClipboardItem[] | null
  zoom:             number
  trackHeight:      number

  // Track mutations
  addAudioTrack:  () => void
  addMidiTrack:   () => void
  removeTrack:    (trackId: string) => void
  updateTrack:    (trackId: string, patch: Partial<Omit<AudioTrack | MidiTrack, 'id' | 'type'>>) => void
  selectTrack:    (trackId: string | null) => void
  reorderTracks:  (fromId: string, toId: string) => void

  // Audio clip mutations
  addClip:              (trackId: string, clip: Omit<AudioClip, 'id'>) => string
  removeClip:           (trackId: string, clipId: string) => void
  updateClip:           (trackId: string, clipId: string, patch: Partial<AudioClip>) => void
  moveClip:             (trackId: string, clipId: string, newStart: number) => void
  moveSelectedClips:    (anchorClipId: string, newAnchorStart: number) => void
  commitSelectedClipsMove: () => void
  duplicateClip:        (trackId: string, clipId: string) => void
  selectClip:           (clipId: string | null) => void
  selectClipsInRect:    (ids: string[]) => void
  toggleClipSelection:  (clipId: string) => void
  selectAllClipsOnTrack:(trackId: string) => void
  copySelectedClips:    () => void
  pasteClips:           () => void

  // MIDI clip mutations
  addMidiClip:    (trackId: string, clip: Omit<MidiClip, 'id'>) => string
  removeMidiClip: (trackId: string, clipId: string) => void
  updateMidiClip: (trackId: string, clipId: string, patch: Partial<MidiClip>) => void
  addMidiNote:    (trackId: string, clipId: string, note: Omit<MidiNote, 'id'>) => void
  updateMidiNote: (trackId: string, clipId: string, noteId: string, patch: Partial<Omit<MidiNote, 'id'>>) => void
  removeMidiNote: (trackId: string, clipId: string, noteId: string) => void

  // Instrument (soundfont sampler)
  setInstrument:    (trackId: string, instrumentId: string | null) => void
  replaceMidiNotes: (trackId: string, clipId: string, notes: Omit<MidiNote, 'id'>[]) => void

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
  setBPM:            (bpm: number) => void
  setTimeSignature:  (sig: [number, number]) => void
  setLoop:           (start: number, end: number) => void
  toggleLoop:   () => void
  toggleSnap:   () => void
  setSnapBeats: (beats: number) => void

  // Zoom
  setZoom: (z: number) => void
  setTrackHeight: (h: number) => void

  // UI (kalıcı değil, undo'ya girmez)
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void

  // Project
  reset:         () => void
  loadTracks:    (tracks: DAWTrack[]) => void
  loadTransport: (patch: Partial<TransportState>) => void
  getSaveable:   () => DAWTrack[]

  /** True if the project has unsaved mutations. Drives the beforeunload
   *  "you have unsaved changes" prompt in the host. */
  dirty:         boolean
  /** Mark the project as clean (host calls this immediately after persisting). */
  markSaved:     () => void
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
    synth:      { ...DEFAULT_SYNTH },
    instrument: null,
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

export const useDAWStore = create<DAWState>()(subscribeWithSelector((set, get) => {
  /** Wrap set: push history before applying undoable changes.
   *  Also marks the project as dirty so the host can prompt for unsaved
   *  changes on close/navigation. */
  function record(fn: (s: DAWState) => Partial<DAWState>) {
    pushHistory(snapshot(get()))
    const patch = fn(get()) as Partial<DAWState>
    set({ ...patch, dirty: true })
  }

  return {
    tracks:          [],
    transport:       initialTransport,
    automationLanes: [],
    selectedTrackId: null,
    selectedClipId:  null,
    selectedClipIds: [],
    clipboard:       null,
    zoom:            DEFAULTS.PIXELS_PER_SECOND,
    trackHeight:     DEFAULTS.TRACK_HEIGHT,
    dirty:           false,

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

    reorderTracks: (fromId, toId) =>
      record(s => {
        const tracks  = [...s.tracks]
        const fromIdx = tracks.findIndex(t => t.id === fromId)
        const toIdx   = tracks.findIndex(t => t.id === toId)
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return {}
        const [moved] = tracks.splice(fromIdx, 1)
        tracks.splice(toIdx, 0, moved)
        return { tracks }
      }),

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
        selectedClipId:  s.selectedClipId  === clipId ? null : s.selectedClipId,
        selectedClipIds: s.selectedClipIds.filter(id => id !== clipId),
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

    // ── Multi-clip drag (live, no undo record — call commitSelectedClipsMove on mouseup) ──
    moveSelectedClips: (anchorClipId, newAnchorStart) => {
      const { tracks, selectedClipIds, transport } = get()

      // Find anchor's current start
      let anchorCurrent = 0
      for (const t of tracks) {
        if (t.type === 'audio') {
          const c = t.clips.find(c => c.id === anchorClipId)
          if (c) { anchorCurrent = c.startTime; break }
        }
      }

      const snapped = transport.snapEnabled
        ? snapTime(newAnchorStart, transport.bpm, transport.snapBeats)
        : newAnchorStart
      const delta = snapped - anchorCurrent
      if (Math.abs(delta) < 0.0001) return

      // Clamp so nothing goes below t=0
      let minStart = Infinity
      for (const t of tracks) {
        for (const c of (t.type === 'audio' ? t.clips : [])) {
          if (selectedClipIds.includes(c.id) && c.startTime < minStart) minStart = c.startTime
        }
      }
      const d = Math.max(delta, -minStart)

      set(s => ({
        tracks: s.tracks.map(t =>
          t.type !== 'audio' ? t : {
            ...t,
            clips: t.clips.map(c =>
              selectedClipIds.includes(c.id) ? { ...c, startTime: c.startTime + d } : c
            ),
          }
        ),
      }))
    },

    // Call on mouseup to push final positions into undo history
    commitSelectedClipsMove: () => {
      record(s => ({ tracks: s.tracks }))
    },

    // Marquee result: select exactly these clip ids
    selectClipsInRect: (ids) => set({
      selectedClipIds: ids,
      selectedClipId:  ids[ids.length - 1] ?? null,
    }),

    selectClip: (clipId) => set({
      selectedClipId:  clipId,
      selectedClipIds: clipId ? [clipId] : [],
    }),

    // Shift+click — add/remove from multi-selection without clearing others
    toggleClipSelection: (clipId) => set(s => {
      const already = s.selectedClipIds.includes(clipId)
      const next    = already
        ? s.selectedClipIds.filter(id => id !== clipId)
        : [...s.selectedClipIds, clipId]
      return {
        selectedClipIds: next,
        // Keep primary selectedClipId if it's still in the set; otherwise use last
        selectedClipId: next.includes(s.selectedClipId ?? '') ? s.selectedClipId : (next[next.length - 1] ?? null),
      }
    }),

    // Ctrl+A — select all clips on a track
    selectAllClipsOnTrack: (trackId) => set(s => {
      const track = s.tracks.find(t => t.id === trackId)
      if (!track) return {}
      const ids = track.type === 'audio'
        ? track.clips.map(c => c.id)
        : track.type === 'midi' ? track.clips.map(c => c.id) : []
      return {
        selectedClipIds: ids,
        selectedClipId:  ids[ids.length - 1] ?? null,
      }
    }),

    // Ctrl+C — snapshot selected clips into clipboard
    copySelectedClips: () => {
      const { tracks, selectedClipIds } = get()
      if (selectedClipIds.length === 0) return

      const items: ClipboardItem[] = []
      let minStart = Infinity

      for (const track of tracks) {
        const clips = track.type === 'audio'
          ? track.clips.filter(c => selectedClipIds.includes(c.id))
          : track.type === 'midi'
            ? track.clips.filter(c => selectedClipIds.includes(c.id))
            : []
        for (const clip of clips) {
          if (clip.startTime < minStart) minStart = clip.startTime
        }
      }

      for (const track of tracks) {
        const clips = track.type === 'audio'
          ? track.clips.filter(c => selectedClipIds.includes(c.id))
          : track.type === 'midi'
            ? track.clips.filter(c => selectedClipIds.includes(c.id))
            : []
        for (const clip of clips) {
          const { id: _id, ...rest } = clip as AudioClip & { id: string }
          items.push({
            type:             track.type as 'audio' | 'midi',
            trackId:          track.id,
            clipSnapshot:     rest,
            offsetFromAnchor: clip.startTime - minStart,
          })
        }
      }

      set({ clipboard: items })
    },

    // Ctrl+V — paste clipboard clips right after the last selected clip
    pasteClips: () => {
      const { tracks, selectedClipIds, clipboard } = get()
      if (!clipboard || clipboard.length === 0) return

      // Find the end of the current selection to use as paste anchor
      let anchorEnd = 0
      for (const track of tracks) {
        const clips = track.type === 'audio'
          ? track.clips.filter(c => selectedClipIds.includes(c.id))
          : track.type === 'midi'
            ? track.clips.filter(c => selectedClipIds.includes(c.id))
            : []
        for (const clip of clips) {
          const end = clip.startTime + (
            (clip as AudioClip).trimEnd !== undefined
              ? (clip as AudioClip).duration - (clip as AudioClip).trimStart - (clip as AudioClip).trimEnd
              : (clip as MidiClip).durationBeats ?? clip.startTime
          )
          if (end > anchorEnd) anchorEnd = end
        }
      }
      // Fallback: if nothing selected, paste after the last clip on any track
      if (anchorEnd === 0) {
        for (const track of tracks) {
          const clips = track.type === 'audio' ? track.clips : track.type === 'midi' ? track.clips : []
          for (const clip of clips) {
            const end = clip.startTime + ((clip as AudioClip).duration ?? 0)
            if (end > anchorEnd) anchorEnd = end
          }
        }
      }

      const newIds: string[] = []
      record(s => {
        const nextTracks = s.tracks.map(track => {
          const trackItems = clipboard.filter(item => item.trackId === track.id)
          if (trackItems.length === 0) return track

          if (track.type === 'audio') {
            const newClips = trackItems.map(item => {
              const id  = uuid()
              newIds.push(id)
              return { ...(item.clipSnapshot as Omit<AudioClip, 'id'>), id, startTime: anchorEnd + item.offsetFromAnchor }
            })
            return { ...track, clips: [...track.clips, ...newClips] }
          }
          if (track.type === 'midi') {
            const newClips = trackItems.map(item => {
              const id  = uuid()
              newIds.push(id)
              return { ...(item.clipSnapshot as Omit<MidiClip, 'id'>), id, startTime: anchorEnd + item.offsetFromAnchor }
            })
            return { ...track, clips: [...track.clips, ...newClips] }
          }
          return track
        })
        return { tracks: nextTracks }
      })

      // Select the newly pasted clips
      set({ selectedClipIds: newIds, selectedClipId: newIds[newIds.length - 1] ?? null })
    },

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

    setInstrument: (trackId, instrumentId) =>
      record(s => ({
        tracks: s.tracks.map(t =>
          t.id === trackId && t.type === 'midi'
            ? { ...t, instrument: instrumentId }
            : t
        ),
      })),

    replaceMidiNotes: (trackId, clipId, notes) =>
      record(s => ({
        tracks: s.tracks.map(t => {
          if (t.id !== trackId || t.type !== 'midi') return t
          return {
            ...t,
            clips: t.clips.map(c => {
              if (c.id !== clipId) return c
              // Preserve stable note IDs across refactor calls where possible:
              // reuse the clip's existing ID per index so React keys/virtual-
              // isation that relies on note ids stay alive. New indices get a
              // fresh uuid; extras beyond the previous count also get a fresh id.
              const prevIds = c.notes.map(n => n.id)
              const nextNotes = notes.map((n, i) => ({
                ...n,
                id: prevIds[i] ?? uuid(),
              }))
              return { ...c, notes: nextNotes }
            }),
          }
        }),
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
      set(s => ({ transport: { ...s.transport, bpm: Math.max(40, Math.min(300, bpm)) } })),

    setTimeSignature: (sig) =>
      set(s => ({ transport: { ...s.transport, timeSignature: sig } })),

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
    setTrackHeight: (h) => set({ trackHeight: Math.max(DEFAULTS.MIN_TRACK_HEIGHT, Math.min(DEFAULTS.MAX_TRACK_HEIGHT, Math.round(h))) }),

    // ── UI ────────────────────────────────────────────────────────────────────

    shortcutsOpen: false,
    setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

    // ── Project ───────────────────────────────────────────────────────────────

    reset: () => {
      _past.length = 0
      _future.length = 0
      set({ tracks: [], automationLanes: [], transport: initialTransport, selectedTrackId: null, selectedClipId: null, selectedClipIds: [], clipboard: null, dirty: false })
    },

    loadTracks: (tracks) => set({ tracks, dirty: false }),

    loadTransport: (patch) =>
      set(s => ({ transport: { ...s.transport, ...patch } })),

    getSaveable: () => get().tracks,

    markSaved: () => set({ dirty: false }),
  }
}))
