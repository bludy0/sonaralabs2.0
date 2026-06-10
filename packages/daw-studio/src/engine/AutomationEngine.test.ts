import { describe, it, expect } from 'vitest'
import { lerp } from './AutomationEngine'

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
