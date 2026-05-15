import { useRef, useEffect, memo, useState } from 'react'
import { useDAWStore }  from '../../store/useDAWStore'
import { C }            from '../../constants'
import type { MidiClip as TMidiClip, MidiNote } from '../../types'
import { snapSeconds }  from './AudioClipBlock'

const TRACK_H       = 72
const PAD           = 3
const MIDI_HANDLE_W = 8

// ── Magnetic snap helper (beat-based) ────────────────────────────────────────
const SNAP_GRID         = 0.25
const SNAP_THRESHOLD_PX = 10

export function snapBeats(beats: number, zoom: number, bpm: number): number {
  const secPerBeat = 60 / bpm
  const pxPerBeat  = secPerBeat * zoom
  const snapped    = Math.round(beats / SNAP_GRID) * SNAP_GRID
  return Math.abs(beats - snapped) * pxPerBeat < SNAP_THRESHOLD_PX ? snapped : beats
}

// ── MIDI preview canvas ───────────────────────────────────────────────────────
export const MidiPreviewCanvas = memo(function MidiPreviewCanvas({
  notes, durationBeats, beatStart = 0, beatEnd, color, width, height, top, dimmed = false,
}: {
  notes:         MidiNote[]
  durationBeats: number
  beatStart?:    number
  beatEnd?:      number
  color:         string
  width:         number
  height:        number
  top:           number
  dimmed?:       boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const windowEnd = beatEnd ?? durationBeats

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || notes.length === 0) { ctx?.clearRect(0, 0, width, height); return }
    ctx.clearRect(0, 0, width, height)

    const windowLen    = windowEnd - beatStart
    const patternBeats = durationBeats
    const pitches = notes.map(n => n.pitch)
    const minP    = Math.max(0,   Math.min(...pitches) - 2)
    const maxP    = Math.min(127, Math.max(...pitches) + 2)
    const range   = Math.max(maxP - minP, 4)
    const NOTE_H  = Math.max(1, Math.min(4, Math.floor(height / range)))

    const hex = color.replace('#', '')
    const r   = parseInt(hex.slice(0, 2), 16)
    const g   = parseInt(hex.slice(2, 4), 16)
    const b   = parseInt(hex.slice(4, 6), 16)

    const loopCount = Math.ceil(windowEnd / patternBeats)
    for (let rep = 0; rep < loopCount; rep++) {
      const offsetBeats = rep * patternBeats
      for (const note of notes) {
        const absStart = offsetBeats + note.startBeat
        const absEnd   = absStart + note.durationBeats
        if (absEnd <= beatStart || absStart >= windowEnd) continue

        const clampedStart = Math.max(absStart, beatStart) - beatStart
        const clampedEnd   = Math.min(absEnd,   windowEnd) - beatStart
        const nx = (clampedStart / windowLen) * width
        const nw = Math.max(2, ((clampedEnd - clampedStart) / windowLen) * width)
        const ny = height - ((note.pitch - minP) / range) * height - NOTE_H
        const op = (dimmed ? 0.5 : 1) * (0.45 + (note.velocity / 127) * 0.55)
        ctx.fillStyle = `rgba(${r},${g},${b},${op})`
        ctx.fillRect(Math.round(nx), Math.round(ny), Math.round(nw), NOTE_H)
      }
    }
  }, [notes, durationBeats, beatStart, windowEnd, color, width, height, dimmed])

  return (
    <canvas ref={canvasRef} width={width} height={height}
      style={{ position: 'absolute', top, left: 0, pointerEvents: 'none' }} />
  )
})

