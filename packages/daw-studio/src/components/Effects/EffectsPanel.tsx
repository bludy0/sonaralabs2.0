import { useState } from 'react'
import { useDAWStore }  from '../../store/useDAWStore'
import { C } from '../../constants'
import type {
  EffectChain, EQSettings, ReverbSettings, DelaySettings,
  CompressorSettings, LimiterSettings, ChorusSettings,
} from '../../types'

type Tab = 'EQ' | 'Reverb' | 'Delay' | 'Chorus' | 'Comp' | 'Limiter'
const TABS: Tab[] = ['EQ', 'Reverb', 'Delay', 'Chorus', 'Comp', 'Limiter']

export function EffectsPanel({ trackId, onClose }: { trackId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('EQ')
  const track         = useDAWStore(s => s.tracks.find(t => t.id === trackId))
  const updateEffects = useDAWStore(s => s.updateEffects)

  if (!track) return null
  const fx = track.effects

  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 340, background: C.bgRaised,
      border: `1px solid ${C.border}`,
      borderRadius: 10, boxShadow: `0 8px 40px ${C.shadowLg}`,
      zIndex: 1000,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 14px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: track.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text1 }}>{track.name}</span>
          <span style={{ fontSize: 10, color: C.text3 }}>FX Chain</span>
        </div>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: C.text3, fontSize: 18, cursor: 'pointer', lineHeight: 1,
          }}
        >×</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => {
          const active = isActive(fx, t)
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '7px 0',
                background: tab === t ? C.bgSubtle : 'none',
                color: active ? (tab === t ? C.accent : C.text1) : C.text3,
                border: 'none', borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                marginBottom: -1,
              }}
            >
              {t}{active ? '●' : ''}
            </button>
          )
        })}
      </div>

      {/* Panel body */}
      <div style={{ padding: '14px 16px', minHeight: 160 }}>
        {tab === 'EQ'      && <EQPanel    fx={fx} update={p => updateEffects(trackId, { eq: { ...fx.eq, ...p } })} />}
        {tab === 'Reverb'  && <ReverbPanel fx={fx} update={p => updateEffects(trackId, { reverb: { ...fx.reverb, ...p } })} />}
        {tab === 'Delay'   && <DelayPanel  fx={fx} update={p => updateEffects(trackId, { delay: { ...fx.delay, ...p } })} />}
        {tab === 'Chorus'  && <ChorusPanel fx={fx} update={p => updateEffects(trackId, { chorus: { ...fx.chorus, ...p } })} />}
        {tab === 'Comp'    && <CompPanel   fx={fx} update={p => updateEffects(trackId, { compressor: { ...fx.compressor, ...p } })} />}
        {tab === 'Limiter' && <LimiterPanel fx={fx} update={p => updateEffects(trackId, { limiter: { ...fx.limiter, ...p } })} />}
      </div>
    </div>
  )
}

function isActive(fx: EffectChain, tab: Tab): boolean {
  if (tab === 'EQ')      return fx.eq.enabled
  if (tab === 'Reverb')  return fx.reverb.enabled
  if (tab === 'Delay')   return fx.delay.enabled
  if (tab === 'Chorus')  return fx.chorus.enabled
  if (tab === 'Comp')    return fx.compressor.enabled
  if (tab === 'Limiter') return fx.limiter.enabled
  return false
}

// ── Knob/Slider helpers ───────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 8 }}>
      <span style={{ width: 64, fontSize: 11, color: C.text2, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}

function Slider({
  min, max, step = 0.01, value, onChange, accent = C.accent,
}: {
  min: number; max: number; step?: number
  value: number; onChange: (v: number) => void; accent?: string
}) {
  return (
    <input
      type="range" min={min} max={max} step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ flex: 1, accentColor: accent }}
    />
  )
}

function Val({ v, unit = '' }: { v: number; unit?: string }) {
  return (
    <span style={{ width: 40, textAlign: 'right', fontSize: 10, color: C.text3, flexShrink: 0 }}>
      {v.toFixed(v < 10 && v > -10 ? 1 : 0)}{unit}
    </span>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 12 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 30, height: 16, borderRadius: 8,
          background: checked ? C.accent : C.bgSubtle,
          border: `1px solid ${checked ? C.accentDim : C.border}`,
          position: 'relative', transition: 'background 0.15s',
        }}
      >
        <div style={{
          position: 'absolute', top: 2,
          left: checked ? 14 : 2,
          width: 10, height: 10,
          borderRadius: '50%',
          background: checked ? '#fff' : C.text3,
          transition: 'left 0.15s',
        }}/>
      </div>
      <span style={{ fontSize: 11, color: C.text2 }}>{label}</span>
    </label>
  )
}

// ── Individual effect panels ──────────────────────────────────────────────────

