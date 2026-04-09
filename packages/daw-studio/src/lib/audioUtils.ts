export interface LoopPoints {
  startSec: number
  endSec: number
}

/**
 * Convert an AudioBuffer to a WAV Blob.
 * If loopPoints is provided, embeds a SMPL chunk with a single forward loop —
 * Unity, Godot, and Unreal Engine read this natively.
 */
export function audioBufferToWav(buffer: AudioBuffer, loopPoints?: LoopPoints): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate  = buffer.sampleRate
  const bitDepth    = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign  = numChannels * bytesPerSample
  const byteRate    = sampleRate * blockAlign
  const dataSize    = buffer.length * blockAlign

  // SMPL chunk: 8 bytes header + 36 bytes sampler data + 24 bytes per loop
  const smplSize   = 60 // content size (1 loop)
  const smplTotal  = loopPoints ? 8 + smplSize : 0

  // RIFF: "RIFF"(4) + size(4) + "WAVE"(4) + "fmt "(8+16) + "data"(8+data) + optional smpl
  const riffSize = 36 + dataSize + smplTotal
  const ab = new ArrayBuffer(8 + riffSize)
  const view = new DataView(ab)

  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }

  // RIFF header
  ws(0, 'RIFF'); view.setUint32(4, riffSize, true)
  ws(8, 'WAVE')

  // fmt  chunk
  ws(12, 'fmt ')
  view.setUint32(16, 16, true)          // chunk size
  view.setUint16(20, 1, true)           // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)

  // data chunk
  ws(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }

  // SMPL chunk (loop metadata for Unity/Godot/Unreal)
  if (loopPoints) {
    const loopStart = Math.max(0, Math.floor(loopPoints.startSec * sampleRate))
    const loopEnd   = Math.min(buffer.length - 1, Math.floor(loopPoints.endSec * sampleRate) - 1)
    const samplePeriodNs = Math.round(1e9 / sampleRate)

    ws(offset, 'smpl'); offset += 4
    view.setUint32(offset, smplSize, true); offset += 4      // chunk content size

    // Sampler header (9 × uint32 = 36 bytes)
    view.setUint32(offset, 0, true); offset += 4             // Manufacturer
    view.setUint32(offset, 0, true); offset += 4             // Product
    view.setUint32(offset, samplePeriodNs, true); offset += 4// Sample Period (ns)
    view.setUint32(offset, 60, true); offset += 4            // MIDI Unity Note (middle C)
    view.setUint32(offset, 0, true); offset += 4             // MIDI Pitch Fraction
    view.setUint32(offset, 0, true); offset += 4             // SMPTE Format
    view.setUint32(offset, 0, true); offset += 4             // SMPTE Offset
    view.setUint32(offset, 1, true); offset += 4             // Num Sample Loops
    view.setUint32(offset, 0, true); offset += 4             // Sampler Data

    // Loop descriptor (6 × uint32 = 24 bytes)
    view.setUint32(offset, 0, true); offset += 4             // Cue Point ID
    view.setUint32(offset, 0, true); offset += 4             // Type: 0 = forward
    view.setUint32(offset, loopStart, true); offset += 4     // Start sample
    view.setUint32(offset, loopEnd, true); offset += 4       // End sample
    view.setUint32(offset, 0, true); offset += 4             // Fraction
    view.setUint32(offset, 0, true); offset += 4             // Play Count: 0 = infinite
  }

  return new Blob([ab], { type: 'audio/wav' })
}

export async function decodeAudioFile(file: File, ctx: AudioContext): Promise<AudioBuffer> {
  const ab = await file.arrayBuffer()
  return ctx.decodeAudioData(ab)
}

export async function decodeAudioUrl(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  const res = await fetch(url)
  const ab = await res.arrayBuffer()
  return ctx.decodeAudioData(ab)
}

export function formatTime(s: number): string {
  const m   = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ms  = Math.floor((s % 1) * 100)
  return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
