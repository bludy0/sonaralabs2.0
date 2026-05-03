import { useState } from 'react'
import { useDAWStore } from '@sonaralabs/daw-studio'
import type {
  EQSettings, ReverbSettings, DelaySettings,
  CompressorSettings, LimiterSettings, EffectChain,
} from '@sonaralabs/daw-studio'
import { C } from '../../theme'

// ── Reusable slider component ─────────────────────────────────────────────────

function Knob({
  label, value, min, max, step = 0.01,
  format,
  onChange,
}: {
  label:    string
  value:    number
  min:      number
  max:      number
  step?:    number
  format?:  (v: number) => string
  onChange: (v: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  const display = format ? format(value) : value.toFixed(step < 0.1 ? 2 : 1)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: C.text3, letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 9, color: C.accent, fontVariantNumeric: 'tabular-nums' }}>{display}</span>
      </div>
      <div style={{ position: 'relative', height: 3, borderRadius: 2, background: C.bgSubtle }}>
        <div style={{
          position: 'absolute', left: 0, top: 0,
          height: '100%', width: `${pct}%`,
          borderRadius: 2, background: C.accent,
          transition: 'width 0.05s',
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{
            position: 'absolute', inset: '-5px 0',
            opacity: 0, cursor: 'pointer', width: '100%',
          }}
        />
      </div>
    </div>
  )
}

// ── Effect block ──────────────────────────────────────────────────────────────

