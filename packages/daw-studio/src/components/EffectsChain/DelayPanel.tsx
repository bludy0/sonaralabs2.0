import { useDAWStore } from '../../store/useDAWStore'
import { DelaySettings } from '../../types'

interface Props { trackId: string }

export function DelayPanel({ trackId }: Props) {
  const track = useDAWStore(s => s.tracks.find(t => t.id === trackId))
  const updateTrack = useDAWStore(s => s.updateTrack)
  if (!track) return null

  const del = track.effects.delay
  const update = (patch: Partial<DelaySettings>) =>
    updateTrack(trackId, { effects: { ...track.effects, delay: { ...del, ...patch } } })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Delay</span>
        <button onClick={() => update({ enabled: !del.enabled })}
          className={`px-2 py-0.5 rounded text-xs border ${del.enabled ? 'border-indigo-500 text-indigo-300' : 'border-gray-600 text-gray-500'}`}>
          {del.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      {[
        { key: 'time' as const, label: 'Time (s)', min: 0.05, max: 1, step: 0.01 },
        { key: 'feedback' as const, label: 'Feedback', min: 0, max: 0.9, step: 0.01 },
        { key: 'wet' as const, label: 'Wet/Dry', min: 0, max: 1, step: 0.01 },
      ].map(({ key, label, min, max, step }) => (
        <div key={key}>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">{label}</span>
            <span className="text-xs text-indigo-400 font-mono">{del[key].toFixed(2)}</span>
          </div>
          <input type="range" min={min} max={max} step={step}
            value={del[key]} disabled={!del.enabled}
            onChange={e => update({ [key]: Number(e.target.value) } as Partial<DelaySettings>)}
            className="w-full accent-indigo-500 disabled:opacity-40" />
        </div>
      ))}
    </div>
  )
}
