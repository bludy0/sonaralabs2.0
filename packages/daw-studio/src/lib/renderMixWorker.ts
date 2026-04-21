import { EQEffect }     from '../engine/effects/EQEffect'
import { ReverbEffect } from '../engine/effects/ReverbEffect'
import { DelayEffect }  from '../engine/effects/DelayEffect'
import type { EffectChain } from '../types'

export interface WorkerClip {
  startTime:  number
  trimStart:  number
  trimEnd:    number
  duration:   number
  sampleRate: number
  channels:   Float32Array[]
}

export interface WorkerTrack {
  volume:  number
  pan:     number
  muted:   boolean
  effects: EffectChain
  clips:   WorkerClip[]
}

export interface RenderRequest {
  type:       'render'
  tracks:     WorkerTrack[]
  sampleRate: number
}

export interface RenderResult {
  type:       'done'
  channels:   Float32Array[]
  sampleRate: number
  length:     number
}

export interface RenderError {
  type:    'error'
  message: string
}

self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { tracks, sampleRate } = e.data

  try {
    let maxEnd = 0
    for (const track of tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + (clip.trimEnd || clip.duration) - clip.trimStart
        if (end > maxEnd) maxEnd = end
      }
    }
    if (maxEnd <= 0) throw new Error('No audio to export')

    const offCtx     = new OfflineAudioContext(2, Math.ceil((maxEnd + 0.5) * sampleRate), sampleRate)
    const masterGain = offCtx.createGain()
    masterGain.connect(offCtx.destination)

    for (const track of tracks) {
      if (track.muted || !track.clips.length) continue

      const trackGain = offCtx.createGain()
      trackGain.gain.value = track.volume
      const panner = offCtx.createStereoPanner()
      panner.pan.value = track.pan

      const eq     = new EQEffect(offCtx)
      const reverb = new ReverbEffect(offCtx)
      const delay  = new DelayEffect(offCtx)

      eq.apply(track.effects.eq)
      reverb.apply(track.effects.reverb)
      delay.apply(track.effects.delay)

      trackGain.connect(panner)
      panner.connect(eq.input)
      eq.connect(reverb.input)
      reverb.connect(delay.input)
      delay.connect(masterGain)

      for (const clip of track.clips) {
        if (!clip.channels.length) continue
        const buf = offCtx.createBuffer(clip.channels.length, clip.channels[0].length, clip.sampleRate)
        for (let ch = 0; ch < clip.channels.length; ch++) {
          buf.copyToChannel(new Float32Array(clip.channels[ch]), ch)
        }
        const src = offCtx.createBufferSource()
        src.buffer = buf
        src.connect(trackGain)
        src.start(clip.startTime, clip.trimStart, (clip.trimEnd || clip.duration) - clip.trimStart)
      }
    }

    const rendered  = await offCtx.startRendering()
    const channels: Float32Array[] = []
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      channels.push(new Float32Array(rendered.getChannelData(ch)))
    }

    const result: RenderResult = { type: 'done', channels, sampleRate, length: rendered.length }
    self.postMessage(result, { transfer: channels.map(c => c.buffer) })
  } catch (err) {
    const error: RenderError = { type: 'error', message: (err as Error).message }
    self.postMessage(error)
  }
}
