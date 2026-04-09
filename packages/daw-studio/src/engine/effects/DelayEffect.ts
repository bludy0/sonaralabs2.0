export class DelayEffect {
  delay: DelayNode
  feedback: GainNode
  dryGain: GainNode
  wetGain: GainNode
  input: GainNode
  output: GainNode

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.delay = ctx.createDelay(2.0)
    this.feedback = ctx.createGain()
    this.dryGain = ctx.createGain()
    this.wetGain = ctx.createGain()

    this.delay.delayTime.value = 0.3
    this.feedback.gain.value = 0.3
    this.dryGain.gain.value = 1
    this.wetGain.gain.value = 0

    this.input.connect(this.dryGain)
    this.input.connect(this.delay)
    this.delay.connect(this.feedback)
    this.feedback.connect(this.delay)
    this.delay.connect(this.wetGain)
    this.dryGain.connect(this.output)
    this.wetGain.connect(this.output)
  }

  setTime(t: number) { this.delay.delayTime.value = t }
  setFeedback(f: number) { this.feedback.gain.value = Math.min(0.9, f) }
  setWet(w: number) {
    this.wetGain.gain.value = w
    this.dryGain.gain.value = 1 - w * 0.5
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
