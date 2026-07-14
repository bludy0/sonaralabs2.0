import { useRef, useEffect, memo, useState } from 'react'
import { useDAWStore }  from '../../store/useDAWStore'
import { C, alpha }    from '../../constants'
import type { AudioClip as TAudioClip } from '../../types'

const PAD      = 3
const HANDLE_W = 10

// ── Magnetic snap helper ──────────────────────────────────────────────────────
const SNAP_GRID          = 0.25
const SNAP_THRESHOLD_PX  = 10

export function snapSeconds(secs: number, zoom: number, bpm: number): number {
  const secPerBeat = 60 / bpm
  const snapped    = Math.round(secs / secPerBeat / SNAP_GRID) * SNAP_GRID * secPerBeat
  return Math.abs(secs - snapped) * zoom < SNAP_THRESHOLD_PX ? snapped : secs
}

// ── Waveform canvas ───────────────────────────────────────────────────────────
export const WaveformCanvas = memo(function WaveformCanvas({
  buffer, color, width, height, trimStart = 0, trimEnd = 0,
}: { buffer: AudioBuffer; color: string; width: number; height: number; trimStart?: number; trimEnd?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    const data = buffer.getChannelData(0)
    // Only render the visible (trimmed) slice of the buffer so the waveform
    // matches what actually plays back.
    const sr        = buffer.sampleRate
    const startS    = Math.max(0, Math.floor(trimStart * sr))
    const endS      = Math.min(data.length, Math.floor((trimEnd || buffer.duration) * sr))
    const span      = Math.max(1, endS - startS)
    const step      = Math.max(1, Math.floor(span / width))
    const mid       = height / 2

    ctx2d.clearRect(0, 0, width, height)
    ctx2d.fillStyle = color + '55'

    for (let x = 0; x < width; x++) {
      let min = 0, max = 0
      const base = startS + x * step
      for (let j = 0; j < step; j++) {
        const v = data[base + j] ?? 0
        if (v < min) min = v
        if (v > max) max = v
      }
      const yTop = mid + min * mid
      const yBot = mid + max * mid
      ctx2d.fillRect(x, yTop, 1, Math.max(1, yBot - yTop))
    }
    ctx2d.fillStyle = color + '30'
    ctx2d.fillRect(0, mid, width, 1)
  }, [buffer, color, width, height, trimStart, trimEnd])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    />
  )
})

