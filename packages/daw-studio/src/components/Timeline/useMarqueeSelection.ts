// Marquee (rubber-band) clip seçimi — koordinatlar "content space"tedir
// (scroll edilebilir içerik orijinine göre px).
import React, { useCallback, useRef, useState } from 'react'
import { useDAWStore } from '../../store/useDAWStore'
import { RULER_H } from './ruler'

export interface MarqueeRect { x: number; y: number; w: number; h: number }

const LANE_H_PX = 56
const PAD_PX    = 4

export function useMarqueeSelection(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const marqueeStartRef = useRef<{ cx: number; cy: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)
  const selectClipsInRect = useDAWStore(s => s.selectClipsInRect)
  const zoom        = useDAWStore(s => s.zoom)
  const trackHeight = useDAWStore(s => s.trackHeight)
  const TRACK_H_PX  = trackHeight

  const onScrollAreaMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only fire on the scroll container itself or empty track row areas,
    // not on clips (they have data-clip) or the ruler.
    if ((e.target as HTMLElement).closest('[data-clip]')) return
    if ((e.target as HTMLElement).closest('[data-automation]')) return
    const container = scrollRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()

    // Position within the scrollable content
    const cx = e.clientX - containerRect.left + container.scrollLeft
    const cy = e.clientY - containerRect.top  + container.scrollTop

    // Don't start marquee in the ruler row (use viewport Y, not scrolled content Y)
    if (e.clientY - containerRect.top < RULER_H) return

    // Only start on empty left-button press
    if (e.button !== 0) return

    e.preventDefault()
    marqueeStartRef.current = { cx, cy }
    setMarqueeRect({ x: cx, y: cy, w: 0, h: 0 })

    function onMove(mv: MouseEvent) {
      if (!marqueeStartRef.current || !container) return
      const { cx: sx, cy: sy } = marqueeStartRef.current
      const curX = mv.clientX - containerRect.left + container.scrollLeft
      const curY = mv.clientY - containerRect.top  + container.scrollTop
      setMarqueeRect({
        x: Math.min(sx, curX),
        y: Math.min(sy, curY),
        w: Math.abs(curX - sx),
        h: Math.abs(curY - sy),
      })
    }

    function onUp(uv: MouseEvent) {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)

      if (!marqueeStartRef.current || !container) { setMarqueeRect(null); return }
      const { cx: sx, cy: sy } = marqueeStartRef.current
      const endX = uv.clientX - containerRect.left + container.scrollLeft
      const endY = uv.clientY - containerRect.top  + container.scrollTop
      marqueeStartRef.current = null

      // Build final selection rect in content space
      const selX1 = Math.min(sx, endX)
      const selX2 = Math.max(sx, endX)
      const selY1 = Math.min(sy, endY)
      const selY2 = Math.max(sy, endY)

      // If too small (just a click) — deselect all
      if (selX2 - selX1 < 4 && selY2 - selY1 < 4) {
        setMarqueeRect(null)
        useDAWStore.getState().selectClip(null)
        return
      }

      // Compute which clips overlap the rect
      const state = useDAWStore.getState()
      const { tracks: ts, automationLanes: lanes, transport: tp, zoom: z } = state
      const secPerBeat = 60 / tp.bpm

      const hitIds: string[] = []
      let yOff = RULER_H

      for (const track of ts) {
        const clipY1 = yOff + PAD_PX
        const clipY2 = yOff + TRACK_H_PX - PAD_PX

        if (track.type === 'audio') {
          for (const clip of track.clips) {
            const effDur = (clip.trimEnd || clip.duration) - clip.trimStart
            const clipX1 = clip.startTime * z
            const clipX2 = clipX1 + effDur * z
            if (clipX2 > selX1 && clipX1 < selX2 && clipY2 > selY1 && clipY1 < selY2) {
              hitIds.push(clip.id)
            }
          }
        }
        if (track.type === 'midi') {
          for (const clip of track.clips) {
            const totalBeats = clip.loopBeats ?? clip.durationBeats
            const clipX1 = clip.startTime * z
            const clipX2 = clipX1 + totalBeats * secPerBeat * z
            if (clipX2 > selX1 && clipX1 < selX2 && clipY2 > selY1 && clipY1 < selY2) {
              hitIds.push(clip.id)
            }
          }
        }

        const trackLanes = lanes.filter(l => l.trackId === track.id)
        yOff += TRACK_H_PX + trackLanes.length * LANE_H_PX
      }

      selectClipsInRect(hitIds)
      setMarqueeRect(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [zoom, trackHeight, selectClipsInRect])   // eslint-disable-line react-hooks/exhaustive-deps

  return { marqueeRect, onScrollAreaMouseDown }
}
