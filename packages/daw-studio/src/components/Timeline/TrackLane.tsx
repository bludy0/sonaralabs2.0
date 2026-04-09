import { useCallback, useRef } from 'react'
import { DAWTrack } from '../../types'
import { AudioClip } from './AudioClip'
import { useDAWStore } from '../../store/useDAWStore'
import AudioEngine from '../../engine/AudioEngine'
import { decodeAudioFile } from '../../lib/audioUtils'

interface Props { track: DAWTrack; zoom: number }

export function TrackLane({ track, zoom }: Props) {
  const addClip = useDAWStore(s => s.addClip)
  const updateClip = useDAWStore(s => s.updateClip)
  const isDraggingOver = useRef(false)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    isDraggingOver.current = false
    const file = e.dataTransfer.files[0]
    if (!file) return
    const allowed = ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp3', 'audio/x-wav']
    if (!allowed.some(t => file.type.includes(t.split('/')[1])) && !file.name.match(/\.(wav|mp3|ogg|flac)$/i)) return
    const url = URL.createObjectURL(file)
    try {
      const engine = AudioEngine.get()
      await engine.resume()
      const buffer = await decodeAudioFile(file, engine.ctx)
      const clipId = addClip(track.id, file.name.replace(/\.[^.]+$/, ''), url, buffer)
      updateClip(track.id, clipId, { duration: buffer.duration, trimEnd: buffer.duration })
    } catch (err) {
      console.error('Failed to decode audio:', err)
    }
  }, [track.id, addClip, updateClip])

  return (
    <div
      className="relative h-16 border-b border-gray-800 bg-gray-900/50"
      onDragOver={e => { e.preventDefault(); isDraggingOver.current = true }}
      onDragLeave={() => { isDraggingOver.current = false }}
      onDrop={handleDrop}
    >
      {track.clips.map(clip => (
        <AudioClip key={clip.id} clip={clip} trackId={track.id} trackColor={track.color} zoom={zoom} />
      ))}
    </div>
  )
}
