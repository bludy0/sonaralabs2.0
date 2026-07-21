import { describe, it, expect, beforeEach } from 'vitest'
import { serializeProject, deserializeProject, encodeProject, decodeProject } from './projectIO'
import { useDAWStore } from '../store/useDAWStore'
import type { AudioTrack, MidiTrack, SavedProject } from '../types'

function mkAudio(id: string): AudioTrack {
  return {
    id, type: 'audio', name: 'a', color: '#fff',
    volume: 0.8, pan: 0, muted: false, soloed: false,
    effects: {
      eq:         { enabled: false, lowGain: 0, loMidGain: 0, hiMidGain: 0, highGain: 0 },
      reverb:     { enabled: false, roomSize: 0.3, wet: 0.3 },
      delay:      { enabled: false, time: 0.3, feedback: 0.3, wet: 0.3 },
      compressor: { enabled: false, threshold: -18, ratio: 4, attack: 0.003, release: 0.25, knee: 6 },
      limiter:    { enabled: false, threshold: -1, release: 0.05 },
      chorus:     { enabled: false, rate: 1.5, depth: 0.005, wet: 0.3 },
    },
    clips: [{
      id: 'c1', name: 'clip', startTime: 0, duration: 4,
      trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0,
      buffer: null, url: 'https://example/x.wav',
    }],
  }
}

function mkMidi(id: string): MidiTrack {
  return {
    id, type: 'midi', name: 'm', color: '#fff',
    volume: 0.8, pan: 0, muted: false, soloed: false,
    effects: {
      eq:         { enabled: false, lowGain: 0, loMidGain: 0, hiMidGain: 0, highGain: 0 },
      reverb:     { enabled: false, roomSize: 0.3, wet: 0.3 },
      delay:      { enabled: false, time: 0.3, feedback: 0.3, wet: 0.3 },
      compressor: { enabled: false, threshold: -18, ratio: 4, attack: 0.003, release: 0.25, knee: 6 },
      limiter:    { enabled: false, threshold: -1, release: 0.05 },
      chorus:     { enabled: false, rate: 1.5, depth: 0.005, wet: 0.3 },
    },
    clips: [{
      id: 'mc1', name: 'pattern', startTime: 0,
      durationBeats: 4, loopBeats: 4, notes: [],
    }],
    synth: { oscillator: 'sine', attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3, filterFreq: 8000, filterQ: 1 },
    instrument: null,
  }
}

beforeEach(() => useDAWStore.getState().reset())

describe('serializeProject', () => {
  it(`audio track clip'inden AudioBuffer'ı sıyırr, url'ı tutar`, () => {
    const t = mkAudio('a1')
    // Set buffer to a stub (should be stripped on serialise)
    ;(t.clips[0] as any).buffer = { dummy: true }
    const proj = serializeProject([t], { bpm: 120, loopEnabled: false, loopStart: 0, loopEnd: 8, timeSignature: [4, 4], snapEnabled: true, snapBeats: 0.5 })

    const serialisedClip = (proj.tracks[0] as any).clips[0]
    expect(serialisedClip.buffer).toBeUndefined()
    expect(serialisedClip.url).toBe('https://example/x.wav')
  })

  it(`midi track note'ları korunır`, () => {
    const t = mkMidi('m1')
    t.clips[0].notes = [{ id: 'n1', pitch: 60, velocity: 100, startBeat: 0, durationBeats: 1 }]
    const proj = serializeProject([t], { bpm: 120, loopEnabled: false, loopStart: 0, loopEnd: 8, timeSignature: [4, 4], snapEnabled: true, snapBeats: 0.5 })
    expect((proj.tracks[0] as any).clips[0].notes).toHaveLength(1)
  })

  it(`encodeProject/decodeProject round-trip iliştirir`, () => {
    const t = mkAudio('a1')
    const proj = serializeProject([t], { bpm: 100, loopEnabled: false, loopStart: 0, loopEnd: 8, timeSignature: [4, 4], snapEnabled: true, snapBeats: 0.5 }, 'Round')
    const json = encodeProject(proj)
    const decoded = decodeProject(json)
    expect(decoded.name).toBe('Round')
    expect(decoded.transport.bpm).toBe(100)
    expect(decoded.tracks).toHaveLength(1)
  })

  it(`automation, timeline ve master volume alanlarını korur`, () => {
    const t = mkAudio('a1')
    const automationLanes = [{
      id: 'lane-1', trackId: 'a1', param: 'volume' as const, enabled: true,
      points: [{ id: 'p1', time: 2, value: 0.4 }],
    }]
    const proj = serializeProject(
      [t],
      { bpm: 90, loopEnabled: true, loopStart: 1, loopEnd: 9, timeSignature: [3, 4], snapEnabled: false, snapBeats: 0.25 },
      'Full State',
      { automationLanes, timelineLength: 64, masterVolume: 0.62 },
    )

    const restored = deserializeProject(decodeProject(encodeProject(proj)))
    expect(proj.version).toBe(2)
    expect(restored.automationLanes).toEqual(automationLanes)
    expect(restored.timelineLength).toBe(64)
    expect(restored.masterVolume).toBe(0.62)
    expect(restored.transport.timeSignature).toEqual([3, 4])
    expect(restored.transport.snapEnabled).toBe(false)
  })

  it(`v1 projelerini yeni alanlar için güvenli varsayılanlarla açar`, () => {
    const legacy = {
      version: 1,
      name: 'Legacy',
      tracks: serializeProject([mkMidi('m1')], {
        bpm: 110, loopEnabled: false, loopStart: 0, loopEnd: 8,
        timeSignature: [4, 4], snapEnabled: true, snapBeats: 0.5,
      }).tracks,
      transport: { bpm: 110, loopEnabled: false, loopStart: 0, loopEnd: 8 },
      savedAt: new Date().toISOString(),
    } as unknown as SavedProject

    const restored = deserializeProject(legacy)
    expect(restored.transport.timeSignature).toEqual([4, 4])
    expect(restored.transport.snapEnabled).toBe(true)
    expect(restored.automationLanes).toEqual([])
    expect(restored.timelineLength).toBe(0)
    expect(restored.masterVolume).toBe(0.85)
  })

  it(`decodeProject hatalı yapıyı reddeder`, () => {
    expect(() => decodeProject('{"version":null,"tracks":"oops"}')).toThrow()
  })

  it(`deserializeProject AudioBuffer alanını null'da bırakır (useBufferRehydration sonradan doldurur)`, () => {
    const t = mkAudio('a1')
    const proj = serializeProject([t], { bpm: 120, loopEnabled: false, loopStart: 0, loopEnd: 8, timeSignature: [4, 4], snapEnabled: true, snapBeats: 0.5 })
    ;(proj.tracks[0] as any).clips[0].buffer = undefined  // simulate from-JSON state
    const { tracks } = deserializeProject(proj)
    const clip = (tracks[0] as AudioTrack).clips[0]
    expect(clip.buffer).toBeNull()
    expect(clip.url).toBe('https://example/x.wav')
  })

  it(`deserializeProject sıralı olmayan project version'u reddeder`, () => {
    const t = mkAudio('a1')
    const proj = serializeProject([t], { bpm: 120, loopEnabled: false, loopStart: 0, loopEnd: 8, timeSignature: [4, 4], snapEnabled: true, snapBeats: 0.5 })
    proj.version = 999 as any
    expect(() => deserializeProject(proj)).toThrow(/version/)
  })
})