function EQPanel({ fx, update }: { fx: EffectChain; update: (p: Partial<EQSettings>) => void }) {
  const eq = fx.eq
  return (
    <div>
      <Toggle label="Enable EQ" checked={eq.enabled} onChange={v => update({ enabled: v })} />
      <Row label="Low shelf">
        <Slider min={-12} max={12} value={eq.lowGain} onChange={v => update({ lowGain: v })} />
        <Val v={eq.lowGain} unit="dB" />
      </Row>
      <Row label="Low mid">
        <Slider min={-12} max={12} value={eq.loMidGain} onChange={v => update({ loMidGain: v })} />
        <Val v={eq.loMidGain} unit="dB" />
      </Row>
      <Row label="Hi mid">
        <Slider min={-12} max={12} value={eq.hiMidGain} onChange={v => update({ hiMidGain: v })} />
        <Val v={eq.hiMidGain} unit="dB" />
      </Row>
      <Row label="High shelf">
        <Slider min={-12} max={12} value={eq.highGain} onChange={v => update({ highGain: v })} />
        <Val v={eq.highGain} unit="dB" />
      </Row>
    </div>
  )
}

function ReverbPanel({ fx, update }: { fx: EffectChain; update: (p: Partial<ReverbSettings>) => void }) {
  const r = fx.reverb
  return (
    <div>
      <Toggle label="Enable Reverb" checked={r.enabled} onChange={v => update({ enabled: v })} />
      <Row label="Room size">
        <Slider min={0} max={1} value={r.roomSize} onChange={v => update({ roomSize: v })} />
        <Val v={r.roomSize * 100} unit="%" />
      </Row>
      <Row label="Wet">
        <Slider min={0} max={1} value={r.wet} onChange={v => update({ wet: v })} />
        <Val v={r.wet * 100} unit="%" />
      </Row>
    </div>
  )
}

function DelayPanel({ fx, update }: { fx: EffectChain; update: (p: Partial<DelaySettings>) => void }) {
  const d = fx.delay
  return (
    <div>
      <Toggle label="Enable Delay" checked={d.enabled} onChange={v => update({ enabled: v })} />
      <Row label="Time">
        <Slider min={0.05} max={1} step={0.01} value={d.time} onChange={v => update({ time: v })} />
        <Val v={d.time * 1000} unit="ms" />
      </Row>
      <Row label="Feedback">
        <Slider min={0} max={0.9} value={d.feedback} onChange={v => update({ feedback: v })} />
        <Val v={d.feedback * 100} unit="%" />
      </Row>
      <Row label="Wet">
        <Slider min={0} max={1} value={d.wet} onChange={v => update({ wet: v })} />
        <Val v={d.wet * 100} unit="%" />
      </Row>
    </div>
  )
}

function CompPanel({ fx, update }: { fx: EffectChain; update: (p: Partial<CompressorSettings>) => void }) {
  const c = fx.compressor
  return (
    <div>
      <Toggle label="Enable Compressor" checked={c.enabled} onChange={v => update({ enabled: v })} />
      <Row label="Threshold">
        <Slider min={-60} max={0} value={c.threshold} onChange={v => update({ threshold: v })} />
        <Val v={c.threshold} unit="dB" />
      </Row>
      <Row label="Ratio">
        <Slider min={1} max={20} step={0.5} value={c.ratio} onChange={v => update({ ratio: v })} />
        <Val v={c.ratio} unit=":1" />
      </Row>
      <Row label="Attack">
        <Slider min={0.001} max={0.5} step={0.001} value={c.attack} onChange={v => update({ attack: v })} />
        <Val v={c.attack * 1000} unit="ms" />
      </Row>
      <Row label="Release">
        <Slider min={0.01} max={1} step={0.01} value={c.release} onChange={v => update({ release: v })} />
        <Val v={c.release * 1000} unit="ms" />
      </Row>
    </div>
  )
}

function LimiterPanel({ fx, update }: { fx: EffectChain; update: (p: Partial<LimiterSettings>) => void }) {
  const l = fx.limiter
  return (
    <div>
      <Toggle label="Enable Limiter" checked={l.enabled} onChange={v => update({ enabled: v })} />
      <Row label="Threshold">
        <Slider min={-12} max={0} value={l.threshold} onChange={v => update({ threshold: v })} />
        <Val v={l.threshold} unit="dB" />
      </Row>
      <Row label="Release">
        <Slider min={0.01} max={0.5} step={0.01} value={l.release} onChange={v => update({ release: v })} />
        <Val v={l.release * 1000} unit="ms" />
      </Row>
    </div>
  )
}

function ChorusPanel({ fx, update }: { fx: EffectChain; update: (p: Partial<ChorusSettings>) => void }) {
  const c = fx.chorus
  return (
    <div>
      <Toggle label="Enable Chorus" checked={c.enabled} onChange={v => update({ enabled: v })} />
      <Row label="Rate">
        <Slider min={0.1} max={8} step={0.1} value={c.rate} onChange={v => update({ rate: v })} />
        <Val v={c.rate} unit="Hz" />
      </Row>
      <Row label="Depth">
        <Slider min={0} max={0.02} step={0.0005} value={c.depth} onChange={v => update({ depth: v })} />
        <Val v={c.depth * 1000} unit="ms" />
      </Row>
      <Row label="Wet">
        <Slider min={0} max={1} value={c.wet} onChange={v => update({ wet: v })} />
        <Val v={c.wet} unit="" />
      </Row>
    </div>
  )
}
