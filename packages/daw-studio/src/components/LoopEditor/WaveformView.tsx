import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

interface Props {
  audioUrl: string
  color?: string
  onReady?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  wsRef?: React.MutableRefObject<WaveSurfer | null>
}

export function WaveformView({ audioUrl, color = '#6366f1', onReady, onPlay, onPause, wsRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const localWsRef = useRef<WaveSurfer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: color,
      progressColor: color.replace('f1', 'a5'),
      url: audioUrl,
      height: 80,
      normalize: true,
    })
    ws.on('ready', () => onReady?.(ws.getDuration()))
    ws.on('play', () => onPlay?.())
    ws.on('pause', () => onPause?.())
    localWsRef.current = ws
    if (wsRef) wsRef.current = ws
    return () => { ws.destroy(); if (wsRef) wsRef.current = null }
  }, [audioUrl]) // eslint-disable-line

  return <div ref={containerRef} className="w-full rounded overflow-hidden bg-gray-800" />
}
