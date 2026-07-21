import { useState, useEffect, useRef } from 'react'
import { useDAWStore }    from '../../store/useDAWStore'
import { useAudioEngine, getTrackAnalyser } from '../../store/useAudioEngine'
import { getAnalyser as getMasterAnalyser } from '../../engine/context'
import { C, alpha } from '../../constants'
import { EffectsPanel } from '../Effects/EffectsPanel'

export function Mixer() {
  const tracks   = useDAWStore(s => s.tracks)
  const [fxTrack, setFxTrack] = useState<string | null>(null)

  return (
    <div style={{
      height:     '100%',
      display:    'flex',
      background: C.bgDeep,
      boxShadow:  `inset 0 1px 3px ${C.shadowSm}`,
    }}>
      {/* Channel strips */}
      <div style={{ flex: 1, display: 'flex', overflowX: 'auto', padding: 6, gap: 2 }}>
        {tracks.map(t => (
          <ChannelStrip
            key={t.id}
            trackId={t.id}
            onOpenFX={() => setFxTrack(fxTrack === t.id ? null : t.id)}
            fxOpen={fxTrack === t.id}
          />
        ))}

        {/* Master channel */}
        <MasterStrip />
      </div>

      {/* FX popup */}
      {fxTrack && (
        <EffectsPanel trackId={fxTrack} onClose={() => setFxTrack(null)} />
      )}
    </div>
  )
}

export function VerticalFaderInput({ value, label, onChange }: {
  value: number
  label: string
  onChange: (value: number) => void
}) {
  function updateFromClientY(input: HTMLInputElement, clientY: number) {
    const rect = input.getBoundingClientRect()
    if (rect.height <= 0) return
    const raw = 1 - (clientY - rect.top) / rect.height
    const clamped = Math.max(0, Math.min(1, raw))
    onChange(Math.round(clamped * 100) / 100)
  }

  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      aria-label={label}
      aria-orientation="vertical"
      onClick={e => e.stopPropagation()}
      onChange={e => onChange(parseFloat(e.target.value))}
      onMouseDown={e => {
        e.preventDefault()
        e.stopPropagation()
        const input = e.currentTarget
        input.focus({ preventScroll: true })
        updateFromClientY(input, e.clientY)

        const handleMove = (event: MouseEvent) => {
          event.preventDefault()
          updateFromClientY(input, event.clientY)
        }
        const handleUp = (event: MouseEvent) => {
          updateFromClientY(input, event.clientY)
          window.removeEventListener('mousemove', handleMove)
          window.removeEventListener('mouseup', handleUp)
        }

        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleUp)
      }}
      style={{
        position:   'absolute',
        inset:      '0 auto 0 50%',
        transform:  'translateX(-50%)',
        width:      40,
        height:     '100%',
        writingMode: 'vertical-lr',
        direction:  'rtl',
        opacity:    0,
        cursor:     'pointer',
        zIndex:     3,
      }}
    />
  )
}

// ── Channel strip ──────────────────────────────────────────────────────────────

