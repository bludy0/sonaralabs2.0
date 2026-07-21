import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useDAWStore, snapTime, undo, redo } from './useDAWStore'
import type { AudioTrack, MidiTrack } from '../types'

// pushHistory 200ms debounce kullanır — ayrı undo adımları için sahte saatle ilerletiyoruz
beforeEach(() => {
  vi.useFakeTimers()
  useDAWStore.getState().reset()
  vi.advanceTimersByTime(300)
})
afterEach(() => vi.useRealTimers())

function tick() { vi.advanceTimersByTime(300) }

const sampleClip = {
  name: 'clip', startTime: 0, duration: 4,
  trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0,
  buffer: null, url: 'blob:x',
}

describe('snapTime', () => {
  it('120 BPM, 0.5 beat grid → 0.25sn ızgaraya yuvarlar', () => {
    expect(snapTime(0.3, 120, 0.5)).toBeCloseTo(0.25)
    expect(snapTime(0.4, 120, 0.5)).toBeCloseTo(0.5)
  })
  it('60 BPM, 1 beat grid → tam saniyeye yuvarlar', () => {
    expect(snapTime(1.4, 60, 1)).toBeCloseTo(1)
    expect(snapTime(1.6, 60, 1)).toBeCloseTo(2)
  })
})

describe('track işlemleri', () => {
  it('audio/midi track ekler, renk ve isim sırayla atanır', () => {
    const s = useDAWStore.getState()
    s.addAudioTrack(); tick()
    s.addMidiTrack(); tick()
    const tracks = useDAWStore.getState().tracks
    expect(tracks).toHaveLength(2)
    expect(tracks[0].type).toBe('audio')
    expect(tracks[0].name).toBe('Track 1')
    expect(tracks[1].type).toBe('midi')
    expect(tracks[1].name).toBe('MIDI 2')
    expect(tracks[0].color).not.toBe(tracks[1].color)
  })

  it('removeTrack track ile birlikte automation lane\'lerini de siler', () => {
    const s = useDAWStore.getState()
    s.addAudioTrack(); tick()
    const trackId = useDAWStore.getState().tracks[0].id
    useDAWStore.getState().addAutomationLane(trackId, 'volume'); tick()
    expect(useDAWStore.getState().automationLanes).toHaveLength(1)

    useDAWStore.getState().removeTrack(trackId); tick()
    expect(useDAWStore.getState().tracks).toHaveLength(0)
    expect(useDAWStore.getState().automationLanes).toHaveLength(0)
  })
})

describe('clip işlemleri', () => {
  function withAudioTrack(): string {
    useDAWStore.getState().addAudioTrack(); tick()
    return useDAWStore.getState().tracks[0].id
  }

  it('addClip id döner ve clip track\'e eklenir', () => {
    const trackId = withAudioTrack()
    const id = useDAWStore.getState().addClip(trackId, { ...sampleClip }); tick()
    const track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips).toHaveLength(1)
    expect(track.clips[0].id).toBe(id)
  })

  it('moveClip snap açıkken grid\'e oturur, t<0 kliplenir', () => {
    const trackId = withAudioTrack()
    const id = useDAWStore.getState().addClip(trackId, { ...sampleClip }); tick()
    // varsayılan transport: 120 BPM, snap 0.5 beat → 0.25sn grid
    useDAWStore.getState().moveClip(trackId, id, 1.13); tick()
    let track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips[0].startTime).toBeCloseTo(1.25)

    useDAWStore.getState().moveClip(trackId, id, -3); tick()
    track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips[0].startTime).toBe(0)
  })

  it('duplicateClip kopyayı efektif sürenin sonuna yerleştirir', () => {
    const trackId = withAudioTrack()
    const id = useDAWStore.getState().addClip(trackId, { ...sampleClip, startTime: 1, duration: 4, trimStart: 1 }); tick()
    useDAWStore.getState().duplicateClip(trackId, id); tick()
    const track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips).toHaveLength(2)
    // efektif süre = (trimEnd||duration) - trimStart = 4 - 1 = 3 → yeni start 1+3
    expect(track.clips[1].startTime).toBe(4)
  })

  it('copy + paste seçili clipleri seçimin sonuna yapıştırır', () => {
    const trackId = withAudioTrack()
    const id = useDAWStore.getState().addClip(trackId, { ...sampleClip, startTime: 0, duration: 2 }); tick()
    useDAWStore.getState().selectClip(id)
    useDAWStore.getState().copySelectedClips()
    useDAWStore.getState().pasteClips(); tick()

    const track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips).toHaveLength(2)
    expect(track.clips[1].startTime).toBe(2) // seçimin bittiği nokta
    // yapıştırılan clip seçili hale gelir
    expect(useDAWStore.getState().selectedClipIds).toEqual([track.clips[1].id])
  })
})

