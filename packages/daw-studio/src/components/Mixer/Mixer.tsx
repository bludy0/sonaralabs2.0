import { useDAWStore } from '../../store/useDAWStore'
import { ChannelStrip } from './ChannelStrip'
import { MasterStrip } from './MasterStrip'

export function Mixer() {
  const tracks = useDAWStore(s => s.tracks)

  return (
    <div className="flex h-full bg-gray-900 overflow-x-auto">
      {tracks.map(track => (
        <div key={track.id} className="relative">
          <ChannelStrip track={track} />
        </div>
      ))}
      <MasterStrip />
    </div>
  )
}
