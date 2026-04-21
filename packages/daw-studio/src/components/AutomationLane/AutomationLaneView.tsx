import { useRef, useEffect, useCallback } from 'react'
import { useDAWStore } from '../../store/useDAWStore'
import { C } from '../../constants'
import { AUTOMATION_PARAM_RANGES } from '../../types'
import type { AutomationLane, AutomationPoint } from '../../types'

const LANE_H = 56   // px height of one automation lane
const PT_R   = 5    // point handle radius

interface Props {
  lane: AutomationLane
  zoom: number
  width: number   // canvas pixel width (= timeline content width)
}

export function AutomationLaneView({ lane, zoom, width }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const dragging    = useRef<{ pointId: string; startX: number; startTime: number; startVal: number } | null>(null)

  const addPoint    = useDAWStore(s => s.addAutomationPoint)
  const updatePoint = useDAWStore(s => s.updateAutomationPoint)
  const removePoint = useDAWStore(s => s.removeAutomationPoint)

  const [minVal, maxVal] = AUTOMATION_PARAM_RANGES[lane.param]

  // ── Coordinate helpers ────────────────────────────────────────────────────
  function timeToX(t: number) { return t * zoom }
  function valToY(v: number) {
    const pct = (v - minVal) / (maxVal - minVal)   // 0=min, 1=max
    return LANE_H - pct * LANE_H                   // invert: top = max
  }
  function xToTime(x: number) { return Math.max(0, x / zoom) }
  function yToVal(y: number) {
    const pct = 1 - y / LANE_H
    return minVal + pct * (maxVal - minVal)
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = C.bgDeep + 'cc'
    ctx.fillRect(0, 0, W, H)

    // Midline
    ctx.strokeStyle = C.borderDim
    ctx.lineWidth   = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, H / 2)
    ctx.lineTo(W, H / 2)
    ctx.stroke()
    ctx.setLineDash([])

    if (!lane.enabled) {
      ctx.fillStyle = C.text3 + '40'
      ctx.fillRect(0, 0, W, H)
      return
    }

    if (lane.points.length === 0) return

    const color = lane.enabled ? C.accent : C.text3

    // Filled area under curve
    ctx.beginPath()
    const first = lane.points[0]
    ctx.moveTo(timeToX(first.time), H)
    ctx.lineTo(timeToX(first.time), valToY(first.value))
    for (let i = 1; i < lane.points.length; i++) {
      const p = lane.points[i]
      ctx.lineTo(timeToX(p.time), valToY(p.value))
    }
    const last = lane.points[lane.points.length - 1]
    ctx.lineTo(timeToX(last.time), H)
    ctx.closePath()
    ctx.fillStyle = color + '20'
    ctx.fill()

    // Curve line
    ctx.beginPath()
    ctx.moveTo(timeToX(first.time), valToY(first.value))
    for (let i = 1; i < lane.points.length; i++) {
      ctx.lineTo(timeToX(lane.points[i].time), valToY(lane.points[i].value))
    }
    ctx.strokeStyle = color + 'cc'
    ctx.lineWidth   = 1.5
    ctx.stroke()

    // Extend flat lines to canvas edges
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = color + '50'
    ctx.lineWidth   = 1
    if (first.time > 0) {
      ctx.beginPath()
      ctx.moveTo(0, valToY(first.value))
      ctx.lineTo(timeToX(first.time), valToY(first.value))
      ctx.stroke()
    }
    const rightEdge = W
    const lastX = timeToX(last.time)
    if (lastX < rightEdge) {
      ctx.beginPath()
      ctx.moveTo(lastX, valToY(last.value))
      ctx.lineTo(rightEdge, valToY(last.value))
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Point handles
    for (const p of lane.points) {
      const px = timeToX(p.time)
      const py = valToY(p.value)
      const isDragging = dragging.current?.pointId === p.id

      ctx.beginPath()
      ctx.arc(px, py, PT_R, 0, Math.PI * 2)
      ctx.fillStyle = isDragging ? '#fff' : color
      ctx.fill()
      ctx.strokeStyle = C.bgDeep
      ctx.lineWidth   = 1.5
      ctx.stroke()
    }
  }, [lane, zoom, width]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw() }, [draw])

  // ── Hit-test: find point near (x, y) ─────────────────────────────────────
  function hitPoint(x: number, y: number): AutomationPoint | null {
    for (const p of lane.points) {
      const px = timeToX(p.time)
      const py = valToY(p.value)
      if (Math.hypot(x - px, y - py) <= PT_R + 3) return p
    }
    return null
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!lane.enabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (e.button === 2) return   // right-click handled separately

    const hit = hitPoint(x, y)
    if (hit) {
      dragging.current = { pointId: hit.id, startX: e.clientX, startTime: hit.time, startVal: hit.value }

      const onMove = (mv: MouseEvent) => {
        if (!dragging.current) return
        const dt  = (mv.clientX - dragging.current.startX) / zoom
        const dy  = mv.clientY - e.clientY
        const newTime = Math.max(0, dragging.current.startTime + dt)
        const newVal  = Math.max(minVal, Math.min(maxVal,
          dragging.current.startVal - (dy / LANE_H) * (maxVal - minVal)))
        updatePoint(lane.id, dragging.current.pointId, { time: newTime, value: newVal })
        requestAnimationFrame(draw)
      }
      const onUp = () => {
        dragging.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup',   onUp)
        draw()
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup',   onUp)
    } else {
      // Add a new point
      const t = xToTime(x)
      const v = Math.max(minVal, Math.min(maxVal, yToVal(y)))
      addPoint(lane.id, { time: t, value: v })
    }
  }

  function onContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!lane.enabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = hitPoint(x, y)
    if (hit) removePoint(lane.id, hit.id)
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={LANE_H}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      style={{
        display: 'block',
        cursor: lane.enabled ? 'crosshair' : 'not-allowed',
      }}
    />
  )
}

export { LANE_H }
