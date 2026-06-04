import { useState } from 'react'
import { useDAWStore }     from '../../store/useDAWStore'
import { getAudioContext } from '../../engine/context'
import { C, alpha }        from '../../constants'
import type { DAWTrack }   from '../../types'
import { AudioClipBlock }  from './AudioClipBlock'
import { MidiClipBlock }   from './MidiClipBlock'

// MIME type used for BrowserPanel → TrackLane drag
export const DND_ITEM_TYPE = 'application/x-daw-item'

interface Props { track: DAWTrack; zoom: number }

export function TrackRow({ track, zoom }: Props) {
  const selectedClipIds = useDAWStore(s => s.selectedClipIds)
  const addClip         = useDAWStore(s => s.addClip)
  const removeClip      = useDAWStore(s => s.removeClip)
  const moveClip        = useDAWStore(s => s.moveClip)
  const updateClip      = useDAWStore(s => s.updateClip)
  const selectClip      = useDAWStore(s => s.selectClip)
  const selectTrack     = useDAWStore(s => s.selectTrack)
  const toggleClipSel   = useDAWStore(s => s.toggleClipSelection)
  const addMidiClip     = useDAWStore(s => s.addMidiClip)
  const removeMidiClip  = useDAWStore(s => s.removeMidiClip)
  const transport       = useDAWStore(s => s.transport)
  const trackHeight     = useDAWStore(s => s.trackHeight)
  const [dragOver, setDragOver] = useState(false)

  // ── Click empty MIDI track area → create new clip ────────────────────────
  function onMidiTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    if (track.type !== 'midi') return
    if ((e.target as HTMLElement).closest('[data-midi-clip]')) return
    e.stopPropagation()
    const rect        = e.currentTarget.getBoundingClientRect()
    const startTime   = Math.max(0, (e.clientX - rect.left) / zoom)
    const secPerBeat  = 60 / transport.bpm
    const snappedStart = transport.snapEnabled
      ? Math.round(startTime / secPerBeat) * secPerBeat
      : startTime
    const clipId = addMidiClip(track.id, { name: 'MIDI Clip', startTime: snappedStart, durationBeats: 4, notes: [] })
    selectClip(clipId)
  }

  // ── Drop handler — accepts library items AND raw audio files ─────────────
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (track.type !== 'audio') return

    const rect      = e.currentTarget.getBoundingClientRect()
    const startTime = Math.max(0, (e.clientX - rect.left) / zoom)
    const ctx       = getAudioContext()

    // Case 1: dragged from BrowserPanel or SamplesPanel
    const itemJson = e.dataTransfer.getData(DND_ITEM_TYPE)
    if (itemJson) {
      try {
        const payload = JSON.parse(itemJson) as { audioUrl?: string; sampleId?: string; name: string }
        let buf: AudioBuffer
        if (payload.sampleId) {
          const { lookupBuffer } = await import('../../lib/sampleRegistry')
          const cached = lookupBuffer(payload.sampleId)
          if (!cached) return
          buf = cached
        } else if (payload.audioUrl) {
          const resp = await fetch(payload.audioUrl, { credentials: 'include' })
          buf = await ctx.decodeAudioData(await resp.arrayBuffer())
        } else { return }
        addClip(track.id, { name: payload.name, startTime, duration: buf.duration, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, buffer: buf, url: payload.audioUrl ?? '' })
      } catch { /* decode error — silently skip */ }
      return
    }

    // Case 2: raw file from OS
    const file = e.dataTransfer.files[0]
    if (!file) return
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer())
      addClip(track.id, { name: file.name.replace(/\.[^.]+$/, ''), startTime, duration: buf.duration, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, buffer: buf, url: '' })
    } catch { /* unsupported format — silently skip */ }
  }

  return (
    <div
      style={{
        height: trackHeight, position: 'relative',
        borderBottom: `1px solid ${C.borderDim}`,
        cursor: track.type === 'midi' ? 'crosshair' : 'default',
        overflow: 'visible',
        boxShadow: dragOver && track.type === 'audio'
          ? `inset 0 0 0 2px ${C.accent}, inset 0 0 20px ${alpha(C.accent, 15)}`
          : 'none',
        transition: 'box-shadow 0.1s',
      }}
      onDragEnter={e => {
        if (track.type !== 'audio') return
        const types = Array.from(e.dataTransfer.types)
        if (types.includes(DND_ITEM_TYPE) || types.includes('Files')) setDragOver(true)
      }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={onDrop}
      onClick={onMidiTrackClick}
    >
      <GridLines zoom={zoom} />

      {track.type === 'audio' && track.clips.map(clip => (
        <AudioClipBlock
          key={clip.id} clip={clip} zoom={zoom} color={track.color} trackH={trackHeight}
          selected={selectedClipIds.includes(clip.id)}
          onSelect={(e) => e?.shiftKey ? toggleClipSel(clip.id) : (selectClip(clip.id), selectTrack(track.id))}
          onMove={(s)       => moveClip(track.id, clip.id, s)}
          onTrimStart={(st, t) => updateClip(track.id, clip.id, { startTime: st, trimStart: t })}
          onTrimEnd={(t)    => updateClip(track.id, clip.id, { trimEnd:   t })}
          onFadeIn={(t)     => updateClip(track.id, clip.id, { fadeIn:    t })}
          onFadeOut={(t)    => updateClip(track.id, clip.id, { fadeOut:   t })}
          onRemove={() => { removeClip(track.id, clip.id); selectClip(null) }}
          onRename={(name)  => updateClip(track.id, clip.id, { name })}
        />
      ))}

      {track.type === 'midi' && track.clips.map(clip => (
        <MidiClipBlock
          key={clip.id} clip={clip} zoom={zoom} color={track.color} trackH={trackHeight}
          selected={selectedClipIds.includes(clip.id)}
          onSelect={(e) => e?.shiftKey ? toggleClipSel(clip.id) : (selectClip(clip.id), selectTrack(track.id))}
          onRemove={() => { removeMidiClip(track.id, clip.id); selectClip(null) }}
          onMove={(s)      => useDAWStore.getState().updateMidiClip(track.id, clip.id, { startTime: Math.max(0, s) })}
          onExtend={(b)    => useDAWStore.getState().updateMidiClip(track.id, clip.id, {
            durationBeats: Math.max(0.5, b),
            loopBeats: clip.loopBeats !== undefined ? Math.max(Math.max(0.5, b), clip.loopBeats) : undefined,
          })}
          onLoop={(lb)     => useDAWStore.getState().updateMidiClip(track.id, clip.id, {
            loopBeats: lb <= clip.durationBeats + 0.1 ? undefined : lb,
          })}
          onRename={(name) => useDAWStore.getState().updateMidiClip(track.id, clip.id, { name })}
        />
      ))}
    </div>
  )
}

// ── Grid lines ─────────────────────────────────────────────────────────────────
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
