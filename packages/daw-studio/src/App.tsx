import { useEffect } from 'react'
import { DAWProps, ExportedTrack } from './types'
import DAWLayout from './components/DAWLayout'
import { useDAWStore } from './store/useDAWStore'
import { useAudioEngine } from './store/useAudioEngine'

export default function App({ mode = 'standalone', initialTracks, onSave }: DAWProps = {}) {
  const loadTracks = useDAWStore(s => s.loadTracks)
  const reset = useDAWStore(s => s.reset)
  const tracks = useDAWStore(s => s.tracks)
  const init = useAudioEngine(s => s.init)
  const stop = useAudioEngine(s => s.stop)

  // Başlat
  useEffect(() => {
    init()
  }, [init])

  // initialTracks gelirse yükle
  useEffect(() => {
    if (!initialTracks?.length) return
    loadTracks(initialTracks)
  }, []) // eslint-disable-line

  // Unmount: sesi durdur + store'u temizle (AudioBuffer leak önleme)
  useEffect(() => {
    return () => {
      stop()
      reset()
    }
  }, []) // eslint-disable-line

  const handleSave = () => {
    if (!onSave) return
    const exported: ExportedTrack[] = tracks.flatMap(t =>
      t.clips.map(c => ({ id: c.id, name: c.name, audioUrl: c.audioUrl }))
    )
    onSave(exported)
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-950 text-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-indigo-400 font-bold tracking-tight text-sm">DAW STUDIO</span>
        {onSave && (
          <button
            onClick={handleSave}
            className="ml-auto px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 rounded font-medium transition-colors"
          >
            Kaydet
          </button>
        )}
      </div>
      <DAWLayout />
    </div>
  )
}