describe('automation', () => {
  it('noktalar zamana göre sıralı tutulur', () => {
    useDAWStore.getState().addAudioTrack(); tick()
    const trackId = useDAWStore.getState().tracks[0].id
    useDAWStore.getState().addAutomationLane(trackId, 'volume'); tick()
    const laneId = useDAWStore.getState().automationLanes[0].id

    useDAWStore.getState().addAutomationPoint(laneId, { time: 5, value: 1 }); tick()
    useDAWStore.getState().addAutomationPoint(laneId, { time: 1, value: 0 }); tick()
    useDAWStore.getState().addAutomationPoint(laneId, { time: 3, value: 0.5 }); tick()

    const times = useDAWStore.getState().automationLanes[0].points.map(p => p.time)
    expect(times).toEqual([1, 3, 5])
  })
})

describe('transport sınırları', () => {
  it('setBPM 40-300 aralığına kliplenir', () => {
    useDAWStore.getState().setBPM(10)
    expect(useDAWStore.getState().transport.bpm).toBe(40)
    useDAWStore.getState().setBPM(999)
    expect(useDAWStore.getState().transport.bpm).toBe(300)
    useDAWStore.getState().setBPM(128)
    expect(useDAWStore.getState().transport.bpm).toBe(128)
  })
})

describe('undo / redo', () => {
  it('track ekleme geri alınıp yinelenebilir', () => {
    useDAWStore.getState().addAudioTrack(); tick()
    useDAWStore.getState().addAudioTrack(); tick()
    expect(useDAWStore.getState().tracks).toHaveLength(2)

    undo()
    expect(useDAWStore.getState().tracks).toHaveLength(1)
    undo()
    expect(useDAWStore.getState().tracks).toHaveLength(0)
    redo()
    expect(useDAWStore.getState().tracks).toHaveLength(1)
    redo()
    expect(useDAWStore.getState().tracks).toHaveLength(2)
  })

  it('yeni aksiyon redo yığınını temizler', () => {
    useDAWStore.getState().addAudioTrack(); tick()
    useDAWStore.getState().addAudioTrack(); tick()
    undo()
    useDAWStore.getState().addMidiTrack(); tick()
    redo() // etkisiz olmalı
    const tracks = useDAWStore.getState().tracks
    expect(tracks).toHaveLength(2)
    expect(tracks[1].type).toBe('midi')
  })
})

