import { DAWTrack } from '../types'
import { audioBufferToWav, LoopPoints } from './audioUtils'
import { EQEffect } from '../engine/effects/EQEffect'
import { ReverbEffect } from '../engine/effects/ReverbEffect'
import { DelayEffect } from '../engine/effects/DelayEffect'

export async function exportMix(
  tracks: DAWTrack[],
  sampleRate = 44100,
  loopPoints?: LoopPoints,
): Promise<Blob> {
  const maxEnd = tracks.flatMap(t => t.clips).reduce((m, c) => {
    return Math.max(m, c.startTime + (c.trimEnd || c.duration) - c.trimStart)
  }, 0)

  if (maxEnd <= 0) throw new Error('No audio to export')

  const duration = maxEnd + 0.5
  const offCtx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)
  const masterGain = offCtx.createGain()
  masterGain.connect(offCtx.destination)

  for (const track of tracks) {
    if (track.muted || !track.clips.length) continue

    const trackGain = offCtx.createGain()
    trackGain.gain.value = track.volume
    const panner = offCtx.createStereoPanner()
    panner.pan.value = track.pan

    const eq = new EQEffect(offCtx as unknown as AudioContext)
    const reverb = new ReverbEffect(offCtx as unknown as AudioContext)
    const delay = new DelayEffect(offCtx as unknown as AudioContext)

    if (track.effects.eq.enabled)
      eq.setGains(track.effects.eq.lowGain, track.effects.eq.loMidGain, track.effects.eq.hiMidGain, track.effects.eq.highGain)
    reverb.setWet(track.effects.reverb.enabled ? track.effects.reverb.wet : 0)
    delay.setWet(track.effects.delay.enabled ? track.effects.delay.wet : 0)
    if (track.effects.delay.enabled) {
      delay.setTime(track.effects.delay.time)
      delay.setFeedback(track.effects.delay.feedback)
    }

    trackGain.connect(panner)
    panner.connect(eq.input)
    eq.connect(reverb.input)
    reverb.connect(delay.input)
    delay.connect(masterGain)

    for (const clip of track.clips) {
      if (!clip.buffer) continue
      const src = offCtx.createBufferSource()
      src.buffer = clip.buffer
      src.connect(trackGain)
      const when = clip.startTime
      const offset = clip.trimStart
      const dur = (clip.trimEnd || clip.duration) - clip.trimStart
      src.start(when, offset, dur)
    }
  }

  const rendered = await offCtx.startRendering()
  return audioBufferToWav(rendered, loopPoints)
}
