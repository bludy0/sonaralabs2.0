import { useRef, useEffect } from 'react'
import { useDAWStore }    from '../../store/useDAWStore'
import { useAudioEngine } from '../../store/useAudioEngine'
import { C, alpha } from '../../constants'
import { getCSSVar, useThemeVersion } from '../../lib/cssVars'
import { AUTOMATION_PARAM_LABELS } from '../../types'
import { TrackRow } from './TrackRow'
import { AutomationLaneView } from '../AutomationLane/AutomationLaneView'
import { AutomationLaneHeader } from '../AutomationLane/AutomationLaneHeader'

const HEADER_W = 240
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
  const themeVersion = useThemeVersion()

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
  }, [zoom, themeVersion])

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
            boxShadow: `0 0 4px ${alpha(C.accent, 50)}`,
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

  const ALL_PARAMS      = Object.keys(AUTOMATION_PARAM_LABELS) as import('../../types').AutomationParam[]
  const availableParams = ALL_PARAMS.filter(p => !existingParams.includes(p))

  const isMidi = track.type === 'midi'

  return (
    <div
      onClick={() => selectTrack(track.id)}
      style={{
        height:      80,
        flexShrink:  0,
        display:     'flex',
        alignItems:  'stretch',
        borderBottom:`1px solid ${C.border}`,
        background:  isSelected ? C.bgHover : C.bgBase,
        cursor:      'pointer',
        userSelect:  'none',
        position:    'relative',
        transition:  'background 0.1s',
      }}
    >
      {/* Color tab */}
      <div style={{
        width:      3,
        flexShrink: 0,
        background: track.color,
      }}/>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 8px 4px 6px' }}>
        {/* Top row: icon + name + type badge + M/S/R */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: C.text3, flexShrink: 0 }}>
            {isMidi ? '🎹' : '≈'}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: isSelected ? C.accentBright : C.text1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            letterSpacing: '0.01em',
          }}>
            {track.name}
          </span>
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
