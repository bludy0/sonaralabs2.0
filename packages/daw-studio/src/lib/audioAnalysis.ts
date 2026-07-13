// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yunus Emre Aslan

// ── AUDIO ANALYSIS ───────────────────────────────────────────────────────────
// Browser-side helpers: fetch + decode → waveform + BPM + duration.
// These run in the main thread; for long files consider moving to a worker.

export interface AudioAnalysisResult {
  bpm: number;
  waveformData: number[];
  duration: number;
  sampleRate: number;
}

export interface WaveformOptions {
  /** Number of bars to produce. Default 200. */
  points?: number;
  /** "rms" is closer to perceived loudness; "peak" is more dramatic. */
  mode?: "rms" | "peak";
}

/** Mix all channels into a single mono Float32Array. */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mono = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  if (channels === 1) {
    mono.set(buffer.getChannelData(0));
    return mono;
  }
  for (let c = 0; c < channels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += ch[i];
    }
  }
  for (let i = 0; i < length; i++) {
    mono[i] /= channels;
  }
  return mono;
}

/**
 * Compute a normalized waveform summary from an AudioBuffer.
 * Returns an array of values in [0, 1].
 */
export function computeWaveformData(
  buffer: AudioBuffer,
  { points = 200, mode = "rms" }: WaveformOptions = {}
): number[] {
  const mono = mixToMono(buffer);
  const step = Math.max(1, Math.floor(mono.length / points));
  const data: number[] = [];

  for (let i = 0; i < points; i++) {
    const start = i * step;
    const end = Math.min(start + step, mono.length);
    if (mode === "peak") {
      let peak = 0;
      for (let j = start; j < end; j++) {
        const a = Math.abs(mono[j]);
        if (a > peak) peak = a;
      }
      data.push(peak);
    } else {
      // RMS
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += mono[j] * mono[j];
      }
      data.push(Math.sqrt(sum / Math.max(1, end - start)));
    }
  }

  // Normalize so the loudest bar hits ~1.0
  const max = Math.max(...data, 0.0001);
  return data.map(v => v / max);
}

/**
 * Very lightweight BPM detector.
 * 1. Build an onset envelope (energy differences).
 * 2. Find peak autocorrelation in the common BPM range (60-200).
 * Not studio-grade, but good enough for generated loops.
 */
export function detectBPM(buffer: AudioBuffer): number {
  const mono = mixToMono(buffer);
  const sampleRate = buffer.sampleRate;
  const duration = mono.length / sampleRate;

  // Short buffers are unreliable; default to 120 for SFX / very short clips.
  if (duration < 2) return 120;

  // Downsample to ~100Hz for speed.
  const targetRate = 100;
  const hop = Math.max(1, Math.floor(sampleRate / targetRate));
  const frames = Math.floor(mono.length / hop);
  const envelope: number[] = [];

  let prevEnergy = 0;
  for (let i = 0; i < frames; i++) {
    let energy = 0;
    const start = i * hop;
    const end = Math.min(start + hop, mono.length);
    for (let j = start; j < end; j++) {
      energy += mono[j] * mono[j];
    }
    energy = Math.sqrt(energy / Math.max(1, end - start));
    // Onset = positive energy difference
    const onset = Math.max(0, energy - prevEnergy);
    envelope.push(onset);
    prevEnergy = energy;
  }

  // Autocorrelation over lag range corresponding to 60-200 BPM.
  // lag (frames) = targetRate * 60 / bpm
  const minLag = Math.floor((targetRate * 60) / 200); // ~30 frames
  const maxLag = Math.floor((targetRate * 60) / 60);  // ~100 frames

  let bestBpm = 120;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    let count = 0;
    for (let i = 0; i + lag < envelope.length; i++) {
      score += envelope[i] * envelope[i + lag];
      count++;
    }
    if (count > 0) {
      score /= count;
      if (score > bestScore) {
        bestScore = score;
        bestBpm = (targetRate * 60) / lag;
      }
    }
  }

  // Snap to common BPM values within ±3 BPM.
  const commonBpms = [60, 70, 80, 90, 100, 110, 120, 128, 130, 140, 150, 160, 170, 175, 180, 190, 200];
  for (const b of commonBpms) {
    if (Math.abs(bestBpm - b) <= 3) return b;
  }

  return Math.round(bestBpm);
}

/** Decode an audio URL and analyze it. */
export async function analyzeAudio(audioUrl: string): Promise<AudioAnalysisResult> {
  const res = await fetch(audioUrl);
  const arrayBuffer = await res.arrayBuffer();
  return analyzeAudioBuffer(arrayBuffer);
}

/** Decode an ArrayBuffer directly (avoids double fetch if you already have bytes). */
export async function analyzeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AudioAnalysisResult> {
  // Use the shared singleton AudioContext instead of allocating a fresh one.
  // Chrome caps the number of concurrent AudioContexts (~6); the previous
  // implementation leaked contexts when decode failed in a tight loop.
  const { decodeWithContext } = await import('../engine/context');
  const buffer = await decodeWithContext(arrayBuffer.slice(0));
  return {
    bpm: detectBPM(buffer),
    waveformData: computeWaveformData(buffer),
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
  };
}
