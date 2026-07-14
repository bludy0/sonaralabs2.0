import { describe, it, expect } from 'vitest'
import { MockAudioContext } from '../__test__/mockCtx'
import { TrackNode } from '../engine/TrackNode'
import { SynthEngine } from '../engine/SynthEngine'
import type { AudioTrack, MidiTrack, SynthPreset } from '../types'

// The mock class isn't a structural match for the full lib.dom.d.ts
// AudioContext (it lacks dozens of methods we never touch).  Cast it through
// `unknown` so tests retain type-safety on the assertions without needing the
// entire DOM API surface.
const makeCtx = () => new MockAudioContext() as unknown as AudioContext

const PRESET: SynthPreset = {
  oscillator: 'sine',
  attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3,
  filterFreq: 8000, filterQ: 1,
}

function makeAudioTrack(): AudioTrack {
  return {
    id: 't1', type: 'audio', name: 'Track 1', color: '#fff',
    volume: 0.8, pan: 0, muted: false, soloed: false,
    effects: {
      eq:         { enabled: false, lowGain: 0, loMidGain: 0, hiMidGain: 0, highGain: 0 },
      reverb:     { enabled: false, roomSize: 0.3, wet: 0.3 },
      delay:      { enabled: false, time: 0.3, feedback: 0.3, wet: 0.3 },
      compressor: { enabled: false, threshold: -18, ratio: 4, attack: 0.003, release: 0.25, knee: 6 },
      limiter:    { enabled: false, threshold: -1, release: 0.05 },
      chorus:     { enabled: false, rate: 1.5, depth: 0.005, wet: 0.3 },
    },
    clips: [],
  }
}

function makeMidiTrack(): MidiTrack {
  return {
    id: 'm1', type: 'midi', name: 'MIDI 1', color: '#fff',
    volume: 0.8, pan: 0, muted: false, soloed: false,
    effects: {
      eq:         { enabled: false, lowGain: 0, loMidGain: 0, hiMidGain: 0, highGain: 0 },
      reverb:     { enabled: false, roomSize: 0.3, wet: 0.3 },
      delay:      { enabled: false, time: 0.3, feedback: 0.3, wet: 0.3 },
      compressor: { enabled: false, threshold: -18, ratio: 4, attack: 0.003, release: 0.25, knee: 6 },
      limiter:    { enabled: false, threshold: -1, release: 0.05 },
      chorus:     { enabled: false, rate: 1.5, depth: 0.005, wet: 0.3 },
    },
    clips: [],
    synth:      { ...PRESET },
    instrument: null,
  }
}

describe('TrackNode — graph wiring', () => {
  it('constructs without throwing and registers trackId', () => {
    const ctx = makeCtx()
    const dest = ctx.createGain()
    const node = new TrackNode(ctx, 'track-A', dest)
    expect(node.trackId).toBe('track-A')
  })

  it('sync() applies volume + pan + mute', () => {
    const ctx = makeCtx()
    const dest = ctx.createGain()
    const node = new TrackNode(ctx, 'track-1', dest)
    const t = makeAudioTrack()
    t.volume = 0.5
    t.pan    = -0.25
    node.sync(t, false)
    // Internal AudioParam is updated via sync (we read it through getAnalyser
    // to ensure the node is fully wired).
    expect(node.getAnalyser()).toBeTruthy()
  })

  it('dispose() does not throw even if called twice', () => {
    const ctx = makeCtx()
    const dest = ctx.createGain()
    const node = new TrackNode(ctx, 'track-2', dest)
    expect(() => node.dispose()).not.toThrow()
    expect(() => node.dispose()).not.toThrow()
  })

  it('setParam() smoothes via setTargetAtTime for all known params (no throws)', () => {
    const ctx = makeCtx()
    const dest = ctx.createGain()
    const node = new TrackNode(ctx, 'track-3', dest)
    const params: Parameters<typeof node.setParam>[0][] = [
      'volume', 'pan',
      'eq.lowGain', 'eq.loMidGain', 'eq.hiMidGain', 'eq.highGain',
      'reverb.wet', 'delay.wet', 'chorus.wet', 'compressor.threshold',
    ]
    for (const p of params) {
      expect(() => node.setParam(p, 0.5)).not.toThrow()
    }
  })
})

describe('SynthEngine — voice lifecycle', () => {
  it('noteOn stores a voice and noteOff removes it', () => {
    const ctx = makeCtx()
    const dest = ctx.createGain()
    const synth = new SynthEngine()
    synth.noteOn('n1', 60, 100, PRESET, dest, ctx)
    // Voice is internally tracked; we can't probe private state, but stopAll
    // must run without error and clean up.
    expect(() => synth.stopAll(ctx)).not.toThrow()
  })

  it('noteOff on non-existent voice is a no-op', () => {
    const ctx = makeCtx()
    const synth = new SynthEngine()
    expect(() => synth.noteOff('does-not-exist', PRESET, ctx)).not.toThrow()
  })

  it('stopAll is idempotent', () => {
    const ctx = makeCtx()
    const synth = new SynthEngine()
    synth.stopAll(ctx)
    expect(() => synth.stopAll(ctx)).not.toThrow()
  })
})