// ── Faz 1.5: replaceMidiNotes must preserve note IDs across replacing the
// note list. Previously every call regenerated a new uuid per note which broke
// React key stability across refactors (e.g. AI-generated patterns), causing
// full remounts and lost virtualisation state.
describe('replaceMidiNotes — ID stability', () => {
  it(`yeni notes listesinde aynı index'teki not ID'si korunur`, () => {
    useDAWStore.getState().addMidiTrack(); tick()
    const trackId = useDAWStore.getState().tracks[0].id
    useDAWStore.getState().addMidiClip(trackId, {
      name: 'loop', startTime: 0, durationBeats: 4, loopBeats: undefined, notes: [],
    }); tick()
    const clipId = (useDAWStore.getState().tracks[0] as any).clips[0].id

    useDAWStore.getState().addMidiNote(trackId, clipId, { pitch: 60, velocity: 100, startBeat: 0,    durationBeats: 1 }); tick()
    useDAWStore.getState().addMidiNote(trackId, clipId, { pitch: 62, velocity: 80,  startBeat: 1,    durationBeats: 1 }); tick()

    const clip0 = (useDAWStore.getState().tracks[0] as any).clips[0]
    const ids0  = clip0.notes.map((n: any) => n.id)

    // Refactor — new array but same index/order
    useDAWStore.getState().replaceMidiNotes(trackId, clipId, [
      { pitch: 60, velocity: 100, startBeat: 0, durationBeats: 1 },
      { pitch: 62, velocity: 80,  startBeat: 1, durationBeats: 1 },
    ]); tick()

    const clip1 = (useDAWStore.getState().tracks[0] as any).clips[0]
    const ids1  = clip1.notes.map((n: any) => n.id)

    expect(ids0).toEqual(ids1)
  })

  it(`öncekinden daha uzun notes listesi fazlası için yeni ID üretir`, () => {
    useDAWStore.getState().addMidiTrack(); tick()
    const trackId = useDAWStore.getState().tracks[0].id
    useDAWStore.getState().addMidiClip(trackId, {
      name: 'loop', startTime: 0, durationBeats: 4, loopBeats: undefined, notes: [],
    }); tick()
    const clipId = (useDAWStore.getState().tracks[0] as any).clips[0].id

    useDAWStore.getState().addMidiNote(trackId, clipId, { pitch: 60, velocity: 100, startBeat: 0, durationBeats: 1 }); tick()
    const id0 = (useDAWStore.getState().tracks[0] as any).clips[0].notes[0].id

    useDAWStore.getState().replaceMidiNotes(trackId, clipId, [
      { pitch: 60, velocity: 100, startBeat: 0, durationBeats: 1 },
      { pitch: 64, velocity: 90,  startBeat: 2, durationBeats: 1 },
    ]); tick()

    const clip = (useDAWStore.getState().tracks[0] as any).clips[0]
    expect(clip.notes[0].id).toBe(id0)
    expect(clip.notes[1].id).toBeTruthy()
    expect(clip.notes[1].id).not.toBe(id0)
  })
})

// ── Faz 3.10: project dirty flag drives the unsaved-changes prompt.
describe('dirty flag', () => {
  it(`record() eden mutationlar dirty=true yapar`, () => {
    useDAWStore.getState().addAudioTrack(); tick()
    expect(useDAWStore.getState().dirty).toBe(true)
  })

  it(`markSaved() dirty=false yapar, sonraki undo/redo tekrar dirty=true`, () => {
    useDAWStore.getState().addAudioTrack(); tick()
    useDAWStore.getState().markSaved()
    expect(useDAWStore.getState().dirty).toBe(false)
    // undo yine dirty'yi işaretler
    undo()
    expect(useDAWStore.getState().dirty).toBe(true)
  })

  it(`loadTracks + reset dirty=false bırakır`, () => {
    useDAWStore.getState().addAudioTrack(); tick()
    expect(useDAWStore.getState().dirty).toBe(true)
    useDAWStore.getState().reset()
    expect(useDAWStore.getState().dirty).toBe(false)
  })
})

