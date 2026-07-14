import type { ReverbSettings } from '../../types'

export class ReverbEffect {
  readonly input:  GainNode
  readonly output: GainNode
  private convolver: ConvolverNode
  private dry: GainNode
  private wet: GainNode
  private lastRoomSize  = 0.3
  private lastIRTime    = 0           // ms timestamp of last IR generation
  private pendingRoomSize: number | null = null
  private irTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly IR_THROTTLE_MS = 80

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

    this._generateIR(ctx, this.lastRoomSize)
  }

  apply(s: ReverbSettings) {
    const w = s.enabled ? s.wet : 0
    this.wet.gain.value = w
    this.dry.gain.value = 1 - w * 0.5
    if (this.lastRoomSize !== s.roomSize) {
      // Throttle IR regeneration: during a room-size drag we regenerate at
      // most once every IR_THROTTLE_MS. Latest requested size is applied on
      // the trailing edge so the final value is always honoured.
      this.pendingRoomSize = s.roomSize
      if (this.irTimer) return
      const now = Date.now()
      const elapsed = now - this.lastIRTime
      if (elapsed >= ReverbEffect.IR_THROTTLE_MS) {
        this._applyPendingRoomSize()
      } else {
        this.irTimer = setTimeout(() => {
          this.irTimer = null
          this._applyPendingRoomSize()
        }, ReverbEffect.IR_THROTTLE_MS - elapsed)
      }
    }
  }

  private _applyPendingRoomSize() {
    if (this.pendingRoomSize == null) return
    this.lastRoomSize = this.pendingRoomSize
    this.lastIRTime   = Date.now()
    this._generateIR(this.input.context, this.pendingRoomSize)
    this.pendingRoomSize = null
  }

  setRoom(size: number, ctx: BaseAudioContext) {
    this.lastRoomSize = size
    this.lastIRTime   = Date.now()
    this._generateIR(ctx, size)
  }

  /** Smoothly automate the wet/dry mix during automation playback. */
  setWet(value: number, t: number, tau = 0.01) {
    const w = Math.max(0, Math.min(1, value))
    this.wet.gain.setTargetAtTime(w, t, tau)
    this.dry.gain.setTargetAtTime(1 - w * 0.5, t, tau)
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