// ── Audio clip block ──────────────────────────────────────────────────────────
export function AudioClipBlock({
  clip, zoom, color, selected, trackH = 72,
  onSelect, onMove, onTrimStart, onTrimEnd, onFadeIn, onFadeOut, onRemove, onRename,
}: {
  clip:        TAudioClip
  zoom:        number
  color:       string
  selected:    boolean
  trackH?:     number
  onSelect:    (e?: React.MouseEvent) => void
  onMove:      (newStart: number) => void
  /** Left-edge trim: crops the start while keeping the rest anchored on the
   *  timeline, so both the clip's startTime and trimStart move together. */
  onTrimStart: (startTime: number, trimStart: number) => void
  onTrimEnd:   (trimEnd: number) => void
  onFadeIn:    (fadeIn: number) => void
  onFadeOut:   (fadeOut: number) => void
  onRemove:    () => void
  onRename:    (name: string) => void
}) {
  const bpm               = useDAWStore(s => s.transport.bpm)
  const selectedClipIds   = useDAWStore(s => s.selectedClipIds)
  const moveSelectedClips = useDAWStore(s => s.moveSelectedClips)
  const commitSelMove     = useDAWStore(s => s.commitSelectedClipsMove)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameVal,  setRenameVal]  = useState('')

  const effectiveDur    = (clip.trimEnd || clip.duration) - clip.trimStart
  const w               = Math.max(8, effectiveDur * zoom)
  const x               = clip.startTime * zoom
  const isMultiSelected = selected && selectedClipIds.length > 1

  const dragRef = useRef<{ type: 'move' | 'trimL' | 'trimR' | 'fadeIn' | 'fadeOut'; startX: number; startVal: number } | null>(null)

  function startDrag(type: 'move' | 'trimL' | 'trimR' | 'fadeIn' | 'fadeOut', e: React.MouseEvent) {
    e.stopPropagation()
    if (!selected || e.shiftKey) onSelect(e)
    const startVal =
      type === 'move'    ? clip.startTime :
      type === 'trimL'   ? clip.trimStart :
      type === 'trimR'   ? (clip.trimEnd || clip.duration) :
      type === 'fadeIn'  ? clip.fadeIn :
      clip.fadeOut

    dragRef.current = { type, startX: e.clientX, startVal }

    const onMouseMove = (mv: MouseEvent) => {
      if (!dragRef.current) return
      const dx  = (mv.clientX - dragRef.current.startX) / zoom
      const raw = dragRef.current.startVal + dx
      if (type === 'move') {
        const newStart = Math.max(0, snapSeconds(raw, zoom, bpm))
        isMultiSelected ? moveSelectedClips(clip.id, newStart) : onMove(newStart)
      } else if (type === 'trimL') {
        // Crop from the left: move trimStart and startTime together so the
        // remaining audio stays put on the timeline (right edge anchored).
        const minTrim = 0
        const maxTrim = (clip.trimEnd || clip.duration) - 0.05
        const newTrim = Math.max(minTrim, Math.min(raw, maxTrim))
        const delta   = newTrim - clip.trimStart
        onTrimStart(Math.max(0, clip.startTime + delta), newTrim)
      } else if (type === 'trimR') {
        const clamped = Math.max(clip.trimStart + 0.05, Math.min(raw, clip.duration))
        onTrimEnd(clamped === clip.duration ? 0 : clamped)
      } else if (type === 'fadeIn') {
        onFadeIn(Math.max(0, Math.min(raw, effectiveDur * 0.9)))
      } else {
        onFadeOut(Math.max(0, Math.min(raw, effectiveDur * 0.9)))
      }
    }
    const onMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
      if (isMultiSelected) commitSelMove()
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
  }

  return (
    <div
      data-clip="true"
      onContextMenu={e => { e.preventDefault(); onRemove() }}
      style={{
        position: 'absolute',
        left: x, top: PAD, width: w, height: trackH - PAD * 2,
        background: color + '1a',
        border: `1.5px solid ${selected ? color : color + '70'}`,
        borderRadius: 4, overflow: 'hidden', userSelect: 'none',
        boxShadow: selected ? `0 0 0 1px ${color}50, inset 0 0 0 1px ${color}20` : 'none',
        transition: 'border-color 0.1s, box-shadow 0.1s',
      }}
    >
      {clip.buffer && (
        <WaveformCanvas buffer={clip.buffer} color={color} width={Math.round(w)} height={trackH - PAD * 2}
          trimStart={clip.trimStart} trimEnd={clip.trimEnd} />
      )}

      {isRenaming ? (
        <input
          autoFocus value={renameVal}
          onChange={e => setRenameVal(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter')  { if (renameVal.trim()) onRename(renameVal.trim()); setIsRenaming(false) }
            if (e.key === 'Escape') { setIsRenaming(false) }
          }}
          onBlur={() => { if (renameVal.trim()) onRename(renameVal.trim()); setIsRenaming(false) }}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 2, left: HANDLE_W + 2,
            maxWidth: `calc(100% - ${HANDLE_W * 2 + 10}px)`,
            background: C.bgDeep, border: `1px solid ${color}`,
            borderRadius: 2, color, fontSize: 10, fontWeight: 600,
            padding: '0 3px', outline: 'none', zIndex: 5,
          }}
        />
      ) : (
        <div
          onDoubleClick={e => { e.stopPropagation(); setRenameVal(clip.name); setIsRenaming(true) }}
          title="Double-click to rename"
          style={{
            position: 'absolute', top: 3, left: HANDLE_W + 2,
            fontSize: 10, fontWeight: 600, color,
            pointerEvents: selected ? 'auto' : 'none',
            textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
            maxWidth: `calc(100% - ${HANDLE_W * 2 + 8}px)`,
            textShadow: `0 1px 3px ${C.bgDeep}`, cursor: 'text',
          }}
        >{clip.name}</div>
      )}

      {clip.fadeIn > 0 && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
          width: Math.max(4, clip.fadeIn * zoom),
          background: `linear-gradient(to right, ${alpha(C.bgDeep, 80)}, transparent)`,
          pointerEvents: 'none' }} />
      )}
      {clip.fadeOut > 0 && (
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0,
          width: Math.max(4, clip.fadeOut * zoom),
          background: `linear-gradient(to left, ${alpha(C.bgDeep, 80)}, transparent)`,
          pointerEvents: 'none' }} />
      )}
      {selected && (
        <div onMouseDown={e => startDrag('fadeIn', e)} title="Drag to set fade-in"
          style={{ position: 'absolute', left: Math.max(HANDLE_W, clip.fadeIn * zoom) - 5, top: 2,
            width: 10, height: 10, borderRadius: '50%', background: color,
            border: `1.5px solid ${C.bgDeep}`, cursor: 'ew-resize', zIndex: 3 }} />
      )}
      {selected && (
        <div onMouseDown={e => startDrag('fadeOut', e)} title="Drag to set fade-out"
          style={{ position: 'absolute', right: Math.max(HANDLE_W, clip.fadeOut * zoom) - 5, top: 2,
            width: 10, height: 10, borderRadius: '50%', background: color,
            border: `1.5px solid ${C.bgDeep}`, cursor: 'ew-resize', zIndex: 3 }} />
      )}
      <div onMouseDown={e => startDrag('trimL', e)}
        style={{ position: 'absolute', left: 0, top: 14, bottom: 0, width: HANDLE_W,
          cursor: 'ew-resize', background: selected ? color + '80' : 'transparent',
          borderRight: selected ? `1px solid ${color}` : 'none', transition: 'background 0.1s', zIndex: 2 }} />
      <div onMouseDown={e => startDrag('move', e)}
        style={{ position: 'absolute', left: HANDLE_W, right: HANDLE_W, top: 0, bottom: 0, cursor: 'grab' }} />
      <div onMouseDown={e => startDrag('trimR', e)}
        style={{ position: 'absolute', right: 0, top: 14, bottom: 0, width: HANDLE_W,
          cursor: 'ew-resize', background: selected ? color + '80' : 'transparent',
          borderLeft: selected ? `1px solid ${color}` : 'none', transition: 'background 0.1s', zIndex: 2 }} />
      {w > 60 && (
        <div style={{ position: 'absolute', bottom: 3, right: HANDLE_W + 3,
          fontSize: 9, color: color + 'aa', pointerEvents: 'none',
          textShadow: `0 1px 2px ${C.bgDeep}` }}>
          {effectiveDur.toFixed(1)}s
        </div>
      )}
    </div>
  )
}
