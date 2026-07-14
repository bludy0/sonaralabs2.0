import type { CompressorSettings } from '../../types'

export class CompressorEffect {
  readonly input:  GainNode
  readonly output: GainNode
  private comp: DynamicsCompressorNode
  private bypass: GainNode

  constructor(ctx: BaseAudioContext) {
    this.input  = ctx.createGain()
    this.output = ctx.createGain()
    this.bypass = ctx.createGain()
    this.comp   = ctx.createDynamicsCompressor()

    this.comp.threshold.value = -18
    this.comp.ratio.value     = 4
    this.comp.attack.value    = 0.003
    this.comp.release.value   = 0.25
    this.comp.knee.value      = 6

    this.input.connect(this.comp)
    this.comp.connect(this.output)
    this.input.connect(this.bypass)
    this.bypass.connect(this.output)
  }

  apply(s: CompressorSettings) {
    if (s.enabled) {
      this.bypass.gain.value = 0
      this.comp.threshold.value = s.threshold
      this.comp.ratio.value     = s.ratio
      this.comp.attack.value    = s.attack
      this.comp.release.value   = s.release
      this.comp.knee.value      = s.knee
    } else {
      this.bypass.gain.value = 1
    }
  }

  getReduction(): number { return this.comp.reduction }

  /** Smoothly automate the threshold during automation playback. */
  setThreshold(value: number, t: number, tau = 0.01) {
    this.comp.threshold.setTargetAtTime(value, t, tau)
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
