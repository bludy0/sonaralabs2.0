import { useRef, useEffect, useCallback } from 'react'
import { AudioClip as AudioClipType } from '../../types'
import { useDAWStore } from '../../store/useDAWStore'

interface Props {
  clip: AudioClipType
  trackId: string
  trackColor: string
  zoom: number
}

export function AudioClip({ clip, trackId, trackColor, zoom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const moveClip = useDAWStore(s => s.moveClip)
  const removeClip = useDAWStore(s => s.removeClip)
  const selectClip = useDAWStore(s => s.selectClip)
  const selectedClipId = useDAWStore(s => s.selectedClipId)

  const effectiveDuration = (clip.trimEnd || clip.duration) - clip.trimStart
  const width = Math.max(20, effectiveDuration * zoom)
  const left = clip.startTime * zoom

  // Draw mini waveform
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !clip.buffer) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width: w, height: h } = canvas
    ctx.clearRect(0, 0, w, h)
    const data = clip.buffer.getChannelData(0)
    const step = Math.floor(data.length / w)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i < w; i++) {
      let max = 0
      for (let j = 0; j < step; j++) max = Math.max(max, Math.abs(data[i * step + j] || 0))
      const barH = Math.max(1, max * h)
      ctx.fillRect(i, (h - barH) / 2, 1, barH)
    }
  }, [clip.buffer, width])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    selectClip(clip.id)
    const startX = e.clientX
    const startTime = clip.startTime
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      moveClip(trackId, clip.id, startTime + dx / zoom)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [clip.id, clip.startTime, trackId, zoom, moveClip, selectClip])

  const isSelected = selectedClipId === clip.id

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={() => removeClip(trackId, clip.id)}
      className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-grab active:cursor-grabbing select-none border ${
        isSelected ? 'border-white' : 'border-transparent'
      }`}
      style={{ left, width, background: trackColor + '55' }}
      title={`${clip.name} - double-click to remove`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" width={Math.ceil(width)} height={60} />
      <span className="absolute top-1 left-1 text-xs text-white/80 truncate max-w-full px-0.5 pointer-events-none">
        {clip.name}
      </span>
    </div>
  )
}
