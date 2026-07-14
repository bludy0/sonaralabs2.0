import type { LimiterSettings } from '../../types'

export class LimiterEffect {
  readonly input:  GainNode
  readonly output: GainNode
  private comp: DynamicsCompressorNode
  private bypass: GainNode

  constructor(ctx: BaseAudioContext) {
    this.input  = ctx.createGain()
    this.output = ctx.createGain()
    this.bypass = ctx.createGain()
    this.comp   = ctx.createDynamicsCompressor()

    this.comp.ratio.value   = 20
    this.comp.attack.value  = 0.001
    this.comp.knee.value    = 0
    this.comp.threshold.value = -1
    this.comp.release.value   = 0.05

    this.input.connect(this.comp)
    this.comp.connect(this.output)
    this.input.connect(this.bypass)
    this.bypass.connect(this.output)
  }

  apply(s: LimiterSettings) {
    if (s.enabled) {
      this.bypass.gain.value = 0
      this.comp.threshold.value = s.threshold
      this.comp.release.value   = s.release
    } else {
      this.bypass.gain.value = 1
    }
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
