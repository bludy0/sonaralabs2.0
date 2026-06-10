import { describe, it, expect } from 'vitest'
import { audioBufferToWav, formatTime } from './audioUtils'

/** Web Audio API olmadan test için minimal AudioBuffer taklidi. */
function makeBuffer(numberOfChannels: number, sampleRate: number, length: number, fill = 0): AudioBuffer {
  const channels = Array.from({ length: numberOfChannels }, () => {
    const data = new Float32Array(length)
    data.fill(fill)
    return data
  })
  return {
    numberOfChannels,
    sampleRate,
    length,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channels[ch],
  } as unknown as AudioBuffer
}

async function bytes(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer())
}

function ascii(view: DataView, off: number, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i))
  return s
}

describe('audioBufferToWav', () => {
  it('geçerli RIFF/WAVE başlığı ve doğru fmt alanları yazar', async () => {
    const buf  = makeBuffer(2, 44100, 1000)
    const view = await bytes(audioBufferToWav(buf))

    expect(ascii(view, 0, 4)).toBe('RIFF')
    expect(ascii(view, 8, 4)).toBe('WAVE')
    expect(ascii(view, 12, 4)).toBe('fmt ')
    expect(view.getUint16(20, true)).toBe(1)        // PCM
    expect(view.getUint16(22, true)).toBe(2)        // stereo
    expect(view.getUint32(24, true)).toBe(44100)    // sample rate
    expect(view.getUint16(34, true)).toBe(16)       // bit depth
    expect(ascii(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(1000 * 2 * 2) // dataSize
    // RIFF size = dosya boyutu - 8
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8)
  })

  it('örnekleri 16-bit aralığına ölçekler ve klipler', async () => {
    const buf = makeBuffer(1, 8000, 4)
    const ch  = buf.getChannelData(0)
    ch[0] = 0.5; ch[1] = -1; ch[2] = 2 /* clip → 1 */; ch[3] = 0
    const view = await bytes(audioBufferToWav(buf))

    expect(view.getInt16(44, true)).toBe(Math.trunc(0.5 * 0x7fff))
    expect(view.getInt16(46, true)).toBe(-0x8000)
    expect(view.getInt16(48, true)).toBe(0x7fff)
    expect(view.getInt16(50, true)).toBe(0)
  })

  it('loopPoints verilince smpl chunk ekler ve loop örnek aralığı doğru olur', async () => {
    const sampleRate = 48000
    const buf  = makeBuffer(1, sampleRate, sampleRate * 2) // 2 sn
    const view = await bytes(audioBufferToWav(buf, { startSec: 0.5, endSec: 1.5 }))

    const dataSize = sampleRate * 2 * 2
    const smplOff  = 44 + dataSize
    expect(ascii(view, smplOff, 4)).toBe('smpl')
    expect(view.getUint32(smplOff + 4, true)).toBe(60)          // content size
    expect(view.getUint32(smplOff + 36, true)).toBe(1)          // num loops
    // Loop descriptor: 8 (chunk header) + 36 (sampler header) sonrası
    const loopOff = smplOff + 8 + 36
    expect(view.getUint32(loopOff + 4, true)).toBe(0)                          // forward loop
    expect(view.getUint32(loopOff + 8, true)).toBe(0.5 * sampleRate)           // start sample
    expect(view.getUint32(loopOff + 12, true)).toBe(1.5 * sampleRate - 1)      // end sample
  })

  it('loop sınırları buffer dışına taşarsa kliplenir', async () => {
    const buf  = makeBuffer(1, 1000, 1000) // 1 sn
    const view = await bytes(audioBufferToWav(buf, { startSec: -1, endSec: 99 }))
    const loopOff = 44 + 1000 * 2 + 8 + 36
    expect(view.getUint32(loopOff + 8, true)).toBe(0)
    expect(view.getUint32(loopOff + 12, true)).toBe(999) // buffer.length - 1
  })

  it('loopPoints olmadan smpl chunk yazılmaz', async () => {
    const buf  = makeBuffer(1, 8000, 100)
    const view = await bytes(audioBufferToWav(buf))
    expect(view.byteLength).toBe(44 + 100 * 2)
  })
})

describe('formatTime', () => {
  it('dakika:saniye.salise biçimler', () => {
    expect(formatTime(0)).toBe('0:00.00')
    expect(formatTime(65.5)).toBe('1:05.50')
    expect(formatTime(125.789)).toBe('2:05.78')
  })
})
