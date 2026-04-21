// ─── Automation ─────────────────────────────────────────────────────────────

export type AutomationParam =
  | 'volume' | 'pan'
  | 'eq.lowGain' | 'eq.loMidGain' | 'eq.hiMidGain' | 'eq.highGain'
  | 'reverb.wet' | 'delay.wet' | 'compressor.threshold'

export const AUTOMATION_PARAM_RANGES: Record<AutomationParam, [number, number]> = {
  'volume':               [0,   1],
  'pan':                  [-1,  1],
  'eq.lowGain':           [-12, 12],
  'eq.loMidGain':         [-12, 12],
  'eq.hiMidGain':         [-12, 12],
  'eq.highGain':          [-12, 12],
  'reverb.wet':           [0,   1],
  'delay.wet':            [0,   1],
  'compressor.threshold': [-60, 0],
}

export const AUTOMATION_PARAM_LABELS: Record<AutomationParam, string> = {
  'volume':               'Volume',
  'pan':                  'Pan',
  'eq.lowGain':           'EQ Low',
  'eq.loMidGain':         'EQ Lo-Mid',
  'eq.hiMidGain':         'EQ Hi-Mid',
  'eq.highGain':          'EQ High',
  'reverb.wet':           'Reverb Wet',
  'delay.wet':            'Delay Wet',
  'compressor.threshold': 'Comp Threshold',
}

export interface AutomationPoint {
  id:    string
  time:  number   // seconds on timeline
  value: number   // actual value in param range
}

export interface AutomationLane {
  id:      string
  trackId: string
  param:   AutomationParam
  enabled: boolean
  points:  AutomationPoint[]  // always sorted by time
}

// ─── Effects ────────────────────────────────────────────────────────────────

export interface EQSettings {
  enabled: boolean
  lowGain:    number   // dB, ±12
  loMidGain:  number
  hiMidGain:  number
  highGain:   number
}

export interface ReverbSettings {
  enabled: boolean
  roomSize: number   // 0-1
  wet:      number   // 0-1
}

export interface DelaySettings {
  enabled:  boolean
  time:     number   // seconds
  feedback: number   // 0-0.9
  wet:      number   // 0-1
}

export interface CompressorSettings {
  enabled:   boolean
  threshold: number  // dB, -60 to 0
  ratio:     number  // 1-20
  attack:    number  // seconds
  release:   number  // seconds
  knee:      number  // dB
}

export interface LimiterSettings {
  enabled:   boolean
  threshold: number  // dB, -12 to 0
  release:   number  // seconds
}

export interface EffectChain {
  eq:         EQSettings
  reverb:     ReverbSettings
  delay:      DelaySettings
  compressor: CompressorSettings
  limiter:    LimiterSettings
}

// ─── MIDI ────────────────────────────────────────────────────────────────────

export interface MidiNote {
  id:            string
  pitch:         number   // 0-127
  velocity:      number   // 0-127
  startBeat:     number   // beats from clip start
  durationBeats: number
}

export interface SynthPreset {
  oscillator: OscillatorType
  attack:     number
  decay:      number
  sustain:    number
  release:    number
  filterFreq: number   // Hz
  filterQ:    number
}

// ─── Clips ───────────────────────────────────────────────────────────────────

export interface AudioClip {
  id:        string
  name:      string
  startTime: number        // seconds on timeline
  duration:  number        // original clip duration
  trimStart: number        // seconds from clip start
  trimEnd:   number        // seconds from clip start (0 = no trim)
  buffer:    AudioBuffer | null
  url:       string
}

export interface MidiClip {
  id:            string
  name:          string
  startTime:     number    // seconds on timeline
  durationBeats: number
  notes:         MidiNote[]
}

// ─── Tracks ──────────────────────────────────────────────────────────────────

interface TrackBase {
  id:      string
  name:    string
  color:   string
  volume:  number   // 0-1
  pan:     number   // -1 to 1
  muted:   boolean
  soloed:  boolean
  effects: EffectChain
}

export interface AudioTrack extends TrackBase {
  type:  'audio'
  clips: AudioClip[]
}

export interface MidiTrack extends TrackBase {
  type:  'midi'
  clips: MidiClip[]
  synth: SynthPreset
}

export type DAWTrack = AudioTrack | MidiTrack

// ─── Transport ───────────────────────────────────────────────────────────────

export interface TransportState {
  bpm:           number
  loopEnabled:   boolean
  loopStart:     number   // seconds
  loopEnd:       number   // seconds
  timeSignature: [number, number]
}

// ─── Project ─────────────────────────────────────────────────────────────────

export type SerializedTrack =
  | (Omit<AudioTrack, 'clips'> & { clips: Array<Omit<AudioClip, 'buffer'>> })
  | MidiTrack

export interface SavedProject {
  version:   number
  name:      string
  transport: TransportState
  tracks:    SerializedTrack[]
  savedAt:   string
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export function defaultEffectChain(): EffectChain {
  return {
    eq:         { enabled: false, lowGain: 0, loMidGain: 0, hiMidGain: 0, highGain: 0 },
    reverb:     { enabled: false, roomSize: 0.3, wet: 0.3 },
    delay:      { enabled: false, time: 0.3, feedback: 0.3, wet: 0.3 },
    compressor: { enabled: false, threshold: -18, ratio: 4, attack: 0.003, release: 0.25, knee: 6 },
    limiter:    { enabled: false, threshold: -1, release: 0.05 },
  }
}

export const DEFAULT_SYNTH: SynthPreset = {
  oscillator: 'sine',
  attack:     0.01,
  decay:      0.1,
  sustain:    0.7,
  release:    0.3,
  filterFreq: 8000,
  filterQ:    1,
}
