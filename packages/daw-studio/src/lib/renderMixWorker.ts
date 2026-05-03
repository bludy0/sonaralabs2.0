import { EQEffect }     from '../engine/effects/EQEffect'
import { ReverbEffect } from '../engine/effects/ReverbEffect'
import { DelayEffect }  from '../engine/effects/DelayEffect'
import type { EffectChain, SynthPreset } from '../types'

// ── Audio clip (PCM already extracted on main thread) ────────────────────────
export interface WorkerClip {
  startTime:  number
  trimStart:  number
  trimEnd:    number
  duration:   number
  sampleRate: number
  channels:   Float32Array[]
}

// ── MIDI note (serialisable) ──────────────────────────────────────────────────
export interface WorkerMidiNote {
  pitch:         number   // 0-127
  velocity:      number   // 0-127
  startBeat:     number   // beats from clip start
  durationBeats: number
}

// ── MIDI clip ─────────────────────────────────────────────────────────────────
export interface WorkerMidiClip {
  startTime:     number   // seconds on timeline
  durationBeats: number   // pattern length
  loopBeats:     number   // total visible length (≥ durationBeats)
  notes:         WorkerMidiNote[]
}

// ── Track (audio OR midi) ─────────────────────────────────────────────────────
export interface WorkerTrack {
  volume:    number
  pan:       number
  muted:     boolean
  effects:   EffectChain
  // Audio clips — only present on audio tracks
  clips:     WorkerClip[]
  // MIDI clips — only present on midi tracks
  midiClips: WorkerMidiClip[]
  synth:     SynthPreset | null   // null → not a midi track
  bpm:       number
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

// ── MIDI → OfflineAudioContext scheduling ─────────────────────────────────────
function scheduleMidi(
  clips: WorkerMidiClip[],
  synth: SynthPreset,
  bpm: number,
  destination: AudioNode,
  offCtx: OfflineAudioContext,
) {
  const secPerBeat = 60 / bpm
  for (const clip of clips) {
    const patternSec = clip.durationBeats * secPerBeat
    const totalSec   = clip.loopBeats   * secPerBeat

    for (const note of clip.notes) {
      const noteRelStart = note.startBeat  * secPerBeat
      const noteDurSec   = note.durationBeats * secPerBeat
      const freq         = 440 * Math.pow(2, (note.pitch - 69) / 12)
      const vel          = note.velocity / 127

      // Iterate over loop repetitions
      let loopOffset = 0
      while (loopOffset < totalSec) {
        const noteAbsStart = clip.startTime + loopOffset + noteRelStart
        if (noteAbsStart >= clip.startTime + totalSec) break

        const avail   = (clip.startTime + totalSec) - noteAbsStart
        const noteDur = Math.min(noteDurSec, avail)
        if (noteDur <= 0) { loopOffset += patternSec; continue }

        const t0 = noteAbsStart
        const t1 = t0 + noteDur

        const filter = offCtx.createBiquadFilter()
        filter.type            = 'lowpass'
        filter.frequency.value = synth.filterFreq
        filter.Q.value         = synth.filterQ

        const gain = offCtx.createGain()
        gain.gain.setValueAtTime(0,   t0)
        gain.gain.linearRampToValueAtTime(vel,              t0 + synth.attack)
        gain.gain.linearRampToValueAtTime(vel * synth.sustain, t0 + synth.attack + synth.decay)
        gain.gain.setValueAtTime(vel * synth.sustain, t1)
        gain.gain.linearRampToValueAtTime(0, t1 + synth.release)

        const osc = offCtx.createOscillator()
        osc.type            = synth.oscillator
        osc.frequency.value = freq

        osc.connect(filter)
        filter.connect(gain)
        gain.connect(destination)

        osc.start(Math.max(0, t0))
        osc.stop(Math.max(0, t1 + synth.release + 0.01))

        loopOffset += patternSec
      }
    }
  }
}

self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { tracks, sampleRate } = e.data

  try {
    // Determine total render length across audio AND midi tracks
    let maxEnd = 0
    for (const track of tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + (clip.trimEnd || clip.duration) - clip.trimStart
        if (end > maxEnd) maxEnd = end
      }
      if (track.synth) {
        const secPerBeat = 60 / track.bpm
        for (const mc of track.midiClips) {
          const end = mc.startTime + mc.loopBeats * secPerBeat
          if (end > maxEnd) maxEnd = end
        }
      }
    }
    if (maxEnd <= 0) throw new Error('No audio to export')

    const offCtx     = new OfflineAudioContext(2, Math.ceil((maxEnd + 0.5) * sampleRate), sampleRate)
    const masterGain = offCtx.createGain()
    masterGain.connect(offCtx.destination)

    for (const track of tracks) {
      const hasMidi  = track.synth && track.midiClips.length > 0
      const hasAudio = track.clips.length > 0
      if (track.muted || (!hasAudio && !hasMidi)) continue

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

      // ── Audio clips ──────────────────────────────────────────────────────
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

      // ── MIDI clips ───────────────────────────────────────────────────────
      if (track.synth && track.midiClips.length) {
        scheduleMidi(track.midiClips, track.synth, track.bpm, trackGain, offCtx)
      }
    }

    const rendered = await offCtx.startRendering()
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
