import { useRef, useEffect } from 'react'
import { useDAWStore } from '../../store/useDAWStore'
import { TrackHeader } from './TrackHeader'
import { TrackLane } from './TrackLane'

const HEADER_WIDTH = 160
const RULER_HEIGHT = 24

export function Timeline() {
  const tracks = useDAWStore(s => s.tracks)
  const transport = useDAWStore(s => s.transport)
  const zoom = useDAWStore(s => s.zoom)
  const setZoom = useDAWStore(s => s.setZoom)
  const rulerRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Draw ruler
  useEffect(() => {
    const canvas = rulerRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px monospace'

    const totalSeconds = Math.ceil(width / zoom) + 1
    for (let s = 0; s <= totalSeconds; s++) {
      const x = s * zoom
      if (x > width) break
      ctx.fillStyle = s % 4 === 0 ? '#9ca3af' : '#4b5563'
      ctx.fillRect(x, s % 4 === 0 ? 8 : 14, 1, height)
      if (s % 4 === 0) {
        ctx.fillStyle = '#9ca3af'
        ctx.fillText(`${s}s`, x + 2, 12)
      }
    }
  }, [zoom])

  const totalWidth = Math.max(2000, tracks.flatMap(t => t.clips).reduce((m, c) => Math.max(m, (c.startTime + c.duration) * zoom + 200), 2000))
  const _playheadLeft = HEADER_WIDTH + transport.currentTime * zoom

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Zoom control */}
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-xs text-gray-400">Zoom</span>
        <input type="range" min={20} max={300} value={zoom} onChange={e => setZoom(Number(e.target.value))}
          className="w-24 accent-indigo-500" />
        <span className="text-xs text-gray-500">{zoom}px/s</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: track headers */}
        <div className="shrink-0 overflow-y-auto" style={{ width: HEADER_WIDTH }}>
          <div style={{ height: RULER_HEIGHT }} className="bg-gray-950 border-b border-gray-800" />
          {tracks.map(t => <TrackHeader key={t.id} track={t} />)}
        </div>

        {/* Right: ruler + lanes (scrollable) */}
        <div ref={scrollRef} className="flex-1 overflow-auto relative">
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* Ruler canvas */}
            <canvas ref={rulerRef} height={RULER_HEIGHT} width={totalWidth}
              className="block sticky top-0 z-10 bg-gray-950" />

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-indigo-400 z-20 pointer-events-none"
              style={{ left: transport.currentTime * zoom, top: 0 }}
            />

            {/* Track lanes */}
            {tracks.map(t => <TrackLane key={t.id} track={t} zoom={zoom} />)}

            {/* Empty state */}
            {tracks.length === 0 && (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                Click &quot;+ Track&quot; to add a track, then drag audio files onto lanes
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
