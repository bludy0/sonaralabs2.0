import { useDAWStore } from '../../store/useDAWStore'
import { ReverbSettings } from '../../types'

interface Props { trackId: string }

export function ReverbPanel({ trackId }: Props) {
  const track = useDAWStore(s => s.tracks.find(t => t.id === trackId))
  const updateTrack = useDAWStore(s => s.updateTrack)
  if (!track) return null

  const rev = track.effects.reverb
  const update = (patch: Partial<ReverbSettings>) =>
    updateTrack(trackId, { effects: { ...track.effects, reverb: { ...rev, ...patch } } })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Reverb</span>
        <button onClick={() => update({ enabled: !rev.enabled })}
          className={`px-2 py-0.5 rounded text-xs border ${rev.enabled ? 'border-indigo-500 text-indigo-300' : 'border-gray-600 text-gray-500'}`}>
          {rev.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      {[
        { key: 'roomSize' as const, label: 'Room Size', min: 0, max: 1, step: 0.01 },
        { key: 'wet' as const, label: 'Wet/Dry', min: 0, max: 1, step: 0.01 },
      ].map(({ key, label, min, max, step }) => (
        <div key={key}>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">{label}</span>
            <span className="text-xs text-indigo-400 font-mono">{rev[key].toFixed(2)}</span>
          </div>
          <input type="range" min={min} max={max} step={step}
            value={rev[key]} disabled={!rev.enabled}
            onChange={e => update({ [key]: Number(e.target.value) } as Partial<ReverbSettings>)}
            className="w-full accent-indigo-500 disabled:opacity-40" />
        </div>
      ))}
    </div>
  )
}
