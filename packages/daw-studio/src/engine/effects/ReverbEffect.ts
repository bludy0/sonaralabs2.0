import type { ReverbSettings } from '../../types'

export class ReverbEffect {
  readonly input:  GainNode
  readonly output: GainNode
  private convolver: ConvolverNode
  private dry: GainNode
  private wet: GainNode

  constructor(ctx: BaseAudioContext) {
    this.input     = ctx.createGain()
    this.output    = ctx.createGain()
    this.dry       = ctx.createGain()
    this.wet       = ctx.createGain()
    this.convolver = ctx.createConvolver()

    this.dry.gain.value = 1
    this.wet.gain.value = 0

    this.input.connect(this.dry)
    this.input.connect(this.convolver)
    this.convolver.connect(this.wet)
    this.dry.connect(this.output)
    this.wet.connect(this.output)

    this._generateIR(ctx, 0.3)
  }

  apply(s: ReverbSettings) {
    const w = s.enabled ? s.wet : 0
    this.wet.gain.value = w
    this.dry.gain.value = 1 - w * 0.5
  }

  setRoom(size: number, ctx: BaseAudioContext) {
    this._generateIR(ctx, size)
  }

  private _generateIR(ctx: BaseAudioContext, size: number) {
    const len = ctx.sampleRate * (0.5 + size * 3)
    const ir  = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1 + size * 8)
      }
    }
    this.convolver.buffer = ir
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
