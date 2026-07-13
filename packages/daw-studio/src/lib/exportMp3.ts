import { Mp3Encoder } from '@breezystack/lamejs'

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
 * Encode an AudioBuffer to MP3 using @breezystack/lamejs (a maintained fork of
 * the unmaintained `lamejs` package).  Produces audio/mpeg via a single
 * concatenated Uint8Array — significantly cheaper than the previous
 * `number[]` accumulator for long mixes (no per-byte boxing/GC pressure).
 *
 * Runs synchronously — for very long mixes (>5min) consider offloading to a
 * Worker, but the type-array accumulation already keeps peak heap low.
 *
 * @param buffer  Rendered AudioBuffer
 * @param kbps    Bit rate (default 192)
 */
export function audioBufferToMp3(buffer: AudioBuffer, kbps = 192): Blob {
  const channels   = Math.min(buffer.numberOfChannels, 2) // mono or stereo
  const sampleRate = buffer.sampleRate
  const encoder    = new Mp3Encoder(channels, sampleRate, kbps)

  const leftF32  = buffer.getChannelData(0)
  const rightF32 = channels > 1 ? buffer.getChannelData(1) : leftF32

  const leftInt16  = float32ToInt16(leftF32)
  const rightInt16 = float32ToInt16(rightF32)

  // Accumulate encoded chunks as Uint8Array pieces and concatenate once at
  // the end — far more efficient than pushing every byte into a number[].
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  const total = leftInt16.length
  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    const end   = Math.min(offset + CHUNK_SIZE, total)
    const left  = leftInt16.subarray(offset, end)
    const right = channels > 1 ? rightInt16.subarray(offset, end) : undefined
    const chunk = right ? encoder.encodeBuffer(left, right) : encoder.encodeBuffer(left)
    if (chunk.length > 0) {
      chunks.push(chunk)
      totalBytes += chunk.length
    }
  }
  const tail = encoder.flush()
  if (tail.length > 0) {
    chunks.push(tail)
    totalBytes += tail.length
  }

  // Concatenate in O(n) rather than spreading (which is O(n²) for large lists).
  const merged = new Uint8Array(totalBytes)
  let pos = 0
  for (const c of chunks) {
    merged.set(c, pos)
    pos += c.length
  }

  return new Blob([merged], { type: 'audio/mpeg' })
}