// ── SamplerEngine ─────────────────────────────────────────────────────────────
// Loads FluidR3_GM soundfont samples from CDN and plays them with pitch-shifting.
// Static buffer cache is shared across all instances (one cache per browser session).

import type { MidiNote, SynthPreset } from '../types'

const CDN = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM'

// Note name lookup — gleitz uses flat names (Db not C#)
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** MIDI number → gleitz note name (e.g. 60 → "C4", 61 → "Db4") */
function midiToNoteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}

// Sample every 3 semitones: A0 → C7 range
// Each group: [C, Eb, Gb, A] per octave — max pitch-shift = 1.5 semitones
const SAMPLE_MIDIS: number[] = (() => {
  const pts: number[] = []
  for (let oct = 0; oct <= 6; oct++) {
    const base = 24 + oct * 12  // C2 = 36, C3 = 48, ..., C7 = 96
    pts.push(base, base + 3, base + 6, base + 9)
  }
  // Add A0 (21), Bb0 (22), B0 (23) for low piano range
  return [21, 22, 23, ...pts].filter(m => m <= 108)
})()

interface Voice {
  source: AudioBufferSourceNode
  gain:   GainNode
}

// ── Static cache shared across all SamplerEngine instances ───────────────────

// instrumentId → (sampleMidi → AudioBuffer)
const _bufferCache = new Map<string, Map<number, AudioBuffer>>()
// instrumentId → loading Promise (prevents duplicate fetches)
const _loadingMap  = new Map<string, Promise<void>>()

// ── Helpers ──────────────────────────────────────────────────────────────────

function findNearestSample(
  pitch:   number,
  buffers: Map<number, AudioBuffer>,
): { sampleMidi: number; buffer: AudioBuffer } | null {
  let bestMidi = -1
  let bestDist = Infinity
  for (const [midi] of buffers) {
    const d = Math.abs(midi - pitch)
    if (d < bestDist) { bestDist = d; bestMidi = midi }
  }
  if (bestMidi === -1) return null
  return { sampleMidi: bestMidi, buffer: buffers.get(bestMidi)! }
}

// ── SamplerEngine class ───────────────────────────────────────────────────────

export class SamplerEngine {
  private _instrumentId: string | null = null
  private _voices = new Map<string, Voice>()

  // ── Loading ────────────────────────────────────────────────────────────────

  get isReady(): boolean {
    if (!this._instrumentId) return false
    const buf = _bufferCache.get(this._instrumentId)
    return !!buf && buf.size > 0
  }

  get isLoading(): boolean {
    return !!this._instrumentId && _loadingMap.has(this._instrumentId)
  }

  get currentInstrument(): string | null { return this._instrumentId }

  async loadInstrument(instrumentId: string, ctx: AudioContext): Promise<void> {
    // Already loaded
    const cached = _bufferCache.get(instrumentId)
    if (cached && cached.size > 0) {
      this._instrumentId = instrumentId
      return
    }

    // Start loading if not already in-flight
    if (!_loadingMap.has(instrumentId)) {
      const promise = this._fetchAll(instrumentId, ctx)
        .finally(() => _loadingMap.delete(instrumentId))
      _loadingMap.set(instrumentId, promise)
    }

    await _loadingMap.get(instrumentId)
    this._instrumentId = instrumentId
  }

  private async _fetchAll(instrumentId: string, ctx: AudioContext): Promise<void> {
    const buffers = new Map<number, AudioBuffer>()

    await Promise.allSettled(
      SAMPLE_MIDIS.map(async midi => {
        const url = `${CDN}/${instrumentId}-mp3/${midiToNoteName(midi)}.mp3`
        try {
          const resp = await fetch(url)
          if (!resp.ok) return
          const ab  = await resp.arrayBuffer()
          const buf = await ctx.decodeAudioData(ab)
          buffers.set(midi, buf)
        } catch {
          // Sample not available for this note — skip silently
        }
      }),
    )

    _bufferCache.set(instrumentId, buffers)
    console.debug(`[SamplerEngine] Loaded "${instrumentId}": ${buffers.size} samples`)
  }

  // ── Playback ───────────────────────────────────────────────────────────────

  noteOn(
    noteId:      string,
    pitch:       number,
    velocity:    number,
    _preset:     SynthPreset | null,   // ignored — sampler uses its own envelope
    destination: AudioNode,
    ctx:         AudioContext,
  ) {
    if (!this._instrumentId) return
    const buffers = _bufferCache.get(this._instrumentId)
    if (!buffers || buffers.size === 0) return

    const nearest = findNearestSample(pitch, buffers)
    if (!nearest) return

    const { sampleMidi, buffer } = nearest
    const playbackRate = Math.pow(2, (pitch - sampleMidi) / 12)
    const vel = velocity / 127

    // ADSR-lite: short attack, sustain, 300ms release
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(vel, ctx.currentTime + 0.006)
    gain.connect(destination)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = playbackRate
    source.connect(gain)
    source.start()

    // Clean up finished voices automatically
    source.onended = () => { this._voices.delete(noteId) }

    this._voices.set(noteId, { source, gain })
  }

  noteOff(
    noteId: string,
    _preset: SynthPreset | null,
    ctx:    AudioContext,
  ) {
    const voice = this._voices.get(noteId)
    if (!voice) return
    const t = ctx.currentTime
    voice.gain.gain.cancelScheduledValues(t)
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t)
    voice.gain.gain.linearRampToValueAtTime(0, t + 0.3)
    try { voice.source.stop(t + 0.32) } catch { /* already ended */ }

    // Disconnect nodes after the release finishes so GC can reclaim them.
    setTimeout(() => {
      try { voice.source.disconnect() } catch { /* already */ }
      try { voice.gain.disconnect() }   catch { /* already */ }
    }, 350)

    this._voices.delete(noteId)
  }

  stopAll(ctx: AudioContext) {
    for (const voice of this._voices.values()) {
      try {
        voice.gain.gain.setValueAtTime(0, ctx.currentTime)
        voice.source.stop(ctx.currentTime + 0.01)
      } catch { /* ignore */ }
      try { voice.source.disconnect() } catch { /* already */ }
      try { voice.gain.disconnect() }   catch { /* already */ }
    }
    this._voices.clear()
  }

  scheduleMidiClip(
    notes:         MidiNote[],
    clipStartTime: number,
    bpm:           number,
    preset:        SynthPreset | null,
    destination:   AudioNode,
    ctx:           AudioContext,
  ): ReturnType<typeof setTimeout>[] {
    const secPerBeat = 60 / bpm
    const timers: ReturnType<typeof setTimeout>[] = []
    const now = ctx.currentTime

    for (const note of notes) {
      const noteStart = clipStartTime + note.startBeat * secPerBeat
      const noteEnd   = noteStart + note.durationBeats * secPerBeat
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
