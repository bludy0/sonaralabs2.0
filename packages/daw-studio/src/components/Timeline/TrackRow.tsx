import { useRef, useEffect, useCallback, memo } from 'react'
import { useDAWStore }     from '../../store/useDAWStore'
import { getAudioContext } from '../../engine/context'
import { C, alpha } from '../../constants'
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
  const addMidiClip    = useDAWStore(s => s.addMidiClip)
  const removeMidiClip = useDAWStore(s => s.removeMidiClip)
  const transport      = useDAWStore(s => s.transport)

  // ── Click empty MIDI track area → create new clip ────────────────────────
  function onMidiTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    if (track.type !== 'midi') return
    // Ignore if clicking an existing clip (they handle their own events)
    if ((e.target as HTMLElement).closest('[data-midi-clip]')) return
    const rect      = e.currentTarget.getBoundingClientRect()
    const startTime = Math.max(0, (e.clientX - rect.left) / zoom)
    const snapEnabled = transport.snapEnabled
    const secPerBeat  = 60 / transport.bpm
    const snappedStart = snapEnabled
      ? Math.round(startTime / secPerBeat) * secPerBeat
      : startTime
    const clipId = addMidiClip(track.id, {
      name:          'MIDI Clip',
      startTime:     snappedStart,
      durationBeats: 4,   // 1 bar default
      notes:         [],
    })
    selectClip(clipId)
  }

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
      fadeIn: 0, fadeOut: 0,
      buffer: buf, url: '',
    })
  }

  return (
    <div
      style={{
        height: TRACK_H, position: 'relative',
        borderBottom: `1px solid ${C.borderDim}`,
        cursor: track.type === 'midi' ? 'crosshair' : 'default',
        overflow: 'visible',   // allow MIDI handles to poke outside
      }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={onDrop}
      onClick={onMidiTrackClick}
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
          onFadeIn={(t)    => updateClip(track.id, clip.id, { fadeIn:    t })}
          onFadeOut={(t)   => updateClip(track.id, clip.id, { fadeOut:   t })}
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
          onMove={(newStart) => {
            useDAWStore.getState().updateMidiClip(track.id, clip.id, { startTime: Math.max(0, newStart) })
          }}
          onExtend={(beats) => {
            useDAWStore.getState().updateMidiClip(track.id, clip.id, {
              durationBeats: Math.max(0.5, beats),
              loopBeats: clip.loopBeats !== undefined
                ? Math.max(Math.max(0.5, beats), clip.loopBeats)
                : undefined,
            })
          }}
          onLoop={(loopBeats) => {
            useDAWStore.getState().updateMidiClip(track.id, clip.id, {
              loopBeats: loopBeats <= clip.durationBeats + 0.1 ? undefined : loopBeats,
            })
          }}
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
  onSelect, onMove, onTrimStart, onTrimEnd, onFadeIn, onFadeOut, onRemove,
}: {
  clip:        TAudioClip
  zoom:        number
  color:       string
  selected:    boolean
  onSelect:    () => void
  onMove:      (newStart: number) => void
  onTrimStart: (trimStart: number) => void
  onTrimEnd:   (trimEnd: number) => void
  onFadeIn:    (fadeIn: number) => void
  onFadeOut:   (fadeOut: number) => void
  onRemove:    () => void
}) {
  const bpm          = useDAWStore(s => s.transport.bpm)
  const effectiveDur = (clip.trimEnd || clip.duration) - clip.trimStart
  const w = Math.max(8, effectiveDur * zoom)
  const x = clip.startTime * zoom

  const dragRef = useRef<{ type: 'move' | 'trimL' | 'trimR' | 'fadeIn' | 'fadeOut'; startX: number; startVal: number } | null>(null)

  function startDrag(type: 'move' | 'trimL' | 'trimR' | 'fadeIn' | 'fadeOut', e: React.MouseEvent) {
    e.stopPropagation()
    onSelect()
    const startVal =
      type === 'move'    ? clip.startTime :
      type === 'trimL'   ? clip.trimStart :
      type === 'trimR'   ? (clip.trimEnd || clip.duration) :
      type === 'fadeIn'  ? clip.fadeIn :
      clip.fadeOut

    dragRef.current = { type, startX: e.clientX, startVal }

    const onMouseMove = (mv: MouseEvent) => {
      if (!dragRef.current) return
      const dx   = (mv.clientX - dragRef.current.startX) / zoom
      const raw  = dragRef.current.startVal + dx

      if (type === 'move') {
        onMove(Math.max(0, snapSeconds(raw, zoom, bpm)))
      } else if (type === 'trimL') {
        const clamped = Math.max(0, Math.min(raw, (clip.trimEnd || clip.duration) - 0.05))
        onTrimStart(clamped)
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

      {/* Fade-in overlay (triangle shape via clip-path) */}
      {clip.fadeIn > 0 && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: Math.max(4, clip.fadeIn * zoom),
          background: `linear-gradient(to right, ${alpha(C.bgDeep, 80)}, transparent)`,
          pointerEvents: 'none',
        }}/>
      )}

      {/* Fade-out overlay */}
      {clip.fadeOut > 0 && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: Math.max(4, clip.fadeOut * zoom),
          background: `linear-gradient(to left, ${alpha(C.bgDeep, 80)}, transparent)`,
          pointerEvents: 'none',
        }}/>
      )}

      {/* Fade-in handle (top-left corner dot) */}
      {selected && (
        <div
          onMouseDown={e => startDrag('fadeIn', e)}
          title="Drag to set fade-in"
          style={{
            position: 'absolute',
            left: Math.max(HANDLE_W, clip.fadeIn * zoom) - 5,
            top: 2,
            width: 10, height: 10,
            borderRadius: '50%',
            background: color,
            border: `1.5px solid ${C.bgDeep}`,
            cursor: 'ew-resize',
            zIndex: 3,
          }}
        />
      )}

      {/* Fade-out handle (top-right corner dot) */}
      {selected && (
        <div
          onMouseDown={e => startDrag('fadeOut', e)}
          title="Drag to set fade-out"
          style={{
            position: 'absolute',
            right: Math.max(HANDLE_W, clip.fadeOut * zoom) - 5,
            top: 2,
            width: 10, height: 10,
            borderRadius: '50%',
            background: color,
            border: `1.5px solid ${C.bgDeep}`,
            cursor: 'ew-resize',
            zIndex: 3,
          }}
        />
      )}

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

