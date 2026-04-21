let _ctx: AudioContext | null = null
let _master: GainNode | null = null
let _analyser: AnalyserNode | null = null

export function getAudioContext(): AudioContext {
  if (!_ctx) {
    _ctx = new AudioContext({ sampleRate: 44100 })
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
