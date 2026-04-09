export class ReverbEffect {
  convolver: ConvolverNode
  dryGain: GainNode
  wetGain: GainNode
  input: GainNode
  output: GainNode

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.dryGain = ctx.createGain()
    this.wetGain = ctx.createGain()
    this.convolver = ctx.createConvolver()

    this.dryGain.gain.value = 1
    this.wetGain.gain.value = 0

    this.input.connect(this.dryGain)
    this.input.connect(this.convolver)
    this.convolver.connect(this.wetGain)
    this.dryGain.connect(this.output)
    this.wetGain.connect(this.output)

    this.setRoom(0.3, ctx)
  }

  setRoom(size: number, ctx: AudioContext) {
    const length = ctx.sampleRate * (0.5 + size * 3)
    const ir = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1 + size * 8)
      }
    }
    this.convolver.buffer = ir
  }

  setWet(wet: number) {
    this.wetGain.gain.value = wet
    this.dryGain.gain.value = 1 - wet * 0.5
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
