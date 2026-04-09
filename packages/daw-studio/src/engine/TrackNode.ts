import { EQEffect } from './effects/EQEffect'
import { ReverbEffect } from './effects/ReverbEffect'
import { DelayEffect } from './effects/DelayEffect'
import { CompressorEffect } from './effects/CompressorEffect'
import { LimiterEffect } from './effects/LimiterEffect'
import { ChorusEffect } from './effects/ChorusEffect'
import { DAWTrack, AudioClip } from '../types'

export class TrackNode {
  gain: GainNode
  panner: StereoPannerNode
  eq: EQEffect
  reverb: ReverbEffect
  delay: DelayEffect
  compressor: CompressorEffect
  limiter: LimiterEffect
  chorus: ChorusEffect
  analyser: AnalyserNode
  private ctx: AudioContext
  private sources: Map<string, AudioBufferSourceNode> = new Map()

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx
    this.gain = ctx.createGain()
    this.panner = ctx.createStereoPanner()
    this.eq = new EQEffect(ctx)
    this.reverb = new ReverbEffect(ctx)
    this.delay = new DelayEffect(ctx)
    this.compressor = new CompressorEffect(ctx)
    this.limiter = new LimiterEffect(ctx)
    this.chorus = new ChorusEffect(ctx)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 256

    // Chain: gain → panner → eq → reverb → chorus → delay → compressor → limiter → analyser → dest
    this.gain.connect(this.panner)
    this.panner.connect(this.eq.input)
    this.eq.connect(this.reverb.input)
    this.reverb.connect(this.chorus.input)
    this.chorus.connect(this.delay.input)
    this.delay.connect(this.compressor.input)
    this.compressor.connect(this.limiter.input)
    this.limiter.connect(this.analyser)
    this.analyser.connect(dest)
  }

  playClip(clip: AudioClip, startAt: number, contextTime: number) {
    if (!clip.buffer) return
    this.stopClip(clip.id)

    const src = this.ctx.createBufferSource()
    src.buffer = clip.buffer
    src.connect(this.gain)

    const clipStart = clip.trimStart
    const clipDuration = (clip.trimEnd || clip.duration) - clip.trimStart
    const offset = Math.max(0, contextTime - startAt - clip.startTime)

    if (offset >= clipDuration) return

    src.start(
      Math.max(contextTime, startAt + clip.startTime),
      clipStart + offset,
      clipDuration - offset
    )

    src.onended = () => { this.sources.delete(clip.id) }
    this.sources.set(clip.id, src)
  }

  stopClip(clipId: string) {
    const src = this.sources.get(clipId)
    if (src) {
      try { src.stop() } catch {}
      this.sources.delete(clipId)
    }
  }

  stopAll() {
    this.sources.forEach((src) => { try { src.stop() } catch {} })
    this.sources.clear()
  }

  getPeakLevel(): number {
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteTimeDomainData(data)
    let peak = 0
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs((data[i] - 128) / 128))
    }
    return peak
  }

  update(track: DAWTrack) {
    this.gain.gain.value = track.muted ? 0 : track.volume
    this.panner.pan.value = track.pan

    if (track.effects.eq.enabled) {
      this.eq.setGains(track.effects.eq.lowGain, track.effects.eq.loMidGain, track.effects.eq.hiMidGain, track.effects.eq.highGain)
    } else {
      this.eq.setGains(0, 0, 0, 0)
    }

    this.reverb.setWet(track.effects.reverb.enabled ? track.effects.reverb.wet : 0)
    if (track.effects.reverb.enabled) this.reverb.setRoom(track.effects.reverb.roomSize, this.ctx)

    if (track.effects.delay.enabled) {
      this.delay.setTime(track.effects.delay.time)
      this.delay.setFeedback(track.effects.delay.feedback)
      this.delay.setWet(track.effects.delay.wet)
    } else {
      this.delay.setWet(0)
    }

    if (track.effects.chorus.enabled) {
      this.chorus.update(track.effects.chorus)
    } else {
      this.chorus.update({ ...track.effects.chorus, wet: 0 })
    }

    if (track.effects.compressor.enabled) {
      this.compressor.update(track.effects.compressor)
    }

    if (track.effects.limiter.enabled) {
      this.limiter.update(track.effects.limiter)
    }
  }
}
