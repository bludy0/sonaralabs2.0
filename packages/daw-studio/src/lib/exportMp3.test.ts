import { describe, it, expect } from 'vitest'
import { audioBufferToMp3 } from './exportMp3'

// Test the MP3 encoder end-to-end against a small synthetic AudioBuffer.
// The mock AudioContext from testSetup isn't involved; we feed a real
// AudioBuffer-shape object directly because @breezystack/lamejs only touches
// `getChannelData` / `numberOfChannels` / `sampleRate` / `length`.
function makeBuffer(seconds: number, sampleRate = 44100, channels = 2): AudioBuffer {
  const length = Math.floor(seconds * sampleRate)
  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(length)
    // 440 Hz sine wave, amplitude 0.5
    for (let i = 0; i < length; i++) ch[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5
    data.push(ch)
  }
  return {
    length,
    duration: seconds,
    sampleRate,
    numberOfChannels: channels,
    getChannelData: (idx: number) => data[idx] ?? new Float32Array(0),
    copyFromChannel: () => {},
    copyToChannel:   () => {},
  } as unknown as AudioBuffer
}

describe('audioBufferToMp3', () => {
  it(`stereo AudioBuffer'ı için MPEG blob döner`, () => {
    const buf = makeBuffer(0.5, 44100, 2)
    const blob = audioBufferToMp3(buf, 128)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('audio/mpeg')
    expect(blob.size).toBeGreaterThan(0)
  })

  it(`mono AudioBuffer da encode edilebilir`, () => {
    const buf = makeBuffer(0.25, 44100, 1)
    const blob = audioBufferToMp3(buf, 96)
    expect(blob.size).toBeGreaterThan(0)
  })

  it(`sessiz (all-zero) buffer encode edilir — encoder crash etmez`, () => {
    const length = 4410
    const noop = new Float32Array(length)
    const buf = {
      length, duration: 0.1, sampleRate: 44100, numberOfChannels: 1,
      getChannelData: (_: number) => noop,
      copyFromChannel: () => {}, copyToChannel: () => {},
    } as unknown as AudioBuffer
    const blob = audioBufferToMp3(buf, 64)
    expect(blob.size).toBeGreaterThan(0)
  })

  it(`daha yüksek kbps daha büyük blob üretir`, () => {
    const buf = makeBuffer(0.5, 44100, 2)
    const low  = audioBufferToMp3(buf, 64).size
    const high = audioBufferToMp3(buf, 224).size
    // Tqds bitrate'yimdir; MP3 her zaman için frame consolidation yapabilir,
    // ama 224 kbps generally 64'ten önemli ölçüde daha büyük olur.
    expect(high).toBeGreaterThan(low)
  })
})