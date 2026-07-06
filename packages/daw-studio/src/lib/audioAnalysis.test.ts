import { describe, it, expect } from "vitest";
import { computeWaveformData, mixToMono, detectBPM } from "./audioAnalysis";

function createSilenceBuffer(length: number, channels = 1, sampleRate = 44100): AudioBuffer {
  return {
    length,
    sampleRate,
    numberOfChannels: channels,
    duration: length / sampleRate,
    getChannelData: () => new Float32Array(length),
  } as unknown as AudioBuffer;
}

function createPulseBuffer(length: number, pulseInterval: number, sampleRate = 44100): AudioBuffer {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += pulseInterval) {
    data[i] = 1;
  }
  return {
    length,
    sampleRate,
    numberOfChannels: 1,
    duration: length / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("audioAnalysis", () => {
  it("mixToMono returns same data for mono buffer", () => {
    const buf = createPulseBuffer(100, 10);
    const mono = mixToMono(buf);
    expect(mono.length).toBe(100);
    expect(mono[0]).toBe(1);
  });

  it("computeWaveformData returns normalized RMS values", () => {
    const buf = createPulseBuffer(200, 20);
    const data = computeWaveformData(buf, { points: 10, mode: "rms" });
    expect(data.length).toBe(10);
    expect(Math.max(...data)).toBeGreaterThan(0);
    expect(Math.max(...data)).toBeLessThanOrEqual(1);
  });

  it("computeWaveformData returns normalized peak values", () => {
    const buf = createPulseBuffer(200, 20);
    const data = computeWaveformData(buf, { points: 10, mode: "peak" });
    expect(data.length).toBe(10);
    expect(Math.max(...data)).toBe(1);
  });

  it("computeWaveformData handles empty buffer gracefully", () => {
    const buf = createSilenceBuffer(200);
    const data = computeWaveformData(buf, { points: 10 });
    expect(data.length).toBe(10);
    expect(data.every(v => v === 0)).toBe(true);
  });

  it("detectBPM returns 120 for very short buffers", () => {
    const buf = createPulseBuffer(1000, 100);
    expect(detectBPM(buf)).toBe(120);
  });

  it("detectBPM detects pulse tempo for longer buffers", () => {
    // 120 BPM at 100Hz sample rate → pulse every 50 samples (100 * 60 / 120)
    const sampleRate = 100;
    const durationSec = 5;
    const length = sampleRate * durationSec;
    const pulseInterval = (sampleRate * 60) / 120; // 50
    const buf = createPulseBuffer(length, pulseInterval, sampleRate);
    const bpm = detectBPM(buf);
    expect(bpm).toBe(120);
  });
});
