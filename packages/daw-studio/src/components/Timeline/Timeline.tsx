import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useDAWStore }    from '../../store/useDAWStore'
import { useAudioEngine } from '../../store/useAudioEngine'
import { C, alpha, TRACK_COLORS } from '../../constants'
import { getCSSVar, useThemeVersion } from '../../lib/cssVars'
import { AUTOMATION_PARAM_LABELS } from '../../types'
import { TrackRow, DND_ITEM_TYPE } from './TrackRow'
import { AutomationLaneView } from '../AutomationLane/AutomationLaneView'
import { AutomationLaneHeader } from '../AutomationLane/AutomationLaneHeader'
import { getAudioContext } from '../../engine/context'

const HEADER_W = 240
const RULER_H  = 28

export function Timeline() {
  const tracks          = useDAWStore(s => s.tracks)
  const automationLanes = useDAWStore(s => s.automationLanes)
  const zoom            = useDAWStore(s => s.zoom)
  const setZoom         = useDAWStore(s => s.setZoom)
  const transport       = useDAWStore(s => s.transport)
  const addAudioTrack   = useDAWStore(s => s.addAudioTrack)
  const addClip         = useDAWStore(s => s.addClip)
  const { currentTime, seek } = useAudioEngine()
  const setLoop = useDAWStore(s => s.setLoop)

  const rulerRef    = useRef<HTMLCanvasElement>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const loopDragRef = useRef<{ which: 'start' | 'end' } | null>(null)
  const themeVersion = useThemeVersion()

  // ── Marquee (rubber-band) selection ───────────────────────────────────────
  // All coords are in "content space" (px relative to scrollable content origin)
  const marqueeStartRef = useRef<{ cx: number; cy: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const selectClipsInRect = useDAWStore(s => s.selectClipsInRect)

  // Ruler canvas draw — CSS değişkenleri canvas 2D API tarafından çözülemediğinden
  // getCSSVar() ile hesaplanan değerleri kullanıyoruz; themeVersion tema değişimini tetikler
  useEffect(() => {
    const canvas = rulerRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width

    // Renkleri çözümle (her çizimde taze değer)
    const bgSubtle  = getCSSVar('--daw-subtle')
    const border    = getCSSVar('--daw-border')
    const text2     = getCSSVar('--daw-text2')
    const text3     = getCSSVar('--daw-text3')

    ctx.clearRect(0, 0, W, RULER_H)
    ctx.fillStyle = bgSubtle
    ctx.fillRect(0, 0, W, RULER_H)

    // Bottom border line
    ctx.fillStyle = border
    ctx.fillRect(0, RULER_H - 1, W, 1)

    const step  = pickStep(zoom)
    const total = W / zoom + 4

    ctx.font      = '10px "Inter", system-ui'
    ctx.textAlign = 'left'
    ctx.lineWidth = 1

    for (let t = 0; t < total; t += step) {
      const x       = Math.round(t * zoom)
      const isMajor = Math.round(t / step) % 4 === 0
      ctx.beginPath()
      ctx.moveTo(x, isMajor ? 6 : 16)
      ctx.lineTo(x, RULER_H - 1)
      ctx.strokeStyle = isMajor ? text3 : border
      ctx.stroke()
      if (isMajor) {
        ctx.fillStyle = text2
        ctx.fillText(formatTime(t), x + 2, 9)
      }
    }

    // Draw loop markers when loop is enabled
    if (transport.loopEnabled) {
      const accentHex = getCSSVar('--daw-accent') || '#ffdc73'
      ctx.fillStyle = accentHex

      const startX = Math.round(transport.loopStart * zoom)
      const endX   = Math.round(transport.loopEnd   * zoom)

      // Start triangle (pointing down)
      ctx.beginPath()
      ctx.moveTo(startX - 5, 0)
      ctx.lineTo(startX + 5, 0)
      ctx.lineTo(startX, 9)
      ctx.closePath()
      ctx.fill()
      // Start line
      ctx.fillRect(startX, 0, 1, RULER_H)

      // End triangle
      ctx.beginPath()
      ctx.moveTo(endX - 5, 0)
      ctx.lineTo(endX + 5, 0)
      ctx.lineTo(endX, 9)
      ctx.closePath()
      ctx.fill()
      // End line
      ctx.fillRect(endX - 1, 0, 1, RULER_H)
    }
  }, [zoom, themeVersion, transport.loopEnabled, transport.loopStart, transport.loopEnd])

  // ── Marquee handlers ──────────────────────────────────────────────────────
  const TRACK_H_PX  = 72
  const LANE_H_PX   = 56
  const PAD_PX      = 4

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
    if (e.clientY - containerRect.top < RULER_H_PX) return

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
      let yOff = RULER_H_PX

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
  }, [zoom, selectClipsInRect])   // eslint-disable-line react-hooks/exhaustive-deps

  // Keep RULER_H accessible as local const for onScrollAreaMouseDown closure
  const RULER_H_PX = RULER_H

  // Scroll with wheel (horizontal zoom on Ctrl+wheel)
  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9))
    }
  }

  // Click ruler to seek (or drag loop handles)
  function onRulerMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect     = e.currentTarget.getBoundingClientRect()
    const scrollX  = scrollRef.current?.scrollLeft ?? 0
    const x        = e.clientX - rect.left + scrollX
    const t        = Math.max(0, x / zoom)
    const threshold = 10 / zoom   // 10px grab radius in seconds

    if (transport.loopEnabled) {
      const startDist = Math.abs(t - transport.loopStart)
      const endDist   = Math.abs(t - transport.loopEnd)

      if (startDist < threshold || endDist < threshold) {
        const which: 'start' | 'end' = startDist < endDist ? 'start' : 'end'
        loopDragRef.current = { which }
        e.preventDefault()

        // Snapshot at drag start so setLoop calls are stable
        let ls = transport.loopStart
        let le = transport.loopEnd

        const onMove = (mv: MouseEvent) => {
          const r  = rulerRef.current!.getBoundingClientRect()
          const sx = scrollRef.current?.scrollLeft ?? 0
          const tx = Math.max(0, (mv.clientX - r.left + sx) / zoom)
          if (which === 'start') {
            ls = Math.min(tx, le - 0.25)
          } else {
            le = Math.max(tx, ls + 0.25)
          }
          setLoop(ls, le)
        }
        const onUp = () => {
          loopDragRef.current = null
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return
      }
    }

    // Not near a loop handle → seek
    if (!loopDragRef.current) seek(t)
  }

  // ── Timeline-level drop: catches drops on empty lanes or when no tracks exist ──
  async function handleTimelineDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const itemJson = e.dataTransfer.getData(DND_ITEM_TYPE)
    if (!itemJson) return   // not a library item — ignore

    try {
      const payload = JSON.parse(itemJson) as {
        audioUrl?: string; sampleId?: string; name: string; duration?: number
      }

      // Find (or create) the target audio track
      const state = useDAWStore.getState()
      let audioTracks = state.tracks.filter(t => t.type === 'audio')

      if (audioTracks.length === 0) {
        addAudioTrack()
        const newState = useDAWStore.getState()
        audioTracks = newState.tracks.filter(t => t.type === 'audio')
        useDAWStore.getState().updateTrack(audioTracks[0].id, { name: payload.name })
      }

      // Pick which audio track based on Y position (each track is 72px tall)
      const TRACK_H_PX = 72
      const containerRect = e.currentTarget.getBoundingClientRect()
      const relY = e.clientY - containerRect.top + (scrollRef.current?.scrollTop ?? 0) - RULER_H
      const all = useDAWStore.getState().tracks
      const trackIdx = Math.max(0, Math.floor(relY / TRACK_H_PX))
      const hitTrack  = all[Math.min(trackIdx, all.length - 1)]
      const targetTrack = hitTrack?.type === 'audio'
        ? hitTrack
        : audioTracks[audioTracks.length - 1]

      // Calculate startTime from X position (accounting for scroll)
      const scrollLeft = scrollRef.current?.scrollLeft ?? 0
      const startTime = Math.max(0, (e.clientX - containerRect.left + scrollLeft) / zoom)

      const ctx = getAudioContext()
      let buf: AudioBuffer

      if (payload.sampleId) {
        // Synthesized / imported sample — buffer is already in memory
        const { lookupBuffer } = await import('../../lib/sampleRegistry')
        const cached = lookupBuffer(payload.sampleId)
        if (!cached) { console.error('Timeline: sampleId not found in registry', payload.sampleId); return }
        buf = cached
      } else if (payload.audioUrl) {
        const resp = await fetch(payload.audioUrl, { credentials: 'include' })
        const ab   = await resp.arrayBuffer()
        buf = await ctx.decodeAudioData(ab)
      } else {
        return
      }

      addClip(targetTrack.id, {
        name: payload.name, startTime, duration: buf.duration,
        trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0,
        buffer: buf, url: payload.audioUrl ?? '',
      })
    } catch (err) {
      console.error('Timeline: handleTimelineDrop failed', err)
    }
  }

  // Timeline width
  const maxEnd = tracks.reduce((m, t) => {
    if (t.type === 'audio') {
      for (const c of t.clips) {
        const end = c.startTime + (c.trimEnd || c.duration) - c.trimStart
        if (end > m) m = end
      }
    }
    return m
  }, 30)
  const timelineW = Math.max(maxEnd + 20, 60) * zoom

  const playheadX = currentTime * zoom

  return (
    <div
      style={{ flex: 1, display: 'flex', overflow: 'hidden', background: C.bgDeep }}
      onWheel={onWheel}
    >
      {/* Track headers column */}
      <div style={{
        width: HEADER_W, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: `1px solid ${C.border}`,
        background: C.bgBase,
        boxShadow: `4px 0 10px -5px ${C.shadowSm}`,
        zIndex: 10,
      }}>
        {/* Header toolbar (ruler spacer) */}
        <div style={{
          height:       RULER_H, flexShrink: 0,
          background:   C.bgSelected,
          borderBottom: `1px solid ${C.border}`,
          display:      'flex', alignItems: 'center',
          paddingInline: 8, gap: 6,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.text3, textTransform: 'uppercase', flex: 1 }}>
            TRACKS
          </span>
          <div style={{ display:'flex', gap:2 }}>
            <ZoomBtn onClick={() => setZoom(zoom * 1.25)}>+</ZoomBtn>
            <ZoomBtn onClick={() => setZoom(zoom * 0.8)}>−</ZoomBtn>
          </div>
        </div>

        {/* Track headers + automation lane headers */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {tracks.map(t => {
            const lanes = automationLanes.filter(l => l.trackId === t.id)
            return (
              <div key={t.id} style={{ flexShrink: 0 }}>
                <TrackHeader track={t} />
                {lanes.map(lane => (
                  <AutomationLaneHeader key={lane.id} lane={lane} trackColor={t.color} />
                ))}
              </div>
            )
          })}

          {tracks.length === 0 && (
            <div style={{ padding: '32px 16px', color: C.text3, fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>♫</div>
              Add a track to begin
            </div>
          )}
        </div>
      </div>

      {/* Scrollable lanes + ruler */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', background: C.bgDeep }}
        onMouseDown={onScrollAreaMouseDown}
        onDragOver={e => {
          if (Array.from(e.dataTransfer.types).includes(DND_ITEM_TYPE)) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={handleTimelineDrop}
      >
        <div style={{ width: timelineW, position: 'relative' }}>
          {/* Ruler */}
          <canvas
            ref={rulerRef}
            width={timelineW}
            height={RULER_H}
            onMouseDown={onRulerMouseDown}
            style={{
              display: 'block', cursor: 'pointer',
              position: 'sticky', top: 0, zIndex: 10,
            }}
          />

          {/* Loop region */}
          {transport.loopEnabled && (
            <div style={{
              position: 'absolute',
              top: RULER_H,
              left: transport.loopStart * zoom,
              width: (transport.loopEnd - transport.loopStart) * zoom,
              bottom: 0,
              background: C.loopBg,
              borderLeft:  `1px solid ${C.loopBorder}`,
              borderRight: `1px solid ${C.loopBorder}`,
              pointerEvents: 'none',
              zIndex: 1,
            }}/>
          )}

          {/* Playhead */}
          <div style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left: playheadX,
            width: 1,
            background: C.playhead,
            pointerEvents: 'none',
            zIndex: 20,
            boxShadow: `0 0 4px ${alpha(C.accent, 50)}`,
          }}/>

          {/* Marquee selection rectangle */}
          {marqueeRect && marqueeRect.w > 2 && marqueeRect.h > 2 && (
            <div
              style={{
                position: 'absolute',
                left:   marqueeRect.x,
                top:    marqueeRect.y,
                width:  marqueeRect.w,
                height: marqueeRect.h,
                border: `1px solid ${C.accent}`,
                background: alpha(C.accent, 12),
                pointerEvents: 'none',
                zIndex: 30,
                borderRadius: 2,
              }}
            />
          )}

          {/* Track lanes + automation lane views */}
          {tracks.map(t => {
            const lanes = automationLanes.filter(l => l.trackId === t.id)
            return (
              <div key={t.id}>
                <TrackRow track={t} zoom={zoom} />
                {lanes.map(lane => (
                  <AutomationLaneView
                    key={lane.id}
                    lane={lane}
                    zoom={zoom}
                    width={Math.round(timelineW)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const TRACK_DRAG_TYPE = 'application/x-daw-track'

function TrackHeader({ track }: { track: import('../../types').DAWTrack }) {
  const updateTrack     = useDAWStore(s => s.updateTrack)
  const removeTrack     = useDAWStore(s => s.removeTrack)
  const selectTrack     = useDAWStore(s => s.selectTrack)
  const reorderTracks   = useDAWStore(s => s.reorderTracks)
  const selectedId      = useDAWStore(s => s.selectedTrackId)
  const addLane         = useDAWStore(s => s.addAutomationLane)
  const automationLanes = useDAWStore(s => s.automationLanes)
  const isSelected      = selectedId === track.id
  const existingParams  = automationLanes.filter(l => l.trackId === track.id).map(l => l.param)

  const ALL_PARAMS      = Object.keys(AUTOMATION_PARAM_LABELS) as import('../../types').AutomationParam[]
  const availableParams = ALL_PARAMS.filter(p => !existingParams.includes(p))

  const isMidi  = track.type === 'midi'
  const [dropPos,    setDropPos]    = React.useState<'top' | 'bottom' | null>(null)
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameVal,  setRenameVal]  = React.useState('')
  const [showColors, setShowColors] = React.useState(false)

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(TRACK_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    setDropPos(e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropPos(null)
    const fromId = e.dataTransfer.getData(TRACK_DRAG_TYPE)
    if (fromId && fromId !== track.id) reorderTracks(fromId, track.id)
  }

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData(TRACK_DRAG_TYPE, track.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => setDropPos(null)}
      onDragOver={onDragOver}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropPos(null)
      }}
      onDrop={onDrop}
      onClick={() => selectTrack(track.id)}
      style={{
        height:      80,
        flexShrink:  0,
        display:     'flex',
        alignItems:  'stretch',
        borderBottom:`1px solid ${C.border}`,
        background:  isSelected ? C.bgHover : C.bgBase,
        cursor:      'grab',
        userSelect:  'none',
        position:    'relative',
        transition:  'background 0.1s',
        // Drop indicator lines
        borderTop:    dropPos === 'top'    ? `2px solid ${C.accent}` : undefined,
        boxShadow:    dropPos === 'bottom' ? `0 2px 0 ${C.accent}`  : undefined,
      }}
    >
      {/* Color tab */}
      <div
        onClick={e => { e.stopPropagation(); setShowColors(v => !v) }}
        title="Click to change track color"
        style={{
          width: 8, flexShrink: 0, background: track.color,
          cursor: 'pointer', position: 'relative',
          transition: 'width 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.width = '12px' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.width = showColors ? '12px' : '8px' }}
      >
        {showColors && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: 14, top: 0,
              zIndex: 200,
              background: C.bgSubtle, border: `1px solid ${C.border}`,
              borderRadius: 5, padding: 5,
              display: 'flex', flexWrap: 'wrap', gap: 4,
              width: 82, boxShadow: `0 4px 16px rgba(0,0,0,0.4)`,
            }}
          >
            {TRACK_COLORS.map(col => (
              <div
                key={col}
                onClick={e => { e.stopPropagation(); updateTrack(track.id, { color: col }); setShowColors(false) }}
                style={{
                  width: 16, height: 16, borderRadius: 3,
                  background: col, cursor: 'pointer',
                  outline: track.color === col ? `2px solid ${C.text1}` : 'none',
                  outlineOffset: 1,
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 8px 4px 6px' }}>
        {/* Top row: icon + name + type badge + M/S/R */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: C.text3, flexShrink: 0 }}>
            {isMidi ? '🎹' : '≈'}
          </span>
          {isRenaming ? (
            <input
              autoFocus
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter')  { if (renameVal.trim()) updateTrack(track.id, { name: renameVal.trim() }); setIsRenaming(false) }
                if (e.key === 'Escape') { setIsRenaming(false) }
              }}
              onBlur={() => { if (renameVal.trim()) updateTrack(track.id, { name: renameVal.trim() }); setIsRenaming(false) }}
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, minWidth: 0,
                background: C.bgDeep, border: `1px solid ${C.accent}`,
                borderRadius: 3, color: C.text1,
                fontSize: 11, fontWeight: 600,
                padding: '1px 5px', outline: 'none',
              }}
            />
          ) : (
            <span
              onDoubleClick={e => { e.stopPropagation(); setRenameVal(track.name); setIsRenaming(true) }}
              title="Double-click to rename"
              style={{
                fontSize: 11, fontWeight: 600, color: isSelected ? C.accentBright : C.text1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                letterSpacing: '0.01em', cursor: 'text',
              }}
            >
              {track.name}
            </span>
          )}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <TrackBtn
              active={track.muted}
              activeColor={C.warning}
              onClick={e => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}
              title="Mute"
            >M</TrackBtn>
            <TrackBtn
              active={track.soloed}
              activeColor={C.accent}
              onClick={e => { e.stopPropagation(); updateTrack(track.id, { soloed: !track.soloed }) }}
              title="Solo"
            >S</TrackBtn>
            <TrackBtn
              active={false}
              activeColor={C.error}
              onClick={e => e.stopPropagation()}
              title="Record arm"
            >R</TrackBtn>
          </div>
        </div>

        {/* Bottom row: V slider + P slider + utils */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Volume */}
          <span style={{ fontSize: 8, color: C.text3, width: 10, flexShrink: 0 }}>V</span>
          <div style={{ position: 'relative', flex: 1, height: 4 }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: C.bgDeep, borderRadius: 2,
              boxShadow: `inset 0 1px 3px ${C.shadowSm}`,
            }}/>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width:  `${track.volume * 100}%`,
              background: C.accent, borderRadius: 2,
            }}/>
            <input
              type="range" min={0} max={1} step={0.01}
              value={track.volume}
              onClick={e => e.stopPropagation()}
              onChange={e => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
              style={{
                position: 'absolute', inset: '-4px 0',
                opacity: 0, cursor: 'pointer', width: '100%', margin: 0,
              }}
            />
          </div>

          {/* Pan */}
          <span style={{ fontSize: 8, color: C.text3, width: 10, flexShrink: 0, borderLeft: `1px solid ${C.border}`, paddingLeft: 4 }}>P</span>
          <div style={{ position: 'relative', flex: 1, height: 4 }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: C.bgDeep, borderRadius: 2,
              boxShadow: `inset 0 1px 3px ${C.shadowSm}`,
            }}/>
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: '50%', width: 1, background: C.text3,
            }}/>
            <input
              type="range" min={-1} max={1} step={0.01}
              value={track.pan ?? 0}
              onClick={e => e.stopPropagation()}
              onChange={e => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
              style={{
                position: 'absolute', inset: '-4px 0',
                opacity: 0, cursor: 'pointer', width: '100%', margin: 0,
              }}
            />
          </div>

          {/* Automation + remove */}
          <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            {availableParams.length > 0 && (
              <select
                title="Add automation lane"
                value=""
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  e.stopPropagation()
                  if (e.target.value) addLane(track.id, e.target.value as import('../../types').AutomationParam)
                }}
                style={{
                  background: C.bgSubtle, color: C.text3,
                  border: `1px solid ${C.border}`, borderRadius: 2,
                  fontSize: 8, cursor: 'pointer',
                  width: 18, height: 18, padding: 0, textAlign: 'center',
                }}
              >
                <option value="">+A</option>
                {availableParams.map(p => (
                  <option key={p} value={p}>{AUTOMATION_PARAM_LABELS[p]}</option>
                ))}
              </select>
            )}
            <button
              onClick={e => { e.stopPropagation(); removeTrack(track.id) }}
              style={{
                width: 18, height: 18,
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.text3, fontSize: 13, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 2,
              }}
              title="Remove track"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.error }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.text3 }}
            >×</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackBtn({ children, active, activeColor, onClick, title }: {
  children:    React.ReactNode
  active:      boolean
  activeColor: string
  onClick:     (e: React.MouseEvent) => void
  title?:      string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width:      18,
        height:     18,
        borderRadius: 2,
        background: active ? alpha(activeColor, 19) : C.bgHover,
        color:      active ? activeColor : C.text3,
        border:     `1px solid ${active ? alpha(activeColor, 38) : C.border}`,
        fontSize:   9,
        fontWeight: 700,
        cursor:     'pointer',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow:  active ? `0 0 6px ${alpha(activeColor, 31)}` : 'none',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
  )
}

function ZoomBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 20, height: 20,
        background: C.bgHover, color: C.text2,
        border: `1px solid ${C.border}`,
        borderRadius: 3, fontSize: 13, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = C.accent; el.style.borderColor = C.accent }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = C.text2; el.style.borderColor = C.border }}
    >
      {children}
    </button>
  )
}

function pickStep(zoom: number): number {
  if (zoom > 200) return 0.25
  if (zoom > 80)  return 0.5
  if (zoom > 40)  return 1
  if (zoom > 20)  return 2
  return 4
}

function formatTime(s: number): string {
  const m  = Math.floor(s / 60)
  const ss = (s % 60).toFixed(1)
  return m > 0 ? `${m}:${ss.padStart(4, '0')}` : `${ss}s`
}
