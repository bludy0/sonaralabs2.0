import { DAWTrack } from '../../types'
import { useDAWStore } from '../../store/useDAWStore'

interface Props { track: DAWTrack }

export function TrackHeader({ track }: Props) {
  const updateTrack = useDAWStore(s => s.updateTrack)
  const removeTrack = useDAWStore(s => s.removeTrack)
  const selectTrack = useDAWStore(s => s.selectTrack)
  const selectedTrackId = useDAWStore(s => s.selectedTrackId)

  return (
    <div
      onClick={() => selectTrack(track.id)}
      className={`flex items-center gap-2 px-2 h-16 border-b border-gray-800 cursor-pointer transition-colors ${
        selectedTrackId === track.id ? 'bg-gray-800' : 'bg-gray-900 hover:bg-gray-850'
      }`}
    >
      <div className="w-2 h-8 rounded-full shrink-0" style={{ background: track.color }} />
      <input
        value={track.name}
        onChange={e => updateTrack(track.id, { name: e.target.value })}
        onClick={e => e.stopPropagation()}
        className="flex-1 bg-transparent text-xs text-white focus:outline-none min-w-0 truncate"
      />
      <div className="flex gap-0.5">
        <button
          onClick={e => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}
          className={`w-5 h-5 text-xs rounded transition-colors ${track.muted ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
          title="Mute"
        >M</button>
        <button
          onClick={e => { e.stopPropagation(); updateTrack(track.id, { soloed: !track.soloed }) }}
          className={`w-5 h-5 text-xs rounded transition-colors ${track.soloed ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
          title="Solo"
        >S</button>
        <button
          onClick={e => { e.stopPropagation(); removeTrack(track.id) }}
          className="w-5 h-5 text-xs rounded bg-gray-700 text-gray-400 hover:text-red-400 hover:bg-gray-600 transition-colors"
          title="Delete"
        >x</button>
      </div>
    </div>
  )
}
