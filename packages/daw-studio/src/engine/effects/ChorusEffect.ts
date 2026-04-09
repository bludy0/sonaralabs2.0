export class ChorusEffect {
  input: GainNode
  output: GainNode
  private dryGain: GainNode
  private wetGain: GainNode
  private delay: DelayNode
  private lfo: OscillatorNode
  private lfoGain: GainNode

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.dryGain = ctx.createGain()
    this.wetGain = ctx.createGain()
    this.delay = ctx.createDelay(0.05)
    this.lfo = ctx.createOscillator()
    this.lfoGain = ctx.createGain()

    this.delay.delayTime.value = 0.02
    this.lfo.type = 'sine'
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

  update(s: { rate: number; depth: number; wet: number }) {
    this.lfo.frequency.value = s.rate
    this.lfoGain.gain.value = s.depth
    this.wetGain.gain.value = s.wet
    this.dryGain.gain.value = 1 - s.wet * 0.5
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
