import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useDAWStore }    from '../../store/useDAWStore'
import { useAudioEngine } from '../../store/useAudioEngine'
import { C, alpha } from '../../constants'
import { useThemeVersion } from '../../lib/cssVars'
import { TrackRow, DND_ITEM_TYPE } from './TrackRow'
import { TrackHeader, AddTrackBtn } from './TrackHeader'
import { RULER_H, drawRuler } from './ruler'
import { useMarqueeSelection } from './useMarqueeSelection'
import { AutomationLaneView } from '../AutomationLane/AutomationLaneView'
import { AutomationLaneHeader } from '../AutomationLane/AutomationLaneHeader'
import { getAudioContext } from '../../engine/context'
import { useDAWT } from '../../i18n'

const HEADER_W = 240

export function Timeline() {
  const tracks          = useDAWStore(s => s.tracks)
  const automationLanes = useDAWStore(s => s.automationLanes)
  const zoom            = useDAWStore(s => s.zoom)
  const setZoom         = useDAWStore(s => s.setZoom)
  const trackHeight     = useDAWStore(s => s.trackHeight)
  const transport       = useDAWStore(s => s.transport)
  const addAudioTrack   = useDAWStore(s => s.addAudioTrack)
  const addMidiTrack    = useDAWStore(s => s.addMidiTrack)
  const addClip         = useDAWStore(s => s.addClip)
  const timelineLength  = useDAWStore(s => s.timelineLength)
  const setTimelineLength = useDAWStore(s => s.setTimelineLength)
  const dt              = useDAWT()
  const { currentTime, seek } = useAudioEngine()
  const isPlaying = useAudioEngine(s => s.isPlaying)
  const setLoop = useDAWStore(s => s.setLoop)

  // ── Refs ──
  const rulerRef    = useRef<HTMLCanvasElement>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const loopDragRef = useRef<{ which: 'start' | 'end' } | null>(null)
  const themeVersion = useThemeVersion()

  // ── Viewport genişliği + scroll offset ──
  // Ruler canvas viewport genişliğinde sabittir; scroll offset'i ile çizilir.
  const [viewportW, setViewportW] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onResize = () => setViewportW(el.clientWidth)
    const onScroll = () => setScrollLeft(el.scrollLeft)
    onResize()
    onScroll()
    const ro = new ResizeObserver(onResize)
    ro.observe(el)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  const { marqueeRect, onScrollAreaMouseDown } = useMarqueeSelection(scrollRef)

  // ── Timeline genişliği hesabı ──
  // maxEnd: tüm clip'lerin sonu VEYA manuel timelineLength (hangisi büyükse)
  const maxEnd = tracks.reduce((m, t) => {
    if (t.type === 'audio') {
      for (const c of t.clips) {
        const end = c.startTime + (c.trimEnd || c.duration) - c.trimStart
        if (end > m) m = end
      }
    } else if (t.type === 'midi') {
      const secPerBeat = 60 / transport.bpm
      for (const c of t.clips) {
        const end = c.startTime + (c.loopBeats ?? c.durationBeats) * secPerBeat
        if (end > m) m = end
      }
    }
    return m
  }, 0)
  const effectiveEnd = Math.max(maxEnd, timelineLength)

  const minSecs = viewportW > 0 ? (viewportW / zoom) + 20 : 60
  const timelineW = Math.max(effectiveEnd + 20, minSecs) * zoom

  // ── Ruler çizimi ──
  // Canvas viewport genişliğindedir; scrollLeft offset olarak çizime geçirilir.
  useEffect(() => {
    if (!rulerRef.current) return
    drawRuler(rulerRef.current, zoom, transport, scrollLeft, timelineW)
  }, [zoom, scrollLeft, viewportW, timelineW, themeVersion,
      transport.bpm, transport.timeSignature,
      transport.loopEnabled, transport.loopStart, transport.loopEnd])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playhead takibi ──
  useEffect(() => {
    if (!isPlaying) return
    const el = scrollRef.current
    if (!el) return
    const x = currentTime * zoom
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) {
      el.scrollLeft = Math.max(0, x - 80)
    }
  }, [currentTime, isPlaying, zoom])

  // ── Zoom to fit ──
  function zoomToFit() {
    const el = scrollRef.current
    if (!el) return
    setZoom((el.clientWidth - 60) / Math.max(effectiveEnd, 1))
    el.scrollLeft = 0
  }

  // ── Wheel zoom ──
  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9))
    }
  }

  // ── Ruler click → seek / loop handle drag ──
  const onRulerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect    = e.currentTarget.getBoundingClientRect()
    const scrollX = scrollRef.current?.scrollLeft ?? 0
    const x       = e.clientX - rect.left + scrollX
    const t       = Math.max(0, x / zoom)
    const threshold = 10 / zoom

    if (transport.loopEnabled) {
      const startDist = Math.abs(t - transport.loopStart)
      const endDist   = Math.abs(t - transport.loopEnd)

      if (startDist < threshold || endDist < threshold) {
        const which: 'start' | 'end' = startDist < endDist ? 'start' : 'end'
        loopDragRef.current = { which }
        e.preventDefault()

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

    if (!loopDragRef.current) seek(t)
  }, [transport, zoom, setLoop, seek])

  // ── Drop handler ──
  async function handleTimelineDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const itemJson = e.dataTransfer.getData(DND_ITEM_TYPE)
    if (!itemJson) return

    try {
      const payload = JSON.parse(itemJson) as {
        audioUrl?: string; sampleId?: string; name: string; duration?: number
      }

      const state = useDAWStore.getState()
      let audioTracks = state.tracks.filter(t => t.type === 'audio')

      if (audioTracks.length === 0) {
        addAudioTrack()
        const newState = useDAWStore.getState()
        audioTracks = newState.tracks.filter(t => t.type === 'audio')
        useDAWStore.getState().updateTrack(audioTracks[0].id, { name: payload.name })
      }

      const TRACK_H_PX = useDAWStore.getState().trackHeight
      const containerRect = e.currentTarget.getBoundingClientRect()
      const relY = e.clientY - containerRect.top + (scrollRef.current?.scrollTop ?? 0)
      const all = useDAWStore.getState().tracks
      const trackIdx = Math.max(0, Math.floor(relY / TRACK_H_PX))
      const hitTrack  = all[Math.min(trackIdx, all.length - 1)]
      const targetTrack = hitTrack?.type === 'audio'
        ? hitTrack
        : audioTracks[audioTracks.length - 1]

      const scrollLeftNow = scrollRef.current?.scrollLeft ?? 0
      const startTime = Math.max(0, (e.clientX - containerRect.left + scrollLeftNow) / zoom)

      const ctx = getAudioContext()
      let buf: AudioBuffer

      if (payload.sampleId) {
        const { lookupBuffer } = await import('../../lib/sampleRegistry')
        const cached = lookupBuffer(payload.sampleId)
        if (!cached) { console.error('Timeline: sampleId not found', payload.sampleId); return }
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

  const playheadX = currentTime * zoom

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bgDeep }}
      onWheel={onWheel}
    >
      {/* ══════════════════════════════════════════════════════════════════════
          RULER ROW — header sol kolon + sabit canvas ruler sağ kolon
          Canvas scroll container DIŞINDA, sticky değil, viewport genişliğinde.
          Scroll offset drawRuler'a parametre olarak geçirilir.
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex',
        flexShrink: 0,
        height: RULER_H,
        borderBottom: `1px solid ${C.border}`,
        background: C.bgSubtle,
        zIndex: 20,
      }}>
        {/* Sol kolon — ruler spacer + zoom butonları */}
        <div style={{
          width: HEADER_W, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          paddingInline: 8, gap: 6,
          borderRight: `1px solid ${C.border}`,
          background: C.bgBase,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.text3, textTransform: 'uppercase', flex: 1 }}>
            TRACKS
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            <ZoomBtn title="Zoom in (+)" onClick={() => setZoom(zoom * 1.25)}>+</ZoomBtn>
            <ZoomBtn title="Zoom out (−)" onClick={() => setZoom(zoom * 0.8)}>−</ZoomBtn>
            <ZoomBtn title={dt.zoomFit} onClick={zoomToFit}>⛶</ZoomBtn>
          </div>
        </div>

        {/* Sağ kolon — ruler canvas (viewport genişliğinde, sabit) */}
        <div
          style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}
          onMouseDown={onRulerMouseDown}
        >
          <canvas
            ref={rulerRef}
            style={{
              display: 'block',
              width: '100%',
              height: RULER_H,
              cursor: 'pointer',
            }}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BODY ROW — track headers (sol) + scrollable lanes (sağ)
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* ── Track headers column ── */}
        <div style={{
          width: HEADER_W, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${C.border}`,
          background: C.bgBase,
          boxShadow: `4px 0 10px -5px ${C.shadowSm}`,
          zIndex: 10,
        }}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {tracks.map(t => {
              const lanes = automationLanes.filter(l => l.trackId === t.id)
              return (
                <div key={t.id} style={{ flexShrink: 0 }}>
                  <TrackHeader track={t} trackHeight={trackHeight} />
                  {lanes.map(lane => (
                    <AutomationLaneHeader key={lane.id} lane={lane} trackColor={t.color} />
                  ))}
                </div>
              )
            })}

            {tracks.length === 0 && (
              <div style={{ padding: '28px 16px 8px', color: C.text3, fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
                <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.4 }}>♫</div>
                Add a track to begin
              </div>
            )}

            <div style={{
              display: 'flex', gap: 6, padding: '10px 12px',
              borderTop: tracks.length ? `1px solid ${alpha(C.text3, 12)}` : 'none',
            }}>
              <AddTrackBtn onClick={addAudioTrack} label={dt.addAudio} />
              <AddTrackBtn onClick={addMidiTrack}  label={dt.addMidi}  accent />
            </div>
          </div>
        </div>

        {/* ── Scrollable lanes ── */}
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
            {/* Loop region */}
            {transport.loopEnabled && (
              <div style={{
                position: 'absolute',
                top: 0,
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

            {/* ── Timeline extend handle ──
                Sağ kenarda sürüklenebilir bir tutamaç.  Kullanıcı bunu
                sağa doğru sürükleyerek timeline'ı manuel olarak uzatır;
                boş alan açar ki yeni clip'ler sonraya yerleştirilsin.
                effectiveEnd'in sağına konumlanır ve mouse drag ile
                setTimelineLength günceller. */}
            <TimelineExtendHandle
              endSec={effectiveEnd}
              zoom={zoom}
              timelineLength={timelineLength}
              onExtend={setTimelineLength}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ZoomBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
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

interface TimelineExtendHandleProps {
  endSec: number
  zoom: number
  timelineLength: number
  onExtend: (seconds: number) => void
}

/**
 * Timeline'ın sağ sınırını mouse ile uzatır. Drag başlangıcında görünen gerçek
 * sınırı snapshot'lar; böylece timelineLength=0 (otomatik mod) iken ilk drag
 * clip'lerin sonundan devam eder ve hareket sırasında store güncellemeleri
 * başlangıç noktasını kaydırmaz.
 */
function TimelineExtendHandle({
  endSec,
  zoom,
  timelineLength,
  onExtend,
}: TimelineExtendHandleProps) {
  const [dragging, setDragging] = useState(false)

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startLength = Math.max(endSec, timelineLength)
    setDragging(true)

    const onMove = (ev: MouseEvent) => {
      const deltaSec = (ev.clientX - startX) / Math.max(zoom, 1)
      onExtend(Math.max(0, startLength + deltaSec))
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [endSec, timelineLength, zoom, onExtend])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Extend timeline"
      title="Drag to extend timeline"
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: Math.max(0, endSec * zoom - 5),
        top: 0,
        bottom: 0,
        width: 11,
        cursor: 'ew-resize',
        zIndex: 25,
        display: 'flex',
        justifyContent: 'center',
        touchAction: 'none',
      }}
    >
      <span style={{
        width: dragging ? 2 : 1,
        height: '100%',
        background: dragging ? C.accent : alpha(C.text3, 55),
        boxShadow: dragging ? `0 0 6px ${alpha(C.accent, 55)}` : 'none',
        pointerEvents: 'none',
      }} />
    </div>
  )
}
