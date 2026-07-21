import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VerticalFaderInput } from './Mixer'

describe('VerticalFaderInput', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('tıklama ve sürüklemeyi tüm dikey alan boyunca 0..1 değerine çevirir', () => {
    const onChange = vi.fn()
    act(() => root.render(
      <VerticalFaderInput value={0.5} label="Master volume" onChange={onChange} />,
    ))

    const input = host.querySelector('input')!
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 10, right: 40, bottom: 210,
      width: 40, height: 200, toJSON: () => ({}),
    })

    act(() => input.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, clientY: 190,
    })))
    expect(onChange).toHaveBeenLastCalledWith(0.1)

    act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientY: 30 })))
    expect(onChange).toHaveBeenLastCalledWith(0.9)

    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 10 })))
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(input.getAttribute('aria-orientation')).toBe('vertical')
  })
})
