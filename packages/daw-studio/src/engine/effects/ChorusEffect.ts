import type { ChorusSettings } from '../../types'

export class ChorusEffect {
  readonly input:  GainNode
  readonly output: GainNode
  private dryGain: GainNode
  private wetGain: GainNode
  private delay:   DelayNode
  private lfo:     OscillatorNode
  private lfoGain: GainNode

  constructor(ctx: BaseAudioContext) {
    this.input    = ctx.createGain()
    this.output   = ctx.createGain()
    this.dryGain  = ctx.createGain()
    this.wetGain  = ctx.createGain()
    this.delay    = ctx.createDelay(0.05)
    this.lfo      = ctx.createOscillator()
    this.lfoGain  = ctx.createGain()

    this.delay.delayTime.value = 0.02
    this.lfo.type           = 'sine'
    this.lfo.frequency.value = 1.5
    this.lfoGain.gain.value = 0.005
    this.dryGain.gain.value = 1
    this.wetGain.gain.value = 0

    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.delay.delayTime)
    this.input.connect(this.dryGain)
    this.input.connect(this.delay)
    this.delay.connect(this.wetGain)
    this.dryGain.connect(this.output)
    this.wetGain.connect(this.output)
    this.lfo.start()
  }

  apply(s: ChorusSettings) {
    const w = s.enabled ? s.wet : 0
    this.lfo.frequency.value = s.rate
    this.lfoGain.gain.value  = s.depth
    this.wetGain.gain.value  = w
    this.dryGain.gain.value  = 1 - w * 0.5
  }

  /** Smoothly automate the wet/dry mix — used during automation playback. */
  setWet(value: number, t: number, tau = 0.01) {
    const w = Math.max(0, Math.min(1, value))
    this.wetGain.gain.setTargetAtTime(w, t, tau)
    this.dryGain.gain.setTargetAtTime(1 - w * 0.5, t, tau)
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() {
    try { this.lfo.stop() }    catch { /* already stopped */ }
    try { this.output.disconnect() } catch { /* already */ }
  }
}
