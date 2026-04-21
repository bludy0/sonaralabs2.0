import { useRef, useEffect, useCallback, memo } from 'react'
import { useDAWStore }     from '../../store/useDAWStore'
import { getAudioContext } from '../../engine/context'
import { C } from '../../constants'
import type { DAWTrack, AudioClip as TAudioClip, MidiClip as TMidiClip } from '../../types'

const TRACK_H    = 72
const PAD        = 3
const HANDLE_W   = 6

interface Props { track: DAWTrack; zoom: number }

export function TrackRow({ track, zoom }: Props) {
  const selectedClipId = useDAWStore(s => s.selectedClipId)
  const addClip        = useDAWStore(s => s.addClip)
  const removeClip     = useDAWStore(s => s.removeClip)
  const moveClip       = useDAWStore(s => s.moveClip)
  const updateClip     = useDAWStore(s => s.updateClip)
  const selectClip     = useDAWStore(s => s.selectClip)
  const removeMidiClip = useDAWStore(s => s.removeMidiClip)

  // ── Drop audio file ───────────────────────────────────────────────────────
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (track.type !== 'audio') return
    const file = e.dataTransfer.files[0]
    if (!file) return
    const rect = e.currentTarget.getBoundingClientRect()
    const startTime = Math.max(0, (e.clientX - rect.left) / zoom)
    const ctx = getAudioContext()
    const ab  = await file.arrayBuffer()
    const buf = await ctx.decodeAudioData(ab)
    addClip(track.id, {
      name: file.name.replace(/\.[^.]+$/, ''),
      startTime, duration: buf.duration,
      trimStart: 0, trimEnd: 0,
      buffer: buf, url: '',
    })
  }

  return (
    <div
      style={{
        height: TRACK_H, position: 'relative',
        borderBottom: `1px solid ${C.borderDim}`,
      }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={onDrop}
    >
      <GridLines zoom={zoom} />

      {track.type === 'audio' && track.clips.map(clip => (
        <AudioClipBlock
          key={clip.id}
          clip={clip}
          zoom={zoom}
          color={track.color}
          selected={selectedClipId === clip.id}
          onSelect={() => selectClip(clip.id)}
          onMove={(newStart) => moveClip(track.id, clip.id, newStart)}
          onTrimStart={(t) => updateClip(track.id, clip.id, { trimStart: t })}
          onTrimEnd={(t)   => updateClip(track.id, clip.id, { trimEnd:   t })}
          onRemove={() => { removeClip(track.id, clip.id); selectClip(null) }}
        />
      ))}

      {track.type === 'midi' && track.clips.map(clip => (
        <MidiClipBlock
          key={clip.id}
          clip={clip}
          zoom={zoom}
          color={track.color}
          selected={selectedClipId === clip.id}
          onSelect={() => selectClip(clip.id)}
          onRemove={() => { removeMidiClip(track.id, clip.id); selectClip(null) }}
        />
      ))}
    </div>
  )
}

// ── Grid lines ────────────────────────────────────────────────────────────────
function GridLines({ zoom }: { zoom: number }) {
  const step = zoom > 80 ? 1 : zoom > 40 ? 2 : 4
  return (
    <>
      {Array.from({ length: Math.ceil(120 / step) }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: i * step * zoom, width: 1,
          background: C.borderDim, pointerEvents: 'none',
        }} />
      ))}
    </>
  )
}

