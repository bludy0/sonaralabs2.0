/// <reference path="./lamejs.d.ts" />
import { Mp3Encoder } from 'lamejs'

const CHUNK_SIZE = 1152 // lamejs requires multiples of 1152 samples

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16
}

/**
 * Encode an AudioBuffer to MP3 using lamejs.
 * Runs synchronously — for long mixes (>5min) consider offloading to a Worker.
 * @param buffer  Rendered AudioBuffer
 * @param kbps    Bit rate (default 192)
 */
export function audioBufferToMp3(buffer: AudioBuffer, kbps = 192): Blob {
  const channels   = Math.min(buffer.numberOfChannels, 2) // lamejs: mono or stereo
  const sampleRate = buffer.sampleRate
  const encoder    = new Mp3Encoder(channels, sampleRate, kbps)

  const leftF32  = buffer.getChannelData(0)
  const rightF32 = channels > 1 ? buffer.getChannelData(1) : leftF32

  const leftInt16  = float32ToInt16(leftF32)
  const rightInt16 = float32ToInt16(rightF32)

  // Accumulate raw bytes in a flat array, then create a single Blob
  const bytes: number[] = []
  const pushChunk = (chunk: Int8Array) => {
    for (let i = 0; i < chunk.length; i++) bytes.push(chunk[i])
  }

  const total = leftInt16.length
  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    const end   = Math.min(offset + CHUNK_SIZE, total)
    const left  = leftInt16.subarray(offset, end)
    const right = channels > 1 ? rightInt16.subarray(offset, end) : undefined
    const chunk = right ? encoder.encodeBuffer(left, right) : encoder.encodeBuffer(left)
    if (chunk.length > 0) pushChunk(chunk)
  }
  pushChunk(encoder.flush())

  return new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' })
}
