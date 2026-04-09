export interface EQSettings {
  lowGain: number
  loMidGain: number
  hiMidGain: number
  highGain: number
  enabled: boolean
}

export interface ReverbSettings {
  roomSize: number
  wet: number
  enabled: boolean
}

export interface DelaySettings {
  time: number
  feedback: number
  wet: number
  enabled: boolean
}

export interface CompressorSettings {
  threshold: number   // -60 to 0
  ratio: number       // 1 to 20
  attack: number      // 0 to 1
  release: number     // 0 to 1
  knee: number        // 0 to 40
  enabled: boolean
}

export interface LimiterSettings {
  threshold: number   // -20 to 0
  release: number     // 0 to 1
  enabled: boolean
}

export interface ChorusSettings {
  rate: number        // 0.1 to 10 Hz
  depth: number       // 0 to 0.02
  wet: number         // 0 to 1
  enabled: boolean
}

export interface TrackEffects {
  eq: EQSettings
  reverb: ReverbSettings
  delay: DelaySettings
  compressor: CompressorSettings
  limiter: LimiterSettings
  chorus: ChorusSettings
}

export interface AudioClip {
  id: string
  trackId: string
  name: string
  audioUrl: string
  buffer: AudioBuffer | null
  startTime: number
  duration: number
  trimStart: number
  trimEnd: number
}

export interface MidiNote {
  id: string
  pitch: number         // 0–127
  velocity: number      // 1–127
  startBeat: number     // beat position
  durationBeats: number
}

export interface MidiClip {
  id: string
  trackId: string
  name: string
  startTime: number     // seconds on timeline
  durationBeats: number
  notes: MidiNote[]
}

export interface SynthPreset {
  oscillator: 'sine' | 'square' | 'sawtooth' | 'triangle'
  attack: number
  decay: number
  sustain: number
  release: number
  filterFreq: number
  filterQ: number
  detune: number
}

export interface AutomationPoint {
  id: string
  time: number    // seconds
  value: number   // 0–1 normalized
}

export type AutomationParameter = 'volume' | 'pan' | 'eq.lowGain' | 'reverb.wet' | 'delay.wet' | 'compressor.threshold'

export interface AutomationLane {
  id: string
  trackId: string
  parameter: AutomationParameter
  points: AutomationPoint[]
  enabled: boolean
  visible: boolean
}

export interface DAWTrack {
  id: string
  name: string
  color: string
  type: 'audio' | 'midi'
  clips: AudioClip[]
  midiClips: MidiClip[]
  synthPreset: SynthPreset
  volume: number
  pan: number
  muted: boolean
  soloed: boolean
  effects: TrackEffects
}

export interface TransportState {
  bpm: number
  isPlaying: boolean
  isRecording: boolean
  currentTime: number
  loopStart: number
  loopEnd: number
  loopEnabled: boolean
  timeSignatureNum: number
  timeSignatureDen: number
}

export interface DAWProps {
  mode?: 'standalone' | 'embedded'
  initialTracks?: { name: string; audioUrl: string }[]
  onSave?: (tracks: ExportedTrack[]) => void
  apiBaseUrl?: string
}

export interface ExportedTrack {
  id: string
  name: string
  audioUrl: string
}

export const DEFAULT_SYNTH_PRESET: SynthPreset = {
  oscillator: 'sine',
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.3,
  filterFreq: 8000,
  filterQ: 1,
  detune: 0,
}

export const DEFAULT_EFFECTS = (): TrackEffects => ({
  eq: { lowGain: 0, loMidGain: 0, hiMidGain: 0, highGain: 0, enabled: true },
  reverb: { roomSize: 0.3, wet: 0.2, enabled: false },
  delay: { time: 0.3, feedback: 0.3, wet: 0.2, enabled: false },
  compressor: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 6, enabled: false },
  limiter: { threshold: -3, release: 0.05, enabled: false },
  chorus: { rate: 1.5, depth: 0.005, wet: 0.3, enabled: false },
})