function EffectBlock({
  title, color, enabled, onToggle, children,
}: {
  title: string; color: string; enabled: boolean
  onToggle: () => void; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden',
      border: `1px solid ${enabled ? color + '50' : C.border}`,
      marginBottom: 8,
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px',
          background: enabled ? color + '10' : C.bgSubtle,
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
        onClick={() => setOpen(o => !o)}
      >
        {/* Toggle */}
        <div
          onClick={e => { e.stopPropagation(); onToggle() }}
          style={{
            width: 26, height: 14, borderRadius: 7, flexShrink: 0,
            background: enabled ? color : C.bgHover,
            position: 'relative', cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <div style={{
            position: 'absolute', top: 2,
            left: enabled ? 14 : 2,
            width: 10, height: 10, borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
          }} />
        </div>

        <span style={{
          flex: 1,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: enabled ? color : C.text2,
          transition: 'color 0.2s',
        }}>
          {title}
        </span>

        <span style={{ fontSize: 10, color: C.text3 }}>{open ? '▾' : '▸'}</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: '10px 12px', background: C.bgBase }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Individual effect editors ─────────────────────────────────────────────────

function EQEditor({ eq, onChange }: { eq: EQSettings; onChange: (p: Partial<EQSettings>) => void }) {
  const db = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`
  return (
    <>
      <Knob label="LOW"    value={eq.lowGain}    min={-12} max={12} step={0.5} format={db} onChange={v => onChange({ lowGain: v })} />
      <Knob label="LO-MID" value={eq.loMidGain}  min={-12} max={12} step={0.5} format={db} onChange={v => onChange({ loMidGain: v })} />
      <Knob label="HI-MID" value={eq.hiMidGain}  min={-12} max={12} step={0.5} format={db} onChange={v => onChange({ hiMidGain: v })} />
      <Knob label="HIGH"   value={eq.highGain}   min={-12} max={12} step={0.5} format={db} onChange={v => onChange({ highGain: v })} />
    </>
  )
}

function ReverbEditor({ rev, onChange }: { rev: ReverbSettings; onChange: (p: Partial<ReverbSettings>) => void }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <>
      <Knob label="ROOM SIZE" value={rev.roomSize} min={0} max={1} step={0.01} format={pct} onChange={v => onChange({ roomSize: v })} />
      <Knob label="WET"       value={rev.wet}      min={0} max={1} step={0.01} format={pct} onChange={v => onChange({ wet: v })} />
    </>
  )
}

function DelayEditor({ delay, onChange }: { delay: DelaySettings; onChange: (p: Partial<DelaySettings>) => void }) {
  const ms  = (v: number) => `${Math.round(v * 1000)} ms`
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <>
      <Knob label="TIME"     value={delay.time}     min={0.01} max={2}  step={0.01} format={ms}  onChange={v => onChange({ time: v })} />
      <Knob label="FEEDBACK" value={delay.feedback} min={0}    max={0.9} step={0.01} format={pct} onChange={v => onChange({ feedback: v })} />
      <Knob label="WET"      value={delay.wet}      min={0}    max={1}   step={0.01} format={pct} onChange={v => onChange({ wet: v })} />
    </>
  )
}

function CompressorEditor({ comp, onChange }: { comp: CompressorSettings; onChange: (p: Partial<CompressorSettings>) => void }) {
  const db  = (v: number) => `${v.toFixed(0)} dB`
  const ms  = (v: number) => `${Math.round(v * 1000)} ms`
  return (
    <>
      <Knob label="THRESHOLD" value={comp.threshold} min={-60} max={0}  step={1}     format={db}   onChange={v => onChange({ threshold: v })} />
      <Knob label="RATIO"     value={comp.ratio}     min={1}   max={20} step={0.5}   format={v => `${v.toFixed(1)}:1`} onChange={v => onChange({ ratio: v })} />
      <Knob label="ATTACK"    value={comp.attack}    min={0}   max={0.5} step={0.001} format={ms}   onChange={v => onChange({ attack: v })} />
      <Knob label="RELEASE"   value={comp.release}   min={0}   max={1}   step={0.01}  format={ms}   onChange={v => onChange({ release: v })} />
      <Knob label="KNEE"      value={comp.knee}      min={0}   max={40}  step={1}     format={db}   onChange={v => onChange({ knee: v })} />
    </>
  )
}

function LimiterEditor({ lim, onChange }: { lim: LimiterSettings; onChange: (p: Partial<LimiterSettings>) => void }) {
  const db = (v: number) => `${v.toFixed(1)} dB`
  const ms = (v: number) => `${Math.round(v * 1000)} ms`
  return (
    <>
      <Knob label="THRESHOLD" value={lim.threshold} min={-12} max={0}   step={0.5}  format={db} onChange={v => onChange({ threshold: v })} />
      <Knob label="RELEASE"   value={lim.release}   min={0}   max={0.5} step={0.005} format={ms} onChange={v => onChange({ release: v })} />
    </>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function PluginsPanel() {
  const selectedTrackId = useDAWStore(s => s.selectedTrackId)
  const tracks          = useDAWStore(s => s.tracks)
  const updateEffects   = useDAWStore(s => s.updateEffects)

  const track = selectedTrackId ? tracks.find(t => t.id === selectedTrackId) : null
  const fx    = track?.effects

  function patch<K extends keyof EffectChain>(key: K, value: Partial<EffectChain[K]>) {
    if (!selectedTrackId || !fx) return
    updateEffects(selectedTrackId, { [key]: { ...fx[key], ...value } })
  }

  if (!track || !fx) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', padding: 20, gap: 12,
        background: C.bgBase,
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round">
          <circle cx="10" cy="10" r="4"/>
          <circle cx="22" cy="10" r="4"/>
          <circle cx="10" cy="22" r="4"/>
          <circle cx="22" cy="22" r="4"/>
          <line x1="14" y1="10" x2="18" y2="10"/>
          <line x1="14" y1="22" x2="18" y2="22"/>
          <line x1="10" y1="14" x2="10" y2="18"/>
          <line x1="22" y1="14" x2="22" y2="18"/>
        </svg>
        <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
          Select a track to<br />edit its effects
        </p>

        {/* Track quick-select */}
        {tracks.length > 0 && (
          <div style={{ width: '100%', marginTop: 8 }}>
            <p style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, textAlign: 'center' }}>
              Quick select
            </p>
            {tracks.map(t => (
              <button
                key={t.id}
                onClick={() => useDAWStore.getState().selectTrack(t.id)}
                style={{
                  display: 'block', width: '100%',
                  padding: '6px 10px', marginBottom: 4,
                  background: C.bgSubtle, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text2, fontSize: 11,
                  cursor: 'pointer', textAlign: 'left',
                  textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
                onMouseLeave={e => (e.currentTarget.style.background = C.bgSubtle)}
              >
                <span style={{
                  display: 'inline-block', fontSize: 8,
                  padding: '1px 5px', borderRadius: 3, marginRight: 6,
                  background: t.type === 'midi' ? '#56b6c220' : `${C.accent}20`,
                  color:      t.type === 'midi' ? '#56b6c2'   : C.accent,
                  fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                }}>
                  {t.type === 'midi' ? 'MIDI' : 'AUD'}
                </span>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgBase }}>
      {/* Track header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
        background: C.bgSubtle,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 8, padding: '2px 6px', borderRadius: 3,
            background: track.type === 'midi' ? '#56b6c220' : `${C.accent}20`,
            color:      track.type === 'midi' ? '#56b6c2'   : C.accent,
            fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            {track.type === 'midi' ? 'MIDI' : 'AUDIO'}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: C.text1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {track.name}
          </span>
          <button
            onClick={() => useDAWStore.getState().selectTrack(null)}
            style={{
              marginLeft: 'auto', flexShrink: 0,
              background: 'none', border: 'none',
              color: C.text3, cursor: 'pointer', fontSize: 14,
              padding: '2px 4px',
            }}
            title="Deselect track"
          >
            ×
          </button>
        </div>
      </div>

      {/* Effects */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 16px' }}>

        {/* ── EQ ──────────────────────────────────────────────────────── */}
        <EffectBlock
          title="4-Band EQ"
          color="#56b6c2"
          enabled={fx.eq.enabled}
          onToggle={() => patch('eq', { enabled: !fx.eq.enabled })}
        >
          <EQEditor eq={fx.eq} onChange={v => patch('eq', v)} />
        </EffectBlock>

        {/* ── Reverb ──────────────────────────────────────────────────── */}
        <EffectBlock
          title="Reverb"
          color="#c678dd"
          enabled={fx.reverb.enabled}
          onToggle={() => patch('reverb', { enabled: !fx.reverb.enabled })}
        >
          <ReverbEditor rev={fx.reverb} onChange={v => patch('reverb', v)} />
        </EffectBlock>

        {/* ── Delay ───────────────────────────────────────────────────── */}
        <EffectBlock
          title="Delay"
          color="#e5c07b"
          enabled={fx.delay.enabled}
          onToggle={() => patch('delay', { enabled: !fx.delay.enabled })}
        >
          <DelayEditor delay={fx.delay} onChange={v => patch('delay', v)} />
        </EffectBlock>

        {/* ── Compressor ──────────────────────────────────────────────── */}
        <EffectBlock
          title="Compressor"
          color="#98c379"
          enabled={fx.compressor.enabled}
          onToggle={() => patch('compressor', { enabled: !fx.compressor.enabled })}
        >
          <CompressorEditor comp={fx.compressor} onChange={v => patch('compressor', v)} />
        </EffectBlock>

        {/* ── Limiter ─────────────────────────────────────────────────── */}
        <EffectBlock
          title="Limiter"
          color="#e06c75"
          enabled={fx.limiter.enabled}
          onToggle={() => patch('limiter', { enabled: !fx.limiter.enabled })}
        >
          <LimiterEditor lim={fx.limiter} onChange={v => patch('limiter', v)} />
        </EffectBlock>
      </div>
    </div>
  )
}
