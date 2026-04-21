import { EQEffect }         from './effects/EQEffect'
import { ReverbEffect }     from './effects/ReverbEffect'
import { DelayEffect }      from './effects/DelayEffect'
import { CompressorEffect } from './effects/CompressorEffect'
import { LimiterEffect }    from './effects/LimiterEffect'
import type { AudioTrack, MidiTrack, EffectChain, AutomationParam } from '../types'

export class TrackNode {
  readonly trackId: string

  private gain:     GainNode
  private panner:   StereoPannerNode
  private analyser: AnalyserNode
  private eq:       EQEffect
  private reverb:   ReverbEffect
  private delay:    DelayEffect
  private comp:     CompressorEffect
  private limiter:  LimiterEffect

  private activeSources = new Map<string, AudioBufferSourceNode>()

  constructor(
    private ctx: BaseAudioContext,
    trackId: string,
    destination: AudioNode,
  ) {
    this.trackId = trackId

    this.gain     = ctx.createGain()
    this.panner   = ctx.createStereoPanner()
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 256

    this.eq      = new EQEffect(ctx)
    this.reverb  = new ReverbEffect(ctx)
    this.delay   = new DelayEffect(ctx)
    this.comp    = new CompressorEffect(ctx)
    this.limiter = new LimiterEffect(ctx)

    // gain → panner → EQ → reverb → delay → comp → limiter → analyser → dest
    this.gain.connect(this.panner)
    this.panner.connect(this.eq.input)
    this.eq.connect(this.reverb.input)
    this.reverb.connect(this.delay.input)
    this.delay.connect(this.comp.input)
    this.comp.connect(this.limiter.input)
    this.limiter.connect(this.analyser)
    this.analyser.connect(destination)
  }

  sync(track: AudioTrack | MidiTrack) {
    this.gain.gain.value  = track.muted ? 0 : track.volume
    this.panner.pan.value = track.pan
    this.applyEffects(track.effects)
  }

  applyEffects(e: EffectChain) {
    this.eq.apply(e.eq)
    this.reverb.apply(e.reverb)
    this.delay.apply(e.delay)
    this.comp.apply(e.compressor)
    this.limiter.apply(e.limiter)
  }

  playClip(
    clipId: string,
    buffer: AudioBuffer,
    startAt: number,   // AudioContext time to begin playback
    offset: number,    // seconds into clip to start reading
    duration: number,  // seconds of audio to play
    fadeIn  = 0,       // seconds of linear fade-in
    fadeOut = 0,       // seconds of linear fade-out
  ) {
    this.stopClip(clipId)

    // Per-clip gain for fades (sits before track gain)
    const clipGain = this.ctx.createGain()
    clipGain.connect(this.gain)

    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(clipGain)

    // Fade-in ramp
    if (fadeIn > 0) {
      clipGain.gain.setValueAtTime(0, startAt)
      clipGain.gain.linearRampToValueAtTime(1, startAt + Math.min(fadeIn, duration * 0.5))
    }

    // Fade-out ramp
    if (fadeOut > 0) {
      const fadeStart = startAt + duration - Math.min(fadeOut, duration * 0.5)
      clipGain.gain.setValueAtTime(1, fadeStart)
      clipGain.gain.linearRampToValueAtTime(0, startAt + duration)
    }

    src.start(startAt, offset, duration)
    src.onended = () => this.activeSources.delete(clipId)
    this.activeSources.set(clipId, src)
  }

  stopClip(clipId: string) {
    const src = this.activeSources.get(clipId)
    if (src) {
      try { src.stop() } catch { /* already ended */ }
      this.activeSources.delete(clipId)
    }
  }

  stopAll() {
    for (const [id] of this.activeSources) this.stopClip(id)
  }

  getPeakLevel(): number {
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    let max = 0
    for (const v of data) if (v > max) max = v
    return max / 255
  }

  /** Apply a single automation param directly to the audio graph (called from RAF loop). */
  setParam(param: AutomationParam, value: number) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    switch (param) {
      case 'volume':
        this.gain.gain.value = Math.max(0, value)
        break
      case 'pan':
        this.panner.pan.value = Math.max(-1, Math.min(1, value))
        break
      case 'eq.lowGain':
        ;(this.eq as any).low.gain.value = value
        break
      case 'eq.loMidGain':
        ;(this.eq as any).loMid.gain.value = value
        break
      case 'eq.hiMidGain':
        ;(this.eq as any).hiMid.gain.value = value
        break
      case 'eq.highGain':
        ;(this.eq as any).high.gain.value = value
        break
      case 'reverb.wet':
        ;(this.reverb as any).wet.gain.value = Math.max(0, Math.min(1, value))
        break
      case 'delay.wet':
        ;(this.delay as any).wet.gain.value = Math.max(0, Math.min(1, value))
        break
      case 'compressor.threshold':
        ;(this.comp as any).comp.threshold.value = value
        break
    }
  }
}
