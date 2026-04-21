import type { EQSettings } from '../../types'

export class EQEffect {
  readonly input:  BiquadFilterNode
  readonly output: BiquadFilterNode
  private low:   BiquadFilterNode
  private loMid: BiquadFilterNode
  private hiMid: BiquadFilterNode
  private high:  BiquadFilterNode

  constructor(ctx: BaseAudioContext) {
    this.low = ctx.createBiquadFilter()
    this.low.type = 'lowshelf'
    this.low.frequency.value = 200

    this.loMid = ctx.createBiquadFilter()
    this.loMid.type = 'peaking'
    this.loMid.frequency.value = 500
    this.loMid.Q.value = 1

    this.hiMid = ctx.createBiquadFilter()
    this.hiMid.type = 'peaking'
    this.hiMid.frequency.value = 2000
    this.hiMid.Q.value = 1

    this.high = ctx.createBiquadFilter()
    this.high.type = 'highshelf'
    this.high.frequency.value = 8000

    this.low.connect(this.loMid)
    this.loMid.connect(this.hiMid)
    this.hiMid.connect(this.high)

    this.input  = this.low
    this.output = this.high
  }

  apply(s: EQSettings) {
    this.low.gain.value   = s.enabled ? s.lowGain   : 0
    this.loMid.gain.value = s.enabled ? s.loMidGain : 0
    this.hiMid.gain.value = s.enabled ? s.hiMidGain : 0
    this.high.gain.value  = s.enabled ? s.highGain  : 0
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
