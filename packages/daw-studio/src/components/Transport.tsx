import { useDAWStore } from '../store/useDAWStore'
import { useAudioEngine } from '../store/useAudioEngine'
import { formatTime } from '../lib/audioUtils'
import { exportMix } from '../lib/exportMix'
import { useState } from 'react'

export default function Transport() {
  const transport = useDAWStore(s => s.transport)
  const tracks = useDAWStore(s => s.tracks)
  const masterVolume = useDAWStore(s => s.masterVolume)
  const setBPM = useDAWStore(s => s.setBPM)
  const toggleLoop = useDAWStore(s => s.toggleLoop)
  const setMasterVolume = useDAWStore(s => s.setMasterVolume)
  const addTrack = useDAWStore(s => s.addTrack)

  const play = useAudioEngine(s => s.play)
  const pause = useAudioEngine(s => s.pause)
  const stop = useAudioEngine(s => s.stop)

  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await exportMix(tracks)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'mix-export.wav'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Export failed: ' + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0 flex-wrap">
      {/* Transport buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => transport.isPlaying ? pause() : play()}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          title={transport.isPlaying ? 'Pause' : 'Play'}
        >
          {transport.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={stop}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          title="Stop"
        >
          ⏹
        </button>
      </div>

      {/* Time display */}
      <span className="font-mono text-sm text-indigo-300 tabular-nums w-24">
        {formatTime(transport.currentTime)}
      </span>

      {/* BPM */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">BPM</span>
        <input
          type="number"
          min={40} max={300}
          value={transport.bpm}
          onChange={e => setBPM(Number(e.target.value))}
          className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Loop toggle */}
      <button
        onClick={toggleLoop}
        className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
          transport.loopEnabled
            ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300'
            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
        }`}
      >
        Loop
      </button>

      {/* Master volume */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">Vol</span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={masterVolume}
          onChange={e => setMasterVolume(Number(e.target.value))}
          className="w-20 accent-indigo-500"
        />
      </div>

      <div className="flex-1" />

      {/* Add track */}
      <button
        onClick={() => addTrack()}
        className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 transition-colors"
      >
        + Track
      </button>

      {/* Export */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-3 py-1.5 rounded text-xs font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white transition-colors"
      >
        {exporting ? 'Exporting...' : 'Export WAV'}
      </button>
    </div>
  )
}
