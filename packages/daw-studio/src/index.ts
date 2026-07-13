// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yunus Emre Aslan

export { DAWLayout }      from './components/DAWLayout'
export { setDAWLang }     from './i18n'
export { audioBufferToDataUrl, audioBufferToDataUrlSync, dataUrlToAudioBuffer, audioBufferToWav } from './lib/audioUtils'
export type { LoopPoints } from './lib/audioUtils'
export { getAudioContext, decodeWithContext, closeContext } from './engine/context'
export {
  analyzeAudio,
  analyzeAudioBuffer,
  computeWaveformData,
  detectBPM,
  mixToMono,
} from './lib/audioAnalysis'
export type { AudioAnalysisResult, WaveformOptions } from './lib/audioAnalysis'
export type { DAWLayoutProps } from './components/DAWLayout'
export { useDAWStore }    from './store/useDAWStore'
export { useAudioEngine } from './store/useAudioEngine'
export { exportMix, exportMixMp3, exportMixOgg, renderMix } from './lib/exportMix'
export {
  serializeProject, deserializeProject, encodeProject, decodeProject,
} from './lib/projectIO'
export { registerBuffer, lookupBuffer, unregisterBuffer } from './lib/sampleRegistry'
export type {
  DAWTrack, AudioTrack, MidiTrack,
  AudioClip, MidiClip, MidiNote,
  TransportState, EffectChain,
  EQSettings, ReverbSettings, DelaySettings, CompressorSettings, LimiterSettings, ChorusSettings,
  SynthPreset, SavedProject, SerializedTrack,
} from './types'
