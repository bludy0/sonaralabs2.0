export class CompressorEffect {
  compressor: DynamicsCompressorNode
  input: GainNode
  output: GainNode

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.compressor = ctx.createDynamicsCompressor()
    this.compressor.threshold.value = -24
    this.compressor.ratio.value = 4
    this.compressor.attack.value = 0.003
    this.compressor.release.value = 0.25
    this.compressor.knee.value = 6

    this.input.connect(this.compressor)
    this.compressor.connect(this.output)
  }

  update(s: { threshold: number; ratio: number; attack: number; release: number; knee: number }) {
    this.compressor.threshold.value = s.threshold
    this.compressor.ratio.value = s.ratio
    this.compressor.attack.value = s.attack
    this.compressor.release.value = s.release
    this.compressor.knee.value = s.knee
  }

  getReduction(): number {
    return this.compressor.reduction
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
