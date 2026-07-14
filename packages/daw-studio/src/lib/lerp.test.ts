import { describe, it, expect } from 'vitest'
import { lerp } from './lerp'

describe('lerp (automation interpolation)', () => {
  const points = [
    { time: 0, value: 0 },
    { time: 2, value: 1 },
    { time: 4, value: 0.5 },
  ]

  it('boş nokta listesi → 0', () => {
    expect(lerp([], 1)).toBe(0)
  })

  it('ilk noktadan önce → ilk noktanın değeri', () => {
    expect(lerp(points, -5)).toBe(0)
    expect(lerp(points, 0)).toBe(0)
  })

  it('son noktadan sonra → son noktanın değeri', () => {
    expect(lerp(points, 10)).toBe(0.5)
  })

  it('iki nokta arasında lineer interpolasyon', () => {
    expect(lerp(points, 1)).toBeCloseTo(0.5)
    expect(lerp(points, 3)).toBeCloseTo(0.75)
  })

  it('tam nokta üstünde nokta değerini döner', () => {
    expect(lerp(points, 2)).toBeCloseTo(1)
    expect(lerp(points, 4)).toBeCloseTo(0.5)
  })

  it('tek nokta → her zaman o değer', () => {
    const single = [{ time: 5, value: 0.7 }]
    expect(lerp(single, 0)).toBe(0.7)
    expect(lerp(single, 5)).toBe(0.7)
    expect(lerp(single, 99)).toBe(0.7)
  })
})

describe('lerp (curve modes)', () => {
  it('step: previous value held, jumps at the very end', () => {
    const pts = [
      { time: 0, value: 0,    curve: 'step' as const },
      { time: 2, value: 1,    curve: 'linear' as const },
    ]
    expect(lerp(pts, 0.5)).toBe(0)
    expect(lerp(pts, 1.9)).toBe(0)
    expect(lerp(pts, 2)).toBe(1)
  })

  it('hold: sample-and-hold keeps the previous point value', () => {
    const pts = [
      { time: 0, value: 0.2,  curve: 'hold' as const },
      { time: 2, value: 0.9 },
    ]
    expect(lerp(pts, 0)).toBe(0.2)
    expect(lerp(pts, 1)).toBe(0.2)
    expect(lerp(pts, 1.99)).toBe(0.2)
    expect(lerp(pts, 2)).toBe(0.9)
  })

  it('exp: monotonic and bounded by endpoints', () => {
    const pts = [
      { time: 0, value: 0,   curve: 'exp' as const },
      { time: 1, value: 1 },
    ]
    const v = lerp(pts, 0.5)
    // Exponential ease-out shaped = 1 - (1 - 0.5)^2 = 0.75
    expect(v).toBeCloseTo(0.75)
    // Strictly monotonic increasing
    expect(lerp(pts, 0)).toBe(0)
    expect(lerp(pts, 0.25)).toBeGreaterThan(0)
    expect(lerp(pts, 0.25)).toBeLessThan(lerp(pts, 0.5))
    expect(lerp(pts, 0.75)).toBeGreaterThan(lerp(pts, 0.5))
    expect(lerp(pts, 0.75)).toBeLessThan(1)
    expect(lerp(pts, 1)).toBe(1)
  })

  it('undefined curve defaults to linear', () => {
    const pts = [
      { time: 0, value: 0 },
      { time: 2, value: 1 },
    ]
    expect(lerp(pts, 1)).toBeCloseTo(0.5)
  })

  it('mixed modes across segments each apply their own shape', () => {
    const pts = [
      { time: 0, value: 0,    curve: 'step' as const },
      { time: 2, value: 1,    curve: 'exp'   as const },
      { time: 4, value: 0 },
    ]
    // Segment 0→2 is "step": hold 0 until the boundary
    expect(lerp(pts, 1)).toBe(0)
    // Inside segment 2→4 (exp), tn=0.5 → shape 1-(0.5)^2 = 0.75 → 1 + (0-1)*0.75 = 0.25
    expect(lerp(pts, 3)).toBeCloseTo(0.25)
  })
})