import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useDAWStore, snapTime, undo, redo } from './useDAWStore'
import type { AudioTrack } from '../types'

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
