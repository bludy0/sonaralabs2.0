import type { SynthPreset, MidiNote } from '../types'

interface Voice {
  osc:    OscillatorNode
  gain:   GainNode
  filter: BiquadFilterNode
}

const MAX_VOICES = 16

export class SynthEngine {
  private voices = new Map<string, Voice>()

  noteOn(
    noteId: string,
    pitch: number,
    velocity: number,
    preset: SynthPreset,
    destination: AudioNode,
    ctx: AudioContext,
  ) {
    if (this.voices.size >= MAX_VOICES) {
      // steal oldest voice
      const oldest = this.voices.keys().next().value
      if (oldest) this.noteOff(oldest, preset, ctx)
    }

    const freq   = 440 * Math.pow(2, (pitch - 69) / 12)
    const vel    = velocity / 127

    const filter = ctx.createBiquadFilter()
    filter.type            = 'lowpass'
    filter.frequency.value = preset.filterFreq
    filter.Q.value         = preset.filterQ

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(vel, ctx.currentTime + preset.attack)
    gain.gain.linearRampToValueAtTime(
      vel * preset.sustain,
      ctx.currentTime + preset.attack + preset.decay,
    )

    const osc = ctx.createOscillator()
    osc.type            = preset.oscillator
    osc.frequency.value = freq

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(destination)
    osc.start()

    this.voices.set(noteId, { osc, gain, filter })
  }

  noteOff(noteId: string, preset: SynthPreset, ctx: AudioContext) {
    const v = this.voices.get(noteId)
    if (!v) return
    const t = ctx.currentTime
    v.gain.gain.cancelScheduledValues(t)
    v.gain.gain.setValueAtTime(v.gain.gain.value, t)
    v.gain.gain.linearRampToValueAtTime(0, t + preset.release)
    v.osc.stop(t + preset.release + 0.01)

    // Disconnect the voice's nodes once the oscillator has definitely stopped,
    // so AudioNodes are released for GC instead of leaking across the session.
    const releaseEnd = t + preset.release + 0.05
    setTimeout(() => {
      try { v.osc.disconnect() }    catch { /* already */ }
      try { v.filter.disconnect() } catch { /* already */ }
      try { v.gain.disconnect() }   catch { /* already */ }
    }, Math.max(0, (releaseEnd - ctx.currentTime) * 1000))

    this.voices.delete(noteId)
  }

  stopAll(ctx: AudioContext) {
    for (const [, v] of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(ctx.currentTime)
        v.gain.gain.setValueAtTime(0, ctx.currentTime)
        v.osc.stop(ctx.currentTime + 0.01)
      } catch { /* ignore */ }
      // Immediately release the voice's graph nodes
      try { v.osc.disconnect() }    catch { /* already */ }
      try { v.filter.disconnect() } catch { /* already */ }
      try { v.gain.disconnect() }   catch { /* already */ }
    }
    this.voices.clear()
  }

  scheduleMidiClip(
    notes: MidiNote[],
    clipStartTime: number,   // AudioContext absolute time
    bpm: number,
    preset: SynthPreset,
    destination: AudioNode,
    ctx: AudioContext,
  ): ReturnType<typeof setTimeout>[] {
    const secPerBeat = 60 / bpm
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const note of notes) {
      const noteStart = clipStartTime + note.startBeat * secPerBeat
      const noteEnd   = noteStart + note.durationBeats * secPerBeat
      const now       = ctx.currentTime
      const onDelay   = Math.max(0, (noteStart - now) * 1000)
      const offDelay  = Math.max(0, (noteEnd   - now) * 1000)

      timers.push(
        setTimeout(() => {
          this.noteOn(`${note.id}-play`, note.pitch, note.velocity, preset, destination, ctx)
        }, onDelay),
        setTimeout(() => {
          this.noteOff(`${note.id}-play`, preset, ctx)
        }, offDelay),
      )
    }

    return timers
  }
}