// ── MIDI clip block ───────────────────────────────────────────────────────────
export function MidiClipBlock({
  clip, zoom, color, selected,
  onSelect, onRemove, onMove, onExtend, onLoop, onRename,
}: {
  clip:     TMidiClip
  zoom:     number
  color:    string
  selected: boolean
  onSelect: (e?: React.MouseEvent) => void
  onRemove: () => void
  onMove:   (newStart: number) => void
  onExtend: (beats: number) => void
  onLoop:   (loopBeats: number) => void
  onRename: (name: string) => void
}) {
  const bpm        = useDAWStore(s => s.transport.bpm)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameVal,  setRenameVal]  = useState('')
  const secPerBeat = 60 / bpm

  const totalBeats = clip.loopBeats ?? clip.durationBeats
  const w          = Math.max(32, totalBeats * secPerBeat * zoom)
  const x          = clip.startTime * zoom
  const clipH      = TRACK_H - PAD * 2
  const NOTE_AREA_TOP = 16

  const dragRef = useRef<{ type: 'move' | 'extend' | 'loop'; startX: number; startVal: number } | null>(null)

  function startDrag(type: 'move' | 'extend' | 'loop', e: React.MouseEvent) {
    e.stopPropagation()
    if (!selected || e.shiftKey) onSelect(e)
    const startVal =
      type === 'move'   ? clip.startTime :
      type === 'extend' ? clip.durationBeats :
      (clip.loopBeats ?? clip.durationBeats)

    dragRef.current = { type, startX: e.clientX, startVal }
    const onMouseMove = (mv: MouseEvent) => {
      if (!dragRef.current) return
      const dx    = (mv.clientX - dragRef.current.startX) / zoom
      const beats = dx / secPerBeat
      if (type === 'move')   onMove(Math.max(0, snapSeconds(dragRef.current.startVal + dx, zoom, bpm)))
      else if (type === 'extend') onExtend(Math.max(0.5, snapBeats(dragRef.current.startVal + beats, zoom, bpm)))
      else onLoop(Math.max(clip.durationBeats, snapBeats(dragRef.current.startVal + beats, zoom, bpm)))
    }
    const onMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
  }

  const isLooped    = clip.loopBeats !== undefined && clip.loopBeats > clip.durationBeats
  const patternPx   = Math.max(32, clip.durationBeats * secPerBeat * zoom)
  const GAP         = 2
  const repCount    = isLooped ? Math.ceil(totalBeats / clip.durationBeats) : 1
  const blocks      = Array.from({ length: repCount }, (_, rep) => {
    const beatFrom = rep * clip.durationBeats
    const beatTo   = Math.min((rep + 1) * clip.durationBeats, totalBeats)
    const blockW   = Math.max(4, (beatTo - beatFrom) * secPerBeat * zoom - (rep > 0 ? GAP : 0))
    const blockX   = rep * (patternPx + GAP)
    return { rep, beatFrom, beatTo, blockW, blockX }
  })

  return (
    <div data-clip="true" data-midi-clip="true"
      onContextMenu={e => { e.preventDefault(); onRemove() }}
      style={{ position: 'absolute', left: x, top: PAD, width: w, height: clipH, userSelect: 'none', overflow: 'visible' }}>

      {isRenaming && (
        <input autoFocus value={renameVal}
          onChange={e => setRenameVal(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter')  { if (renameVal.trim()) onRename(renameVal.trim()); setIsRenaming(false) }
            if (e.key === 'Escape') { setIsRenaming(false) }
          }}
          onBlur={() => { if (renameVal.trim()) onRename(renameVal.trim()); setIsRenaming(false) }}
          onMouseDown={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 2, left: 5, zIndex: 20,
            background: C.bgDeep, border: `1px solid ${color}`,
            borderRadius: 2, color, fontSize: 10, fontWeight: 600,
            padding: '0 3px', outline: 'none', maxWidth: '80%' }} />
      )}

      <div onMouseDown={e => startDrag('move', e)}
        style={{ position: 'absolute', inset: 0, cursor: 'grab', zIndex: 2 }} />

      {blocks.map(({ rep, beatFrom, beatTo, blockW, blockX }) => {
        const isOriginal = rep === 0
        return (
          <div key={rep} style={{
            position: 'absolute', left: blockX, top: 0, width: blockW, height: clipH,
            background:   isOriginal ? color + '1a' : color + '0d',
            border:       `1.5px solid ${isOriginal ? (selected ? color : color + '70') : color + '45'}`,
            borderStyle:  isOriginal ? 'solid' : 'dashed',
            borderRadius: 4, overflow: 'hidden',
            boxShadow:    isOriginal && selected ? `0 0 0 1px ${color}50` : 'none',
            pointerEvents: 'none',
          }}>
            {isOriginal && !isRenaming && (
              <div
                onDoubleClick={e => { e.stopPropagation(); setRenameVal(clip.name); setIsRenaming(true) }}
                title="Double-click to rename"
                style={{ position: 'absolute', top: 3, left: 5,
                  fontSize: 10, fontWeight: 600, color,
                  textShadow: `0 1px 3px ${C.bgDeep}`,
                  overflow: 'hidden', whiteSpace: 'nowrap',
                  maxWidth: Math.max(0, blockW - 14),
                  pointerEvents: selected ? 'auto' : 'none', cursor: 'text', zIndex: 1 }}>
                {clip.name}
              </div>
            )}
            <MidiPreviewCanvas notes={clip.notes} durationBeats={clip.durationBeats}
              beatStart={beatFrom} beatEnd={beatTo} color={color}
              width={Math.round(blockW)} height={clipH - NOTE_AREA_TOP}
              top={NOTE_AREA_TOP} dimmed={!isOriginal} />
          </div>
        )
      })}

      <div onMouseDown={e => startDrag('extend', e)} title="Drag to extend clip duration"
        style={{ position: 'absolute', right: -MIDI_HANDLE_W, top: 0,
          width: MIDI_HANDLE_W, height: clipH / 2, cursor: 'ew-resize',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
        <div style={{ width: 4, height: '60%', background: selected ? color : C.border,
          borderRadius: 2, opacity: selected ? 1 : 0.5, transition: 'all 0.1s' }} />
      </div>

      <div onMouseDown={e => startDrag('loop', e)} title="Drag to loop/repeat clip"
        style={{ position: 'absolute', right: -MIDI_HANDLE_W, top: clipH / 2,
          width: MIDI_HANDLE_W, height: clipH / 2, cursor: 'ew-resize',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
        <div style={{ width: 4, height: '60%',
          background: isLooped ? color : C.border, borderRadius: 2,
          opacity: isLooped ? 1 : 0.4,
          boxShadow: isLooped ? `0 0 4px ${color}80` : 'none', transition: 'all 0.1s' }} />
      </div>

      <div style={{ position: 'absolute', right: -MIDI_HANDLE_W, top: clipH / 2 - 0.5,
        width: MIDI_HANDLE_W, height: 1, background: C.border,
        opacity: 0.5, pointerEvents: 'none', zIndex: 11 }} />
    </div>
  )
}
