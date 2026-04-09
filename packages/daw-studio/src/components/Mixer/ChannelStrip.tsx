import { useState } from 'react'
import { DAWTrack } from '../../types'
import { useDAWStore } from '../../store/useDAWStore'
import { EffectsPanel } from '../EffectsChain/EffectsPanel'

interface Props { track: DAWTrack }

export function ChannelStrip({ track }: Props) {
  const updateTrack = useDAWStore(s => s.updateTrack)
  const [showFX, setShowFX] = useState(false)

  return (
    <div className="flex flex-col items-center gap-1 w-20 shrink-0 border-r border-gray-800 px-2 py-2 bg-gray-900 h-full">
      {/* Track name */}
      <span className="text-xs text-gray-400 truncate w-full text-center" style={{ color: track.color }}>
        {track.name}
      </span>

      {/* Mute / Solo */}
      <div className="flex gap-1">
        <button onClick={() => updateTrack(track.id, { muted: !track.muted })}
          className={`w-7 h-5 text-xs rounded ${track.muted ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
          M
        </button>
        <button onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
          className={`w-7 h-5 text-xs rounded ${track.soloed ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
          S
        </button>
      </div>

      {/* Pan knob (simple range) */}
      <div className="w-full">
        <div className="flex justify-between text-gray-600 text-xs mb-0.5">
          <span>L</span><span className="text-gray-500">{track.pan === 0 ? 'C' : track.pan > 0 ? 'R' : 'L'}</span><span>R</span>
        </div>
        <input type="range" min={-1} max={1} step={0.01} value={track.pan}
          onChange={e => updateTrack(track.id, { pan: Number(e.target.value) })}
          className="w-full accent-indigo-500" />
      </div>

      {/* Volume fader */}
      <div className="flex-1 flex items-center justify-center w-full">
        <input
          type="range" min={0} max={1} step={0.01} value={track.volume}
          onChange={e => updateTrack(track.id, { volume: Number(e.target.value) })}
          className="accent-indigo-500"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 80, width: 20 } as React.CSSProperties}
        />
      </div>

      {/* Volume label */}
      <span className="text-xs text-gray-500 tabular-nums">
        {Math.round(track.volume * 100)}
      </span>

      {/* FX button */}
      <button onClick={() => setShowFX(!showFX)}
        className={`w-full py-0.5 text-xs rounded border transition-colors ${
          showFX ? 'border-indigo-500 text-indigo-300 bg-indigo-900/40' : 'border-gray-700 text-gray-400 hover:border-gray-600'
        }`}>
        FX
      </button>

      {showFX && (
        <div className="absolute z-50 bottom-12 left-0">
          <EffectsPanel trackId={track.id} onClose={() => setShowFX(false)} />
        </div>
      )}
    </div>
  )
}
