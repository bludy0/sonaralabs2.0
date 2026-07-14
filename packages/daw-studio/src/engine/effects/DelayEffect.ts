import type { DelaySettings } from '../../types'

export class DelayEffect {
  readonly input:  GainNode
  readonly output: GainNode
  private delayNode: DelayNode
  private feedback:  GainNode
  private dry:       GainNode
  private wet:       GainNode

  constructor(ctx: BaseAudioContext) {
    this.input     = ctx.createGain()
    this.output    = ctx.createGain()
    this.delayNode = ctx.createDelay(2.0)
    this.feedback  = ctx.createGain()
    this.dry       = ctx.createGain()
    this.wet       = ctx.createGain()

    this.delayNode.delayTime.value = 0.3
    this.feedback.gain.value       = 0.3
    this.dry.gain.value            = 1
    this.wet.gain.value            = 0

    this.input.connect(this.dry)
    this.input.connect(this.delayNode)
    this.delayNode.connect(this.feedback)
    this.feedback.connect(this.delayNode)
    this.delayNode.connect(this.wet)
    this.dry.connect(this.output)
    this.wet.connect(this.output)
  }

  apply(s: DelaySettings) {
    const w = s.enabled ? s.wet : 0
    this.delayNode.delayTime.value = s.time
    this.feedback.gain.value       = Math.min(0.9, s.feedback)
    this.wet.gain.value            = w
    this.dry.gain.value            = 1 - w * 0.5
  }

  /** Smoothly automate the wet/dry mix. */
  setWet(value: number, t: number, tau = 0.01) {
    const w = Math.max(0, Math.min(1, value))
    this.wet.gain.setTargetAtTime(w, t, tau)
    this.dry.gain.setTargetAtTime(1 - w * 0.5, t, tau)
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
