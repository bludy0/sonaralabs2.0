import { useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useDAWStore } from '../../store/useDAWStore'
import { WaveformView } from './WaveformView'

export function LoopEditor() {
  const selectedClipId = useDAWStore(s => s.selectedClipId)
  const tracks = useDAWStore(s => s.tracks)
  const updateClip = useDAWStore(s => s.updateClip)
  const wsRef = useRef<WaveSurfer | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)

  const clip = tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId)
  const track = tracks.find(t => t.clips.some(c => c.id === selectedClipId))

  if (!clip || !track) return null

  const trimStart = clip.trimStart
  const trimEnd = clip.trimEnd || clip.duration

  return (
    <div className="flex flex-col h-full bg-gray-900 p-3 gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300 truncate">{clip.name}</span>
        <button onClick={() => useDAWStore.getState().selectClip(null)} className="text-gray-500 hover:text-white text-lg leading-none">x</button>
      </div>

      <WaveformView
        audioUrl={clip.audioUrl}
        color={track.color}
        onReady={d => setDuration(d)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        wsRef={wsRef}
      />

      {/* Play controls */}
      <div className="flex gap-2">
        <button
          onClick={() => wsRef.current?.playPause()}
          className="flex-1 py-1.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      </div>

      {/* Playback rate */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400">Rate</span>
          <span className="text-xs text-indigo-400 font-mono">{rate.toFixed(2)}x</span>
        </div>
        <input type="range" min={0.5} max={2} step={0.01} value={rate}
          onChange={e => { const v = Number(e.target.value); setRate(v); wsRef.current?.setPlaybackRate(v) }}
          className="w-full accent-indigo-500" />
      </div>

      {/* Trim */}
      {duration > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Trim Start (s)</label>
            <input type="number" min={0} max={trimEnd - 0.1} step={0.1}
              value={trimStart.toFixed(1)}
              onChange={e => {
                const v = Math.min(Number(e.target.value), trimEnd - 0.1)
                updateClip(track.id, clip.id, { trimStart: Math.max(0, v) })
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Trim End (s)</label>
            <input type="number" min={trimStart + 0.1} max={duration} step={0.1}
              value={trimEnd.toFixed(1)}
              onChange={e => {
                const v = Math.max(Number(e.target.value), trimStart + 0.1)
                updateClip(track.id, clip.id, { trimEnd: Math.min(duration, v) })
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}
