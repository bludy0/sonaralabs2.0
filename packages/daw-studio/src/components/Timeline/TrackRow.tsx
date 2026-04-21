import { useRef } from 'react'
import { useDAWStore }    from '../../store/useDAWStore'
import { getAudioContext } from '../../engine/context'
import { C } from '../../constants'
import type { DAWTrack, AudioClip as TAudioClip, MidiClip as TMidiClip } from '../../types'

const TRACK_H = 72
const CLIP_INNER_PAD = 3

interface Props {
  track: DAWTrack
  zoom:  number
}

export function TrackRow({ track, zoom }: Props) {
  const selectedClipId = useDAWStore(s => s.selectedClipId)
  const addClip        = useDAWStore(s => s.addClip)
  const removeClip     = useDAWStore(s => s.removeClip)
  const moveClip       = useDAWStore(s => s.moveClip)
  const selectClip     = useDAWStore(s => s.selectClip)
  const removeMidiClip = useDAWStore(s => s.removeMidiClip)

  const dragRef = useRef<{
    clipId: string; trackId: string
    startX: number; startTime: number
  } | null>(null)

  // Drop audio file onto lane
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
      name:      file.name.replace(/\.[^.]+$/, ''),
      startTime,
      duration:  buf.duration,
      trimStart: 0,
      trimEnd:   0,
      buffer:    buf,
      url:       '',
    })
  }

  function onClipMouseDown(e: React.MouseEvent, clipId: string, startTime: number) {
    if (e.button !== 0) return
    e.stopPropagation()
    selectClip(clipId)
    dragRef.current = { clipId, trackId: track.id, startX: e.clientX, startTime }

    const onMove = (mv: MouseEvent) => {
      if (!dragRef.current) return
      const dx    = mv.clientX - dragRef.current.startX
      const newT  = dragRef.current.startTime + dx / zoom
      moveClip(track.id, clipId, newT)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  return (
    <div
      style={{
        height: TRACK_H,
        position: 'relative',
        borderBottom: `1px solid ${C.borderDim}`,
        background: 'transparent',
      }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={onDrop}
    >
      {/* Grid lines */}
      <GridLines zoom={zoom} />

      {/* Clips */}
      {track.type === 'audio' && track.clips.map(clip => (
        <AudioClipBlock
          key={clip.id}
          clip={clip}
          zoom={zoom}
          color={track.color}
          selected={selectedClipId === clip.id}
          onMouseDown={onClipMouseDown}
          onRemove={() => { removeClip(track.id, clip.id); selectClip(null) }}
        />
      ))}

      {track.type === 'midi' && track.clips.map(clip => {
        const bpm     = useDAWStore.getState().transport.bpm
        const secPBeat = 60 / bpm
        const w = clip.durationBeats * secPBeat * zoom
        return (
          <MidiClipBlock
            key={clip.id}
            clip={clip}
            zoom={zoom}
            color={track.color}
            selected={selectedClipId === clip.id}
            onMouseDown={e => { e.stopPropagation(); selectClip(clip.id) }}
            onRemove={() => { removeMidiClip(track.id, clip.id); selectClip(null) }}
          />
        )
      })}
    </div>
  )
}

function GridLines({ zoom }: { zoom: number }) {
  const step = zoom > 80 ? 1 : zoom > 40 ? 2 : 4
  const count = Math.ceil(60 / step)
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: 0, bottom: 0,
          left: i * step * zoom,
          width: 1,
          background: C.borderDim,
          pointerEvents: 'none',
        }}/>
      ))}
    </>
  )
}

function AudioClipBlock({
  clip, zoom, color, selected, onMouseDown, onRemove,
}: {
  clip: TAudioClip
  zoom: number
  color: string
  selected: boolean
  onMouseDown: (e: React.MouseEvent, id: string, start: number) => void
  onRemove: () => void
}) {
  const effectiveDur = (clip.trimEnd || clip.duration) - clip.trimStart
  const w = Math.max(4, effectiveDur * zoom)
  const x = clip.startTime * zoom

  return (
    <div
      onMouseDown={e => onMouseDown(e, clip.id, clip.startTime)}
      onContextMenu={e => { e.preventDefault(); onRemove() }}
      style={{
        position: 'absolute',
        left: x, top: CLIP_INNER_PAD,
        width: w, height: TRACK_H - CLIP_INNER_PAD * 2,
        background: color + '28',
        border: `1.5px solid ${selected ? color : color + '80'}`,
        borderRadius: 4,
        cursor: 'grab',
        overflow: 'hidden',
        userSelect: 'none',
        boxShadow: selected ? `0 0 0 1px ${color}60` : 'none',
        transition: 'border-color 0.1s, box-shadow 0.1s',
      }}
    >
      {/* Waveform placeholder bars */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', paddingInline: 4, gap: 1,
      }}>
        <WaveformBars seed={clip.id} color={color} />
      </div>

      {/* Label */}
      <div style={{
        position: 'absolute', top: 2, left: 5,
        fontSize: 10, fontWeight: 600,
        color: color, opacity: 0.9,
        pointerEvents: 'none',
        textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
        maxWidth: '90%',
      }}>
        {clip.name}
      </div>
    </div>
  )
}

function WaveformBars({ seed, color }: { seed: string; color: string }) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const bars = Array.from({ length: 24 }, () => {
    h = (h * 1664525 + 1013904223) >>> 0
    return (h % 55) + 10
  })
  return (
    <>
      {bars.map((pct, i) => (
        <div key={i} style={{
          flex: '0 0 2px',
          height: `${pct}%`,
          background: color,
          opacity: 0.45,
          borderRadius: 1,
        }}/>
      ))}
    </>
  )
}

function MidiClipBlock({
  clip, zoom, color, selected, onMouseDown, onRemove,
}: {
  clip: TMidiClip
  zoom: number
  color: string
  selected: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onRemove: () => void
}) {
  const bpm      = useDAWStore(s => s.transport.bpm)
  const secPBeat = 60 / bpm
  const w = Math.max(32, clip.durationBeats * secPBeat * zoom)
  const x = clip.startTime * zoom

  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={e => { e.preventDefault(); onRemove() }}
      style={{
        position: 'absolute',
        left: x, top: CLIP_INNER_PAD,
        width: w, height: TRACK_H - CLIP_INNER_PAD * 2,
        background: color + '20',
        border: `1.5px solid ${selected ? color : color + '60'}`,
        borderRadius: 4, cursor: 'pointer',
        overflow: 'hidden', userSelect: 'none',
        boxShadow: selected ? `0 0 0 1px ${color}50` : 'none',
      }}
    >
      {/* Mini note preview */}
      <div style={{
        position: 'absolute', inset: '4px 4px 2px',
        display: 'flex', alignItems: 'flex-end', gap: 1,
      }}>
        {clip.notes.slice(0, 16).map(n => (
          <div key={n.id} style={{
            flex: '0 0 2px',
            height: `${30 + (n.pitch % 40)}%`,
            background: color,
            opacity: 0.6,
            borderRadius: 1,
          }}/>
        ))}
      </div>
      <div style={{
        position: 'absolute', top: 2, left: 5,
        fontSize: 10, fontWeight: 600, color,
      }}>
        {clip.name}
      </div>
    </div>
  )
}