const MIDI_HANDLE_W   = 8
const MIDI_HANDLE_ZONE = 10   // px from right edge that counts as handle zone

// ── Magnetic snap helpers ─────────────────────────────────────────────────────
const SNAP_GRID         = 0.25   // quarter-beat resolution
const SNAP_THRESHOLD_PX = 10     // px proximity to trigger snap

function snapBeats(beats: number, zoom: number, bpm: number): number {
  const secPerBeat = 60 / bpm
  const pxPerBeat  = secPerBeat * zoom
  const snapped    = Math.round(beats / SNAP_GRID) * SNAP_GRID
  return Math.abs(beats - snapped) * pxPerBeat < SNAP_THRESHOLD_PX ? snapped : beats
}

function snapSeconds(secs: number, zoom: number, bpm: number): number {
  const secPerBeat = 60 / bpm
  const snapped    = Math.round(secs / secPerBeat / SNAP_GRID) * SNAP_GRID * secPerBeat
  return Math.abs(secs - snapped) * zoom < SNAP_THRESHOLD_PX ? snapped : secs
}

// ── MIDI clip block ───────────────────────────────────────────────────────────
function MidiClipBlock({
  clip, zoom, color, selected,
  onSelect, onRemove, onMove, onExtend, onLoop,
}: {
  clip:     TMidiClip
  zoom:     number
  color:    string
  selected: boolean
  onSelect:  () => void
  onRemove:  () => void
  onMove:    (newStart: number) => void
  onExtend:  (beats: number) => void
  onLoop:    (loopBeats: number) => void
}) {
  const bpm        = useDAWStore(s => s.transport.bpm)
  const secPerBeat = 60 / bpm

  const totalBeats = clip.loopBeats ?? clip.durationBeats
  const w = Math.max(32, totalBeats * secPerBeat * zoom)
  const x = clip.startTime * zoom

  const clipH         = TRACK_H - PAD * 2
  const NOTE_AREA_TOP = 16

  const dragRef = useRef<{
    type: 'move' | 'extend' | 'loop'
    startX: number
    startVal: number
  } | null>(null)

  function startDrag(type: 'move' | 'extend' | 'loop', e: React.MouseEvent) {
    e.stopPropagation()
    onSelect()
    const startVal =
      type === 'move'   ? clip.startTime :
      type === 'extend' ? clip.durationBeats :
      /* loop */          (clip.loopBeats ?? clip.durationBeats)

    dragRef.current = { type, startX: e.clientX, startVal }

    const onMouseMove = (mv: MouseEvent) => {
      if (!dragRef.current) return
      const dx    = (mv.clientX - dragRef.current.startX) / zoom
      const beats = dx / secPerBeat

      if (type === 'move') {
        onMove(Math.max(0, snapSeconds(dragRef.current.startVal + dx, zoom, bpm)))
      } else if (type === 'extend') {
        onExtend(Math.max(0.5, snapBeats(dragRef.current.startVal + beats, zoom, bpm)))
      } else {
        onLoop(Math.max(clip.durationBeats, snapBeats(dragRef.current.startVal + beats, zoom, bpm)))
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

  const isLooped   = clip.loopBeats !== undefined && clip.loopBeats > clip.durationBeats
  const patternPx  = Math.max(32, clip.durationBeats * secPerBeat * zoom)
  const GAP        = 2   // px gap between blocks

  // Build one block per repetition (rep 0 = original, rep 1+ = copies)
  const repCount   = isLooped ? Math.ceil(totalBeats / clip.durationBeats) : 1
  const blocks     = Array.from({ length: repCount }, (_, rep) => {
    const beatFrom = rep * clip.durationBeats
    const beatTo   = Math.min((rep + 1) * clip.durationBeats, totalBeats)
    const blockW   = Math.max(4, (beatTo - beatFrom) * secPerBeat * zoom - (rep > 0 ? GAP : 0))
    const blockX   = rep * (patternPx + GAP)
    return { rep, beatFrom, beatTo, blockW, blockX }
  })

  return (
    <div
      data-midi-clip="true"
      onContextMenu={e => { e.preventDefault(); onRemove() }}
      style={{
        position:  'absolute',
        left: x, top: PAD, width: w, height: clipH,
        userSelect: 'none',
        overflow:  'visible',
      }}
    >
      {/* ── Invisible move-drag overlay (full width) ── */}
      <div
        onMouseDown={e => startDrag('move', e)}
        style={{ position: 'absolute', inset: 0, cursor: 'grab', zIndex: 2 }}
      />

      {/* ── One block per repetition ── */}
      {blocks.map(({ rep, beatFrom, beatTo, blockW, blockX }) => {
        const isOriginal = rep === 0
        return (
          <div
            key={rep}
            style={{
              position:     'absolute',
              left:         blockX, top: 0,
              width:        blockW, height: clipH,
              background:   isOriginal ? color + '1a' : color + '0d',
              border:       `1.5px solid ${isOriginal
                              ? (selected ? color : color + '70')
                              : color + '45'}`,
              borderStyle:  isOriginal ? 'solid' : 'dashed',
              borderRadius: 4,
              overflow:     'hidden',
              boxShadow:    isOriginal && selected ? `0 0 0 1px ${color}50` : 'none',
              pointerEvents:'none',
            }}
          >
            {/* Label — only on original */}
            {isOriginal && (
              <div style={{
                position:     'absolute', top: 3, left: 5,
                fontSize:     10, fontWeight: 600, color,
                textShadow:   `0 1px 3px ${C.bgDeep}`,
                overflow:     'hidden', whiteSpace: 'nowrap',
                maxWidth:     Math.max(0, blockW - 14),
                pointerEvents:'none', zIndex: 1,
              }}>
                {clip.name}
              </div>
            )}

            {/* Note preview for this repetition's beat window */}
            <MidiPreviewCanvas
              notes={clip.notes}
              durationBeats={clip.durationBeats}
              beatStart={beatFrom}
              beatEnd={beatTo}
              color={color}
              width={Math.round(blockW)}
              height={clipH - NOTE_AREA_TOP}
              top={NOTE_AREA_TOP}
              dimmed={!isOriginal}
            />
          </div>
        )
      })}

      {/* ── Right-edge handles (outside overflow) ── */}

      {/* EXTEND handle — top half */}
      <div
        onMouseDown={e => startDrag('extend', e)}
        title="Drag to extend clip duration"
        style={{
          position:   'absolute',
          right:      -MIDI_HANDLE_W,
          top:        0,
          width:      MIDI_HANDLE_W,
          height:     clipH / 2,
          cursor:     'ew-resize',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex:     10,
        }}
      >
        <div style={{
          width:        4,
          height:       '60%',
          background:   selected ? color : C.border,
          borderRadius: 2,
          opacity:      selected ? 1 : 0.5,
          transition:   'all 0.1s',
        }}/>
      </div>

      {/* LOOP handle — bottom half */}
      <div
        onMouseDown={e => startDrag('loop', e)}
        title="Drag to loop/repeat clip"
        style={{
          position:   'absolute',
          right:      -MIDI_HANDLE_W,
          top:        clipH / 2,
          width:      MIDI_HANDLE_W,
          height:     clipH / 2,
          cursor:     'ew-resize',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex:     10,
        }}
      >
        <div style={{
          width:        4,
          height:       '60%',
          background:   isLooped ? color : C.border,
          borderRadius: 2,
          opacity:      isLooped ? 1 : 0.4,
          boxShadow:    isLooped ? `0 0 4px ${color}80` : 'none',
          transition:   'all 0.1s',
        }}/>
      </div>

      {/* Divider between extend/loop handles */}
      <div style={{
        position:   'absolute',
        right:      -MIDI_HANDLE_W,
        top:        clipH / 2 - 0.5,
        width:      MIDI_HANDLE_W,
        height:     1,
        background: C.border,
        opacity:    0.5,
        pointerEvents: 'none',
        zIndex:     11,
      }}/>
    </div>
  )
}

// ── MIDI preview canvas ────────────────────────────────────────────────────────
const MidiPreviewCanvas = memo(function MidiPreviewCanvas({
  notes, durationBeats, beatStart = 0, beatEnd, color, width, height, top, dimmed = false,
}: {
  notes:         import('../../types').MidiNote[]
  durationBeats: number
  beatStart?:    number   // start of visible beat window (default 0)
  beatEnd?:      number   // end   of visible beat window (default durationBeats)
  color:         string
  width:         number
  height:        number
  top:           number
  dimmed?:       boolean  // render at 50% opacity (repeat block)
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const windowEnd = beatEnd ?? durationBeats

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || notes.length === 0) {
      ctx?.clearRect(0, 0, width, height)
      return
    }

    ctx.clearRect(0, 0, width, height)

    const windowLen   = windowEnd - beatStart   // beats visible in this canvas
    const patternBeats = durationBeats

    // Pitch range — computed from all notes for consistency between blocks
    const pitches = notes.map(n => n.pitch)
    const minP    = Math.max(0,   Math.min(...pitches) - 2)
    const maxP    = Math.min(127, Math.max(...pitches) + 2)
    const range   = Math.max(maxP - minP, 4)
    const NOTE_H  = Math.max(1, Math.min(4, Math.floor(height / range)))

    // Parse color hex → rgba
    const hex = color.replace('#', '')
    const r   = parseInt(hex.slice(0, 2), 16)
    const g   = parseInt(hex.slice(2, 4), 16)
    const b   = parseInt(hex.slice(4, 6), 16)

    // Iterate enough pattern repetitions to cover the window
    const loopCount = Math.ceil(windowEnd / patternBeats)

    for (let rep = 0; rep < loopCount; rep++) {
      const offsetBeats = rep * patternBeats

      for (const note of notes) {
        const absStart = offsetBeats + note.startBeat
        const absEnd   = absStart + note.durationBeats

        // Skip notes outside our window
        if (absEnd   <= beatStart) continue
        if (absStart >= windowEnd) continue

        // Map to canvas coords relative to beatStart
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
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top, left: 0,
        pointerEvents: 'none',
      }}
    />
  )
})
