import { useDAWStore } from '../../store/useDAWStore'
import { EQSettings } from '../../types'

interface Props { trackId: string }

export function EQPanel({ trackId }: Props) {
  const track = useDAWStore(s => s.tracks.find(t => t.id === trackId))
  const updateTrack = useDAWStore(s => s.updateTrack)
  if (!track) return null

  const eq = track.effects.eq
  const update = (patch: Partial<EQSettings>) =>
    updateTrack(trackId, { effects: { ...track.effects, eq: { ...eq, ...patch } } })

  const bands: { key: keyof EQSettings; label: string }[] = [
    { key: 'lowGain', label: 'Low' },
    { key: 'loMidGain', label: 'Lo-Mid' },
    { key: 'hiMidGain', label: 'Hi-Mid' },
    { key: 'highGain', label: 'High' },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">EQ</span>
        <button onClick={() => update({ enabled: !eq.enabled })}
          className={`px-2 py-0.5 rounded text-xs border ${eq.enabled ? 'border-indigo-500 text-indigo-300' : 'border-gray-600 text-gray-500'}`}>
          {eq.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {bands.map(({ key, label }) => (
          <div key={key} className="flex flex-col items-center gap-1">
            <span className="text-xs text-gray-400">{label}</span>
            <input type="range" min={-12} max={12} step={0.5}
              value={eq[key] as number}
              disabled={!eq.enabled}
              onChange={e => update({ [key]: Number(e.target.value) } as Partial<EQSettings>)}
              className="accent-indigo-500 disabled:opacity-40"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 60 } as React.CSSProperties}
            />
            <span className="text-xs text-gray-500 tabular-nums">{(eq[key] as number) > 0 ? '+' : ''}{(eq[key] as number).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
