import { useState } from 'react'
import { useDAWStore }    from '../../store/useDAWStore'
import { useAudioEngine } from '../../store/useAudioEngine'
import { C } from '../../constants'
import { EffectsPanel } from '../Effects/EffectsPanel'

export function Mixer() {
  const tracks   = useDAWStore(s => s.tracks)
  const [fxTrack, setFxTrack] = useState<string | null>(null)

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      overflowX: 'auto',
      background: C.bgDeep,
      paddingBottom: 4,
    }}>
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

      {/* FX popup */}
      {fxTrack && (
        <EffectsPanel trackId={fxTrack} onClose={() => setFxTrack(null)} />
      )}
    </div>
  )
}

function ChannelStrip({
  trackId, onOpenFX, fxOpen,
}: { trackId: string; onOpenFX: () => void; fxOpen: boolean }) {
  const track       = useDAWStore(s => s.tracks.find(t => t.id === trackId))
  const updateTrack = useDAWStore(s => s.updateTrack)

  if (!track) return null

  const anyFxOn = track.effects.eq.enabled || track.effects.reverb.enabled
    || track.effects.delay.enabled || track.effects.compressor.enabled
    || track.effects.limiter.enabled

  return (
    <div style={{
      width: 64, flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 4px',
      borderRight: `1px solid ${C.borderDim}`,
      gap: 5,
    }}>
      {/* Color dot + name */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: track.color }} />
      <div style={{
        fontSize: 9, color: C.text2, textAlign: 'center',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        width: '100%', paddingInline: 2,
      }}>
        {track.name}
      </div>

      {/* M / S */}
      <div style={{ display: 'flex', gap: 2 }}>
        <StripBtn
          active={track.muted} color={C.warning}
          onClick={() => updateTrack(trackId, { muted: !track.muted })}
        >M</StripBtn>
        <StripBtn
          active={track.soloed} color={C.success}
          onClick={() => updateTrack(trackId, { soloed: !track.soloed })}
        >S</StripBtn>
      </div>

      {/* Pan knob (simple slider) */}
      <div style={{ fontSize: 8, color: C.text3 }}>
        {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(-track.pan * 100)}`}
      </div>
      <input
        type="range" min={-1} max={1} step={0.01}
        value={track.pan}
        onChange={e => updateTrack(trackId, { pan: parseFloat(e.target.value) })}
        style={{ width: 52, accentColor: track.color }}
      />

      {/* Vertical fader */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <input
          type="range" min={0} max={1} step={0.01}
          value={track.volume}
          onChange={e => updateTrack(trackId, { volume: parseFloat(e.target.value) })}
          style={{
            writingMode: 'vertical-lr', direction: 'rtl',
            height: 80, accentColor: track.color,
          }}
        />
        <div style={{ fontSize: 9, color: C.text3 }}>
          {Math.round(track.volume * 100)}%
        </div>
      </div>

      {/* FX button */}
      <button
        onClick={onOpenFX}
        title="Effects chain"
        style={{
          fontSize: 8, padding: '2px 6px',
          background: fxOpen ? C.accentDim : anyFxOn ? C.bgHover : C.bgSubtle,
          color: fxOpen ? C.accent : anyFxOn ? C.text1 : C.text3,
          border: `1px solid ${fxOpen ? C.accentDim : C.borderDim}`,
          borderRadius: 3, cursor: 'pointer',
        }}
      >
        FX{anyFxOn ? '●' : ''}
      </button>
    </div>
  )
}

function MasterStrip() {
  const { masterVolume, setMasterVol } = useAudioEngine()

  return (
    <div style={{
      width: 64, flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 4px', gap: 5,
      borderLeft: `1px solid ${C.border}`,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
      <div style={{ fontSize: 9, color: C.text2, fontWeight: 700 }}>MASTER</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
        <input
          type="range" min={0} max={1} step={0.01}
          value={masterVolume}
          onChange={e => setMasterVol(parseFloat(e.target.value))}
          style={{
            writingMode: 'vertical-lr', direction: 'rtl',
            height: 80, accentColor: C.accent,
          }}
        />
        <div style={{ fontSize: 9, color: C.text3 }}>
          {Math.round(masterVolume * 100)}%
        </div>
      </div>
    </div>
  )
}

function StripBtn({ children, active, color, onClick }: {
  children: React.ReactNode; active: boolean; color: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      width: 18, height: 16, fontSize: 8, fontWeight: 700,
      background: active ? color + '25' : C.bgSubtle,
      color: active ? color : C.text3,
      border: `1px solid ${active ? color + '50' : C.borderDim}`,
      borderRadius: 2, cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}
