class AudioEngine {
  private static instance: AudioEngine | null = null
  ctx: AudioContext
  masterGain: GainNode
  analyser: AnalyserNode

  private constructor() {
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.masterGain.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
  }

  static get(): AudioEngine {
    if (!AudioEngine.instance) AudioEngine.instance = new AudioEngine()
    return AudioEngine.instance
  }

  async resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }
}

export default AudioEngine
