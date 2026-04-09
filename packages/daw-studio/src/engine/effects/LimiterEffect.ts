export class LimiterEffect {
  compressor: DynamicsCompressorNode
  input: GainNode
  output: GainNode

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.compressor = ctx.createDynamicsCompressor()
    this.compressor.threshold.value = -3
    this.compressor.ratio.value = 20
    this.compressor.attack.value = 0.001
    this.compressor.release.value = 0.05
    this.compressor.knee.value = 0

    this.input.connect(this.compressor)
    this.compressor.connect(this.output)
  }

  update(s: { threshold: number; release: number }) {
    this.compressor.threshold.value = s.threshold
    this.compressor.release.value = s.release
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