// ── Faz 5.5: pasteClips köşe durumları
describe('pasteClips — corner cases', () => {
  it(`seçim yoksa clipboard boşsa hiçbir şey yapmaz`, () => {
    useDAWStore.getState().addAudioTrack(); tick()
    const before = useDAWStore.getState().tracks.length
    useDAWStore.getState().pasteClips()
    expect(useDAWStore.getState().tracks.length).toBe(before)
  })

  it(`clipboard dolu ama seçim boşsa en sona yapışır (fallback anchor)`, () => {
    useDAWStore.getState().addAudioTrack(); tick()
    const trackId = useDAWStore.getState().tracks[0].id
    const id = useDAWStore.getState().addClip(trackId, { ...sampleClip, startTime: 0, duration: 2 }); tick()
    useDAWStore.getState().selectClip(id)
    useDAWStore.getState().copySelectedClips()
    useDAWStore.getState().selectClip(null)   // seçimi bırak
    useDAWStore.getState().pasteClips(); tick()
    const track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips).toHaveLength(2)
    expect(track.clips[1].startTime).toBeGreaterThanOrEqual(2)
  })

  it(`MIDI beat süresini BPM'e göre saniyeye çevirerek yapıştırır`, () => {
    useDAWStore.getState().addMidiTrack(); tick()
    const trackId = useDAWStore.getState().tracks[0].id
    const id = useDAWStore.getState().addMidiClip(trackId, {
      name: 'Loop', startTime: 1, durationBeats: 4, loopBeats: 8, notes: [],
    }); tick()
    useDAWStore.getState().selectClip(id)
    useDAWStore.getState().copySelectedClips()
    useDAWStore.getState().pasteClips(); tick()

    const track = useDAWStore.getState().tracks[0] as MidiTrack
    // 120 BPM'de 8 beat = 4 saniye; klip 1. saniyede başlayıp 5'te biter.
    expect(track.clips[1].startTime).toBe(5)
  })
})

// ── Faz 5.5: moveSelectedClips commit & selection
describe('moveSelectedClips + commitSelectedClipsMove', () => {
  it(`seçili klipleri anchor delta ile taşır ve commit undo'ya girer`, () => {
    useDAWStore.getState().addAudioTrack(); tick()
    const trackId = useDAWStore.getState().tracks[0].id
    const idA = useDAWStore.getState().addClip(trackId, { ...sampleClip, startTime: 0, duration: 2 }); tick()
    const idB = useDAWStore.getState().addClip(trackId, { ...sampleClip, startTime: 4, duration: 2 }); tick()
    useDAWStore.getState().selectClipsInRect([idA, idB])
    // Anchor = A → yeni anchor start 2 → delta = 2
    useDAWStore.getState().moveSelectedClips(idA, 2)
    let track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips[0].startTime).toBe(2)
    expect(track.clips[1].startTime).toBe(6)
    useDAWStore.getState().commitSelectedClipsMove(); tick()
    // commitSelectedClipsMove pushes the moved-state as the undo baseline so the
    // *drag-then-release* can be undone as one step (matching the live usage in
    // TrackRow.tsx where mousemove calls moveSelectedClips and mouseup calls
    // commit). Undo here restores the pre-commit positions (2/6) — they're
    // unchanged by undo because commit *is* the baseline; we need to undo the
    // previous clip-add step too to go back to 0/4 (two undos total).
    undo()                  // undoes commit (no visible change — baseline == state)
    track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips[0].startTime).toBe(2)   // commit baseline restored (== 2/6)
    undo()                  // undo second clip add
    track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips).toHaveLength(1)
    expect(track.clips[0].startTime).toBe(0)
  })

  it(`seçili klipleri eksi delta t=0 sonrasına itemez (clamp)`, () => {
    useDAWStore.getState().addAudioTrack(); tick()
    const trackId = useDAWStore.getState().tracks[0].id
    const id = useDAWStore.getState().addClip(trackId, { ...sampleClip, startTime: 1, duration: 2 }); tick()
    useDAWStore.getState().selectClipsInRect([id])
    useDAWStore.getState().moveSelectedClips(id, -10)   // delta = -10 ama min=1 → d=-1
    const track = useDAWStore.getState().tracks[0] as AudioTrack
    expect(track.clips[0].startTime).toBe(0)
  })
})