// ── Waveform canvas ───────────────────────────────────────────────────────────
const WaveformCanvas = memo(function WaveformCanvas({
  buffer, color, width, height,
}: { buffer: AudioBuffer; color: string; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    const data  = buffer.getChannelData(0)
    const step  = Math.max(1, Math.floor(data.length / width))
    const mid   = height / 2

    ctx2d.clearRect(0, 0, width, height)
    ctx2d.fillStyle = color + '55'

    for (let x = 0; x < width; x++) {
      let min = 0, max = 0
      for (let j = 0; j < step; j++) {
        const v = data[x * step + j] ?? 0
        if (v < min) min = v
        if (v > max) max = v
      }
      const yTop = mid + min * mid
      const yBot = mid + max * mid
      ctx2d.fillRect(x, yTop, 1, Math.max(1, yBot - yTop))
    }

    // Center line
    ctx2d.fillStyle = color + '30'
    ctx2d.fillRect(0, mid, width, 1)
  }, [buffer, color, width, height])

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
function AudioClipBlock({
  clip, zoom, color, selected,
  onSelect, onMove, onTrimStart, onTrimEnd, onRemove,
}: {
  clip:        TAudioClip
  zoom:        number
  color:       string
  selected:    boolean
  onSelect:    () => void
  onMove:      (newStart: number) => void
  onTrimStart: (trimStart: number) => void
  onTrimEnd:   (trimEnd: number) => void
  onRemove:    () => void
}) {
  const effectiveDur = (clip.trimEnd || clip.duration) - clip.trimStart
  const w = Math.max(8, effectiveDur * zoom)
  const x = clip.startTime * zoom

  const dragRef = useRef<{ type: 'move' | 'trimL' | 'trimR'; startX: number; startVal: number } | null>(null)

  function startDrag(type: 'move' | 'trimL' | 'trimR', e: React.MouseEvent) {
    e.stopPropagation()
    onSelect()
    const startVal =
      type === 'move'  ? clip.startTime :
      type === 'trimL' ? clip.trimStart :
      clip.trimEnd || clip.duration

    dragRef.current = { type, startX: e.clientX, startVal }

    const onMouseMove = (mv: MouseEvent) => {
      if (!dragRef.current) return
      const dx   = (mv.clientX - dragRef.current.startX) / zoom
      const raw  = dragRef.current.startVal + dx

      if (type === 'move') {
        onMove(Math.max(0, raw))
      } else if (type === 'trimL') {
        const clamped = Math.max(0, Math.min(raw, (clip.trimEnd || clip.duration) - 0.05))
        onTrimStart(clamped)
      } else {
        const clamped = Math.max(clip.trimStart + 0.05, Math.min(raw, clip.duration))
        onTrimEnd(clamped === clip.duration ? 0 : clamped)
      }
    }
    const onMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
  }

  return (
    <div
      onContextMenu={e => { e.preventDefault(); onRemove() }}
      style={{
        position: 'absolute',
        left: x, top: PAD, width: w, height: TRACK_H - PAD * 2,
        background: color + '1a',
        border: `1.5px solid ${selected ? color : color + '70'}`,
        borderRadius: 4,
        overflow: 'hidden',
        userSelect: 'none',
        boxShadow: selected ? `0 0 0 1px ${color}50, inset 0 0 0 1px ${color}20` : 'none',
        transition: 'border-color 0.1s, box-shadow 0.1s',
      }}
    >
      {/* Waveform */}
      {clip.buffer && (
        <WaveformCanvas
          buffer={clip.buffer}
          color={color}
          width={Math.round(w)}
          height={TRACK_H - PAD * 2}
        />
      )}

      {/* Clip name */}
      <div style={{
        position: 'absolute', top: 3, left: HANDLE_W + 2,
        fontSize: 10, fontWeight: 600, color,
        pointerEvents: 'none', textOverflow: 'ellipsis',
        overflow: 'hidden', whiteSpace: 'nowrap',
        maxWidth: `calc(100% - ${HANDLE_W * 2 + 8}px)`,
        textShadow: `0 1px 3px ${C.bgDeep}`,
      }}>
        {clip.name}
      </div>

      {/* Left trim handle */}
      <div
        onMouseDown={e => startDrag('trimL', e)}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: HANDLE_W, cursor: 'ew-resize',
          background: selected ? color + '60' : 'transparent',
          borderRight: selected ? `1px solid ${color}` : 'none',
          transition: 'background 0.1s',
        }}
      />

      {/* Body — drag to move */}
      <div
        onMouseDown={e => startDrag('move', e)}
        style={{
          position: 'absolute',
          left: HANDLE_W, right: HANDLE_W, top: 0, bottom: 0,
          cursor: 'grab',
        }}
      />

      {/* Right trim handle */}
      <div
        onMouseDown={e => startDrag('trimR', e)}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: HANDLE_W, cursor: 'ew-resize',
          background: selected ? color + '60' : 'transparent',
          borderLeft: selected ? `1px solid ${color}` : 'none',
          transition: 'background 0.1s',
        }}
      />

      {/* Duration label (only if wide enough) */}
      {w > 60 && (
        <div style={{
          position: 'absolute', bottom: 3, right: HANDLE_W + 3,
          fontSize: 9, color: color + 'aa',
          pointerEvents: 'none',
          textShadow: `0 1px 2px ${C.bgDeep}`,
        }}>
          {effectiveDur.toFixed(1)}s
        </div>
      )}
    </div>
  )
}

// ── MIDI clip block ───────────────────────────────────────────────────────────
function MidiClipBlock({
  clip, zoom, color, selected, onSelect, onRemove,
}: {
  clip:     TMidiClip
  zoom:     number
  color:    string
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const bpm       = useDAWStore(s => s.transport.bpm)
  const secPerBeat = 60 / bpm
  const w = Math.max(32, clip.durationBeats * secPerBeat * zoom)
  const x = clip.startTime * zoom

  return (
    <div
      onMouseDown={e => { e.stopPropagation(); onSelect() }}
      onContextMenu={e => { e.preventDefault(); onRemove() }}
      style={{
        position: 'absolute',
        left: x, top: PAD, width: w, height: TRACK_H - PAD * 2,
        background: color + '18',
        border: `1.5px solid ${selected ? color : color + '60'}`,
        borderRadius: 4, cursor: 'pointer',
        overflow: 'hidden', userSelect: 'none',
        boxShadow: selected ? `0 0 0 1px ${color}50` : 'none',
      }}
    >
      {/* Mini piano roll preview */}
      <div style={{
        position: 'absolute', inset: '16px 4px 3px',
        display: 'flex', alignItems: 'flex-end', gap: 1,
      }}>
        {clip.notes.slice(0, 24).map(n => (
          <div key={n.id} style={{
            flex: '0 0 2px',
            height: `${25 + (n.pitch % 48)}%`,
            background: color,
            opacity: 0.5 + (n.velocity / 127) * 0.5,
            borderRadius: 1,
          }} />
        ))}
      </div>

      <div style={{
        position: 'absolute', top: 3, left: 5,
        fontSize: 10, fontWeight: 600, color,
        textShadow: `0 1px 3px ${C.bgDeep}`,
      }}>
        {clip.name}
      </div>
    </div>
  )
}
