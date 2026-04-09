export class EQEffect {
  low: BiquadFilterNode
  loMid: BiquadFilterNode
  hiMid: BiquadFilterNode
  high: BiquadFilterNode
  input: BiquadFilterNode
  output: BiquadFilterNode

  constructor(ctx: AudioContext) {
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

    this.input = this.low
    this.output = this.high
  }

  setGains(low: number, loMid: number, hiMid: number, high: number) {
    this.low.gain.value = low
    this.loMid.gain.value = loMid
    this.hiMid.gain.value = hiMid
    this.high.gain.value = high
  }

  connect(dest: AudioNode) { this.output.connect(dest) }
  disconnect() { this.output.disconnect() }
}
