// Light-weight audio-emulation stub for jsdom-based unit tests.
//
// jsdom ships no Web Audio implementation.  Rather than pulling the heavy
// `standardized-audio-context` runtime polyfill for every test run, this file
// defines a minimum viable `AudioParam` / `AudioNode` / `OfflineAudioContext`
// that lets the engine graph wire up and exercise pure scheduling logic.
//
// Sample-accurate PCM rendering still requires a real OfflineAudioContext —
// tests that need it should opt-in via an explicit `vi.useFakeTimers()` /
// `standardized-audio-context` import.  The stub here intentionally throws on
// `startRendering()` so mistakes are obvious.

const audioParamMethods = [
  'setValueAtTime',
  'linearRampToValueAtTime',
  'setTargetAtTime',
  'cancelScheduledValues',
  'exponentialRampToValueAtTime',
  'setValueCurveAtTime',
] as const

class MockAudioParam {
  value = 0
  default?: number
  minValue = -Infinity
  maxValue = Infinity
  automationRate: 'a-rate' | 'k-rate' = 'a-rate'

  constructor(initial = 0) { this.value = initial }

  setValueAtTime(v: number, _t: number)             { this.value = v; return this }
  linearRampToValueAtTime(v: number, _t: number)    { this.value = v; return this }
  exponentialRampToValueAtTime(v: number, _t: number) { this.value = v; return this }
  setTargetAtTime(v: number, _t: number, _tau: number) { this.value = v; return this }
  cancelScheduledValues(_t: number)                 { return this }
  setValueCurveAtTime(_curve: Float32Array, _t0: number, _t1: number) { return this }
}

function makeParam(initial = 0) {
  const p = new MockAudioParam(initial)
  return p as unknown as AudioParam
}

function makeNode(spec: Record<string, unknown> = {}): AudioNode {
  const node = {
    connect(_dest: AudioNode) { return _dest },
    disconnect() { /* noop */ },
    context: { currentTime: 0, sampleRate: 44100, state: 'running' as const, destination: {} },
    ...spec,
  } as unknown as AudioNode
  return node
}

class MockAudioContext {
  currentTime = 0
  sampleRate = 44100
  // Use the DOM-side union directly so structurally-typed contexts survive casts.
  state: AudioContextState = 'running'
  destination: AudioNode = makeNode()

  createGain(): GainNode {
    const gain = makeNode({
      gain: makeParam(1),
    }) as unknown as GainNode
    return gain
  }

  createStereoPanner(): StereoPannerNode {
    return makeNode({ pan: makeParam(0) }) as unknown as StereoPannerNode
  }

  createAnalyser(): AnalyserNode {
    return makeNode({
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: (_arr: Uint8Array) => { /* noop */ },
      getByteTimeDomainData: (_arr: Uint8Array) => { /* noop */ },
    }) as unknown as AnalyserNode
  }

  createBiquadFilter(): BiquadFilterNode {
    return makeNode({
      type: 'lowpass',
      frequency: makeParam(1000),
      Q: makeParam(1),
      gain: makeParam(0),
    }) as unknown as BiquadFilterNode
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return makeNode({
      threshold: makeParam(-24),
      ratio: makeParam(12),
      attack: makeParam(0.003),
      release: makeParam(0.25),
      knee: makeParam(30),
      reduction: 0,
    }) as unknown as DynamicsCompressorNode
  }

  createDelay(_max: number): DelayNode {
    return makeNode({ delayTime: makeParam(0) }) as unknown as DelayNode
  }

  createConvolver(): ConvolverNode {
    return makeNode({ buffer: null }) as unknown as ConvolverNode
  }

  createOscillator(): OscillatorNode {
    return makeNode({
      type: 'sine',
      frequency: makeParam(440),
      detune: makeParam(0),
      start: () => {},
      stop: () => {},
    }) as unknown as OscillatorNode
  }

  createBufferSource(): AudioBufferSourceNode {
    return makeNode({
      buffer: null,
      playbackRate: makeParam(1),
      detune: makeParam(0),
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      start: () => {},
      stop: () => {},
      onended: null,
    }) as unknown as AudioBufferSourceNode
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    const channelData: Float32Array[] = []
    for (let i = 0; i < channels; i++) channelData.push(new Float32Array(length))
    return {
      length,
      duration: length / sampleRate,
      sampleRate,
      numberOfChannels: channels,
      getChannelData: (idx: number) => channelData[idx] ?? new Float32Array(0),
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer
  }

  async decodeAudioData(_ab: ArrayBuffer): Promise<AudioBuffer> {
    return this.createBuffer(1, 1, this.sampleRate)
  }

  async resume(): Promise<void> { this.state = 'running' }
  async close(): Promise<void> { this.state = 'closed' }
}

class MockOfflineAudioContext extends MockAudioContext {
  startRendering(): Promise<AudioBuffer> {
    return Promise.reject(new Error(
      'MockOfflineAudioContext.startRendering is intentionally a no-op. For ' +
      'real PCM rendering, install `standardized-audio-context` and override ' +
      'this stub in the specific test.',
    ))
  }
}

// Register global stubs (TS-side these are declared in lib.dom.d.ts). The
// mocks aren't structurally equivalent to lib.dom's full AudioContext (many
// unused members are omitted), so we cast through `unknown`.
;(globalThis as unknown as { AudioContext: unknown }).AudioContext ??=
  MockAudioContext as unknown as typeof AudioContext
;(globalThis as unknown as { OfflineAudioContext: unknown }).OfflineAudioContext ??=
  MockOfflineAudioContext as unknown as typeof OfflineAudioContext

// Ensure `crypto.randomUUID` — vitest's jsdom default usually has it, but some
// matrix combos don't.
if (typeof (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID !== 'function') {
  ;(globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto = {
    randomUUID: () => 'mock-uuid-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
  }
}

// Re-export for tests that need to construct a context with a known class.
export { MockAudioContext, MockOfflineAudioContext, MockAudioParam }