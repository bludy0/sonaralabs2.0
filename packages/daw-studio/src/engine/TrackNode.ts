import { EQEffect }         from './effects/EQEffect'
import { ReverbEffect }     from './effects/ReverbEffect'
import { DelayEffect }      from './effects/DelayEffect'
import { CompressorEffect } from './effects/CompressorEffect'
import { LimiterEffect }    from './effects/LimiterEffect'
import { ChorusEffect }     from './effects/ChorusEffect'
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
  private chorus:   ChorusEffect

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
    this.chorus  = new ChorusEffect(ctx)
    this.comp    = new CompressorEffect(ctx)
    this.limiter = new LimiterEffect(ctx)

    // gain → panner → EQ → reverb → delay → chorus → comp → limiter → analyser → dest
    this.gain.connect(this.panner)
    this.panner.connect(this.eq.input)
    this.eq.connect(this.reverb.input)
    this.reverb.connect(this.delay.input)
    this.delay.connect(this.chorus.input)
    this.chorus.connect(this.comp.input)
    this.comp.connect(this.limiter.input)
    this.limiter.connect(this.analyser)
    this.analyser.connect(destination)
  }

  sync(track: AudioTrack | MidiTrack, hasSolo = false) {
    const shouldMute = track.muted || (hasSolo && !track.soloed)
    this.gain.gain.value  = shouldMute ? 0 : track.volume
    this.panner.pan.value = track.pan
    this.applyEffects(track.effects)
  }

  applyEffects(e: EffectChain) {
    this.eq.apply(e.eq)
    this.reverb.apply(e.reverb)
    this.delay.apply(e.delay)
    this.chorus.apply(e.chorus)
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

  /** Tear down the entire per-track audio graph and disconnect all nodes.
   *  Call this when a track is removed from the project to prevent leaks. */
  dispose() {
    this.stopAll()
    try { this.eq.disconnect() }      catch { /* already disconnected */ }
    try { this.reverb.disconnect() }  catch { /* already disconnected */ }
    try { this.delay.disconnect() }   catch { /* already disconnected */ }
    try { this.chorus.disconnect() }  catch { /* already disconnected */ }
    try { this.comp.disconnect() }    catch { /* already disconnected */ }
    try { this.limiter.disconnect() } catch { /* already disconnected */ }
    try { this.analyser.disconnect() }  catch { /* already disconnected */ }
    try { this.gain.disconnect() }      catch { /* already disconnected */ }
    try { this.panner.disconnect() }   catch { /* already disconnected */ }
  }

  /** Access the analyser for real meter/visualisation reading. */
  getAnalyser(): AnalyserNode {
    return this.analyser
  }

  /** Public input for MIDI synth voices — connects before effects chain. */
  get input(): GainNode { return this.gain }

  getPeakLevel(): number {
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    let max = 0
    for (const v of data) if (v > max) max = v
    return max / 255
  }

  /** Apply a single automation param directly to the audio graph (called from RAF loop).
   *  Uses setTargetAtTime for smoothing to avoid zipper noise on volume / pan
   *  changes — previzyon dekanosu ile ".value = x" yerine gearinglenir. */
  setParam(param: AutomationParam, value: number) {
    const t = this.ctx.currentTime
    const tau = 0.01
    switch (param) {
      case 'volume':
        this.gain.gain.setTargetAtTime(Math.max(0, value), t, tau)
        break
      case 'pan':
        this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), t, tau)
        break
      case 'eq.lowGain':
        this.eq.setBandGain('low', value, t, tau)
        break
      case 'eq.loMidGain':
        this.eq.setBandGain('loMid', value, t, tau)
        break
      case 'eq.hiMidGain':
        this.eq.setBandGain('hiMid', value, t, tau)
        break
      case 'eq.highGain':
        this.eq.setBandGain('high', value, t, tau)
        break
      case 'reverb.wet':
        this.reverb.setWet(value, t, tau)
        break
      case 'delay.wet':
        this.delay.setWet(value, t, tau)
        break
      case 'chorus.wet':
        this.chorus.setWet(value, t, tau)
        break
      case 'compressor.threshold':
        this.comp.setThreshold(value, t, tau)
        break
    }
  }
}
