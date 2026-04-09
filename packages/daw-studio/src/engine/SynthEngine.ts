interface VoiceHandle {
  oscillator: OscillatorNode
  gainNode: GainNode
  filter: BiquadFilterNode
  noteId: string
}

export class SynthEngine {
  private ctx: AudioContext
  private activeVoices: Map<string, VoiceHandle> = new Map()
  private maxVoices = 16

  constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  midiToHz(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12)
  }

  noteOn(
    noteId: string,
    pitch: number,
    velocity: number,
    preset: import('../types').SynthPreset,
    dest: AudioNode
  ): void {
    // Steal oldest voice if at limit
    if (this.activeVoices.size >= this.maxVoices) {
      const oldest = this.activeVoices.keys().next().value
      if (oldest) this.noteOff(oldest)
    }

    const ctx = this.ctx
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    osc.type = preset.oscillator
    osc.frequency.value = this.midiToHz(pitch)
    osc.detune.value = preset.detune

    filter.type = 'lowpass'
    filter.frequency.value = preset.filterFreq
    filter.Q.value = preset.filterQ

    const amp = (velocity / 127) * 0.7
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(amp, now + preset.attack)
    gainNode.gain.linearRampToValueAtTime(amp * preset.sustain, now + preset.attack + preset.decay)

    osc.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(dest)
    osc.start(now)

    this.activeVoices.set(noteId, { oscillator: osc, gainNode, filter, noteId })
  }

  noteOff(noteId: string, preset?: import('../types').SynthPreset): void {
    const voice = this.activeVoices.get(noteId)
    if (!voice) return

    const ctx = this.ctx
    const now = ctx.currentTime
    const release = preset?.release ?? 0.3

    voice.gainNode.gain.cancelScheduledValues(now)
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now)
    voice.gainNode.gain.linearRampToValueAtTime(0, now + release)

    voice.oscillator.stop(now + release + 0.01)
    this.activeVoices.delete(noteId)
  }

  stopAll(): void {
    this.activeVoices.forEach((_, id) => this.noteOff(id))
  }
}