function ChannelStrip({ trackId, onOpenFX, fxOpen }: {
  trackId: string; onOpenFX: () => void; fxOpen: boolean
}) {
  const track       = useDAWStore(s => s.tracks.find(t => t.id === trackId))
  const updateTrack = useDAWStore(s => s.updateTrack)
  const selectedId  = useDAWStore(s => s.selectedTrackId)
  const selectTrack = useDAWStore(s => s.selectTrack)
  const isSelected  = selectedId === trackId

  const meterRef    = useRef<number>(0)
  const [meterH, setMeterH] = useState(0)

  // Drive the level meter from the *real* per-track AnalyserNode rather than
  // pretending with Math.random().  Falls back to silence when the track is
  // muted or has no graph yet.  Smoothing avoids jitter without misrepresenting
  // the actual signal.
  useEffect(() => {
    let raf = 0
    const data = new Uint8Array(128)
    function tick() {
      const analyser = getTrackAnalyser(trackId)
      if (analyser) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / data.length / 255      // 0..1 normalised
        const target = track && !track.muted ? avg * track.volume : 0
        // Map to a more "meter-like" curve (perceptual loudness ~ sqrt)
        const shaped = Math.sqrt(target)
        meterRef.current = meterRef.current * 0.78 + shaped * 0.22
      } else {
        meterRef.current *= 0.9
      }
      setMeterH(meterRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [trackId, track])

  if (!track) return null

  const anyFxOn = track.effects.eq.enabled || track.effects.reverb.enabled
    || track.effects.delay.enabled || track.effects.compressor.enabled
    || track.effects.limiter.enabled

  const dbVal = meterH > 0
    ? (20 * Math.log10(meterH)).toFixed(1)
    : '-inf'

  const meterColor = meterH > 0.85 ? C.error : meterH > 0.7 ? C.warning : C.success

  return (
    <div
      onClick={() => selectTrack(trackId)}
      style={{
        width:         80,
        flexShrink:    0,
        display:       'flex',
        flexDirection: 'column',
        background:    isSelected ? C.bgSubtle : C.bgBase,
        border:        `1px solid ${isSelected ? C.accent : C.border}`,
        borderRadius:  2,
        overflow:      'hidden',
        cursor:        'pointer',
        transition:    'border-color 0.1s, background 0.1s',
        boxShadow:     isSelected ? `0 0 0 1px ${alpha(C.accent, 19)}` : 'none',
        position:      'relative',
      }}
    >
      {/* Active record indicator dot */}
      {isSelected && (
        <div style={{
          position: 'absolute', top: -1, right: -1,
          width: 6, height: 6, borderRadius: '50%',
          background: C.error,
          boxShadow: `0 0 6px ${C.error}`,
        }}/>
      )}

      {/* Track name */}
      <div style={{
        padding:    '4px 4px 0',
        fontSize:   9,
        fontWeight: 600,
        color:      isSelected ? C.accent : C.text2,
        textAlign:  'center',
        overflow:   'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
      }}>
        {track.name}
      </div>

      {/* FX insert slots */}
      <div style={{ padding: '4px 4px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Show up to 2 "active" fx as badges */}
        {anyFxOn && ['EQ', 'FX'].filter((_, i) =>
          i === 0 ? track.effects.eq.enabled || track.effects.compressor.enabled : track.effects.reverb.enabled || track.effects.delay.enabled
        ).map((label, i) => (
          <div key={i} onClick={e => { e.stopPropagation(); onOpenFX() }} style={{
            height:     16,
            background: alpha(C.accent, 9),
            border:     `1px solid ${alpha(C.accent, 25)}`,
            borderRadius: 2,
            fontSize:   8,
            color:      C.accentBright,
            display:    'flex', alignItems: 'center', paddingInline: 4,
            cursor:     'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {label}
          </div>
        ))}
        {/* Add FX button */}
        <div
          onClick={e => { e.stopPropagation(); onOpenFX() }}
          style={{
            height:     16,
            background: fxOpen ? alpha(C.accent, 8) : 'none',
            border:     `1px dashed ${fxOpen ? C.accent : C.border}`,
            borderRadius: 2,
            fontSize:   8,
            color:      fxOpen ? C.accent : C.text3,
            display:    'flex', alignItems: 'center', justifyContent: 'center',
            cursor:     'pointer',
            transition: 'all 0.1s',
          }}
        >
          {fxOpen ? '▸ FX' : '+ FX'}
        </div>
      </div>

      {/* Pan knob */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6, gap: 2 }}>
        <PanKnob value={track.pan ?? 0} color={track.color} onChange={v => updateTrack(trackId, { pan: v })} />
        <div style={{ fontSize: 7, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>PAN</div>
      </div>

      {/* Fader + level meter */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4, padding: '8px 4px 2px', minHeight: 0 }}>
        {/* Vertical fader */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          {/* Fader groove */}
          <div style={{
            width:        6,
            flex:         1,
            background:   C.bgDeep,
            borderRadius: 3,
            boxShadow:    `inset 0 1px 3px ${C.shadowSm}`,
            position:     'relative',
            overflow:     'visible',
          }}>
            {/* Fader cap */}
            <div style={{
              position:   'absolute',
              bottom:     `calc(${track.volume * 100}% - 8px)`,
              left:       '50%',
              transform:  'translateX(-50%)',
              width:      32,
              height:     14,
              background: C.bgSelected,
              border:     `1px solid ${C.border}`,
              borderRadius: 2,
              boxShadow:  `inset 0 1px 0 ${alpha(C.text1, 10)}, 0 1px 2px ${C.shadowSm}`,
              display:    'flex', alignItems: 'center', justifyContent: 'center',
              zIndex:     2,
              pointerEvents: 'none',
            }}>
              <div style={{ width: '70%', height: 1, background: alpha(C.text1, 30) }}/>
            </div>
          </div>
          {/* Hidden range input over fader */}
          <VerticalFaderInput
            value={track.volume}
            label={`${track.name} volume`}
            onChange={volume => updateTrack(trackId, { volume })}
          />
        </div>

        {/* Level meter */}
        <div style={{
          width:        6,
          flex:         '0 0 6px',
          background:   C.bgDeep,
          borderRadius: 2,
          overflow:     'hidden',
          position:     'relative',
          boxShadow:    `inset 0 1px 3px ${C.shadowSm}`,
        }}>
          <div style={{
            position:   'absolute',
            bottom:     0,
            left:       0,
            right:      0,
            height:     `${meterH * 100}%`,
            background: meterColor,
            transition: 'height 0.05s linear',
            boxShadow:  meterH > 0.7 ? `0 0 4px ${alpha(meterColor, 50)}` : 'none',
          }}/>
        </div>
      </div>

      {/* dB value + reset */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '2px 4px 2px' }}>
        <span style={{
          flex: 1, textAlign: 'center',
          fontSize: 9, fontWeight: 700,
          color: isSelected ? C.accent : C.text2,
          fontFamily: 'monospace', letterSpacing: '0.02em',
        }}>
          {dbVal}
        </span>
        <button
          title="Reset volume & pan"
          onClick={e => {
            e.stopPropagation()
            updateTrack(trackId, { volume: 0.8, pan: 0 })
          }}
          style={{
            width: 16, height: 16, flexShrink: 0,
            background: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: 2,
            color: C.text3,
            fontSize: 10,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
            lineHeight: 1,
            transition: 'all 0.1s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement
            el.style.color = C.accent
            el.style.borderColor = C.accent
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement
            el.style.color = C.text3
            el.style.borderColor = C.border
          }}
        >↺</button>
      </div>

      {/* M/S strip buttons */}
      <div style={{ display: 'flex', gap: 1, padding: '0 4px 4px' }}>
        <StripBtn active={track.muted} color={C.warning} onClick={e => { e.stopPropagation(); updateTrack(trackId, { muted: !track.muted }) }}>M</StripBtn>
        <StripBtn active={track.soloed} color={C.success} onClick={e => { e.stopPropagation(); updateTrack(trackId, { soloed: !track.soloed }) }}>S</StripBtn>
      </div>
    </div>
  )
}

// ── Master strip ───────────────────────────────────────────────────────────────

function MasterStrip() {
  const { masterVolume, setMasterVol } = useAudioEngine()
  const meterRef = useRef<number>(0)
  const [meterH, setMeterH] = useState(0)

  useEffect(() => {
    let raf = 0
    const data = new Uint8Array(128)
    function tick() {
      // Master meter reads the master analyser on the shared AudioContext.
      const analyser = getMasterAnalyser()
      if (analyser) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / data.length / 255
        const target = avg * masterVolume
        const shaped = Math.sqrt(target)
        meterRef.current = meterRef.current * 0.78 + shaped * 0.22
      } else {
        meterRef.current *= 0.9
      }
      setMeterH(meterRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [masterVolume])

  const meterColor = meterH > 0.85 ? C.error : meterH > 0.7 ? C.warning : C.success

  return (
    <div style={{
      width:         80,
      flexShrink:    0,
      display:       'flex',
      flexDirection: 'column',
      background:    C.bgBase,
      border:        `1px solid ${alpha(C.accent, 25)}`,
      borderRadius:  2,
      overflow:      'hidden',
      marginLeft:    8,
    }}>
      <div style={{
        padding:    '4px 4px 0',
        fontSize:   9,
        fontWeight: 700,
        color:      C.accent,
        textAlign:  'center',
        letterSpacing: '0.08em',
      }}>
        MASTER
      </div>

      {/* Fader + meter */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4, padding: '8px 4px 2px', minHeight: 0 }}>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <div style={{
            width: 6, flex: 1,
            background: C.bgDeep, borderRadius: 3,
            boxShadow: `inset 0 1px 3px ${C.shadowSm}`,
            position: 'relative', overflow: 'visible',
          }}>
            <div style={{
              position: 'absolute',
              bottom: `calc(${masterVolume * 100}% - 8px)`,
              left: '50%', transform: 'translateX(-50%)',
              width: 32, height: 14,
              background: C.bgSelected,
              border: `1px solid ${alpha(C.accent, 38)}`,
              borderRadius: 2,
              boxShadow: `inset 0 1px 0 ${alpha(C.text1, 10)}, 0 1px 2px ${C.shadowSm}, 0 0 4px ${alpha(C.accent, 19)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2, pointerEvents: 'none',
            }}>
              <div style={{ width: '70%', height: 1, background: alpha(C.accent, 38) }}/>
            </div>
          </div>
          <VerticalFaderInput
            value={masterVolume}
            label="Master volume"
            onChange={setMasterVol}
          />
        </div>
        <div style={{ width: 6, flex: '0 0 6px', background: C.bgDeep, borderRadius: 2, overflow: 'hidden', position: 'relative', boxShadow: `inset 0 1px 3px ${C.shadowSm}` }}>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${meterH * 100}%`,
            background: meterColor,
            transition: 'height 0.05s linear',
          }}/>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: C.accent, paddingBottom: 4, fontFamily: 'monospace' }}>
        {masterVolume > 0 ? (20 * Math.log10(masterVolume)).toFixed(1) : '-inf'}
      </div>
    </div>
  )
}

// ── Pan knob ───────────────────────────────────────────────────────────────────

function PanKnob({ value, color, onChange }: { value: number; color: string; onChange: (v: number) => void }) {
  const SIZE      = 20
  const RADIUS    = 8
  const CENTER    = SIZE / 2
  const MIN_ANGLE = -135
  const angle     = MIN_ANGLE + ((value + 1) / 2) * 270
  const rad       = (angle * Math.PI) / 180
  const x         = CENTER + RADIUS * Math.sin(rad)
  const y         = CENTER - RADIUS * Math.cos(rad)
  const arcStart  = (MIN_ANGLE * Math.PI) / 180
  const largeArc  = Math.abs(angle - MIN_ANGLE) > 180 ? 1 : 0
  const sx        = CENTER + RADIUS * Math.sin(arcStart)
  const sy        = CENTER - RADIUS * Math.cos(arcStart)

  const dragState = useRef<{ startY: number; startVal: number } | null>(null)

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragState.current = { startY: e.clientY, startVal: value }
    const onMove = (mv: MouseEvent) => {
      if (!dragState.current) return
      const dy = dragState.current.startY - mv.clientY
      onChange(Math.max(-1, Math.min(1, dragState.current.startVal + dy / 100)))
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <svg
      width={SIZE} height={SIZE}
      onMouseDown={onMouseDown}
      onDoubleClick={() => onChange(0)}
      style={{ cursor: 'ns-resize', display: 'block' }}
    >
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={C.bgDeep} stroke={C.border} strokeWidth="1"/>
      {value !== 0 && (
        <path
          d={`M ${sx} ${sy} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x} ${y}`}
          fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.7"
        />
      )}
      <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ── Shared strip button ────────────────────────────────────────────────────────

function StripBtn({ children, active, color, onClick }: {
  children: React.ReactNode; active: boolean; color: string; onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, height: 14, fontSize: 8, fontWeight: 700,
        background: active ? color + '25' : C.bgHover,
        color:      active ? color : C.text3,
        border:     `1px solid ${active ? color + '50' : C.border}`,
        borderRadius: 2, cursor: 'pointer',
        boxShadow: active ? `0 0 4px ${color}40` : 'none',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
  )
}
