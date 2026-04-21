import { useRef, useEffect } from 'react'
import { useDAWStore }    from '../../store/useDAWStore'
import { useAudioEngine } from '../../store/useAudioEngine'
import { C } from '../../constants'
import { AUTOMATION_PARAM_LABELS } from '../../types'
import { TrackRow } from './TrackRow'
import { AutomationLaneView } from '../AutomationLane/AutomationLaneView'
import { AutomationLaneHeader } from '../AutomationLane/AutomationLaneHeader'

const HEADER_W = 172
const RULER_H  = 28

export function Timeline() {
  const tracks          = useDAWStore(s => s.tracks)
  const automationLanes = useDAWStore(s => s.automationLanes)
  const zoom            = useDAWStore(s => s.zoom)
  const setZoom         = useDAWStore(s => s.setZoom)
  const transport       = useDAWStore(s => s.transport)
  const { currentTime, seek } = useAudioEngine()

  const rulerRef    = useRef<HTMLCanvasElement>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)

  // Ruler canvas draw
  useEffect(() => {
    const canvas = rulerRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    ctx.clearRect(0, 0, W, RULER_H)
    ctx.fillStyle   = C.bgRaised
    ctx.fillRect(0, 0, W, RULER_H)

    const step  = pickStep(zoom)
    const total = W / zoom + 4

    ctx.fillStyle   = C.text3
    ctx.strokeStyle = C.border
    ctx.font        = '10px system-ui'
    ctx.textAlign   = 'left'
    ctx.lineWidth   = 1

    for (let t = 0; t < total; t += step) {
      const x = Math.round(t * zoom)
      const isMajor = Math.round(t / step) % 4 === 0
      ctx.beginPath()
      ctx.moveTo(x, isMajor ? 8 : 18)
      ctx.lineTo(x, RULER_H)
      ctx.strokeStyle = isMajor ? C.border : C.borderDim
      ctx.stroke()
      if (isMajor) {
        ctx.fillStyle = C.text2
        ctx.fillText(formatTime(t), x + 2, 10)
      }
    }
  }, [zoom])

  // Scroll with wheel (horizontal zoom on Ctrl+wheel)
  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9))
    }
  }

  // Click ruler to seek
  function onRulerClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect  = e.currentTarget.getBoundingClientRect()
    const x     = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
    seek(x / zoom)
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
      style={{ flex: 1, display: 'flex', overflow: 'hidden', background: C.bgBase }}
      onWheel={onWheel}
    >
      {/* Track headers column */}
      <div style={{
        width: HEADER_W, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: `1px solid ${C.border}`,
      }}>
        {/* Ruler spacer */}
        <div style={{
          height: RULER_H, flexShrink: 0,
          background: C.bgRaised,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', paddingLeft: 12,
        }}>
          {/* Zoom control */}
          <span style={{ fontSize: 10, color: C.text3, userSelect: 'none' }}>
            ×{(zoom / 80).toFixed(1)}
          </span>
          <div style={{ display:'flex', gap:2, marginLeft:'auto', marginRight:8 }}>
            <ZoomBtn onClick={() => setZoom(zoom * 1.25)}>+</ZoomBtn>
            <ZoomBtn onClick={() => setZoom(zoom * 0.8)}>−</ZoomBtn>
          </div>
        </div>

        {/* Track headers + automation lane headers */}
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
          <div style={{
            padding: '24px 12px', color: C.text3, fontSize: 12, textAlign: 'center',
          }}>
            Add a track to begin
          </div>
        )}
      </div>

      {/* Scrollable lanes + ruler */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}
      >
        <div style={{ width: timelineW, position: 'relative' }}>
          {/* Ruler */}
          <canvas
            ref={rulerRef}
            width={timelineW}
            height={RULER_H}
            onClick={onRulerClick}
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
            boxShadow: `0 0 4px ${C.accent}80`,
          }}/>

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

function TrackHeader({ track }: { track: import('../../types').DAWTrack }) {
  const updateTrack     = useDAWStore(s => s.updateTrack)
  const removeTrack     = useDAWStore(s => s.removeTrack)
  const selectTrack     = useDAWStore(s => s.selectTrack)
  const selectedId      = useDAWStore(s => s.selectedTrackId)
  const addLane         = useDAWStore(s => s.addAutomationLane)
  const automationLanes = useDAWStore(s => s.automationLanes)
  const isSelected      = selectedId === track.id
  const existingParams  = automationLanes.filter(l => l.trackId === track.id).map(l => l.param)

  const ALL_PARAMS = Object.keys(AUTOMATION_PARAM_LABELS) as import('../../types').AutomationParam[]
  const availableParams = ALL_PARAMS.filter(p => !existingParams.includes(p))

  return (
    <div
      onClick={() => selectTrack(track.id)}
      style={{
        height: 72,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '6px 10px',
        borderBottom: `1px solid ${C.borderDim}`,
        background: isSelected ? C.bgHover : C.bgRaised,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: track.color, flexShrink: 0,
        }}/>
        <span style={{
          fontSize: 12, fontWeight: 600, color: C.text1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {track.name}
        </span>
        <span style={{
          fontSize: 9, color: C.text3, background: C.bgSubtle,
          padding: '1px 5px', borderRadius: 3,
        }}>
          {track.type.toUpperCase()}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <SmallBtn
          active={track.muted}
          color={C.warning}
          onClick={e => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}
        >M</SmallBtn>
        <SmallBtn
          active={track.soloed}
          color={C.success}
          onClick={e => { e.stopPropagation(); updateTrack(track.id, { soloed: !track.soloed }) }}
        >S</SmallBtn>

        {/* Volume mini slider */}
        <input
          type="range" min={0} max={1} step={0.01}
          value={track.volume}
          onClick={e => e.stopPropagation()}
          onChange={e => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
          style={{ flex: 1, accentColor: track.color, height: 3 }}
        />

        {/* Add automation lane */}
        {availableParams.length > 0 && (
          <select
            title="Add automation lane"
            value=""
            onClick={e => e.stopPropagation()}
            onChange={e => {
              e.stopPropagation()
              if (e.target.value) {
                addLane(track.id, e.target.value as import('../../types').AutomationParam)
              }
            }}
            style={{
              background: C.bgSubtle,
              color: C.text3,
              border: `1px solid ${C.borderDim}`,
              borderRadius: 3,
              fontSize: 9,
              cursor: 'pointer',
              width: 20, height: 20,
              padding: 0,
              textAlign: 'center',
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
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.text3, fontSize: 14, padding: '0 2px',
            lineHeight: 1,
          }}
          title="Remove track"
        >×</button>
      </div>
    </div>
  )
}

function SmallBtn({
  children, active, color, onClick,
}: {
  children: React.ReactNode
  active: boolean
  color: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 20, height: 20,
        background: active ? color + '30' : C.bgSubtle,
        color: active ? color : C.text3,
        border: `1px solid ${active ? color + '60' : C.borderDim}`,
        borderRadius: 3,
        fontSize: 9, fontWeight: 700,
        cursor: 'pointer',
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
        width: 18, height: 18,
        background: C.bgSubtle, color: C.text2,
        border: `1px solid ${C.border}`,
        borderRadius: 3, fontSize: 13, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
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
