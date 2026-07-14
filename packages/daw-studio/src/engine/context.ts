let _ctx: AudioContext | null = null
let _master: GainNode | null = null
let _analyser: AnalyserNode | null = null

export function getAudioContext(): AudioContext {
  if (!_ctx) {
    // Use the browser's preferred sample rate; forcing 44100 can cause
    // resampling mismatches on 48 kHz devices.
    _ctx = new AudioContext()
    _master = _ctx.createGain()
    _master.gain.value = 0.85
    _analyser = _ctx.createAnalyser()
    _analyser.fftSize = 256
    _master.connect(_analyser)
    _analyser.connect(_ctx.destination)
  }
  return _ctx
}

export function getMasterGain(): GainNode {
  getAudioContext()
  return _master!
}

export function getAnalyser(): AnalyserNode {
  getAudioContext()
  return _analyser!
}

export async function resumeContext(): Promise<void> {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
}

/** Decode audio data using the shared singleton AudioContext. */
export function decodeWithContext(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioContext()
  return ctx.decodeAudioData(arrayBuffer)
}

/** Close and clear the shared AudioContext. Useful for tests or full resets. */
export async function closeContext(): Promise<void> {
  if (!_ctx) return
  if (_ctx.state !== 'closed') await _ctx.close()
  _ctx = null
  _master = null
  _analyser = null
}
