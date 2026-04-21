import { useEffect, useRef } from 'react'
import { useDAWStore } from '../store/useDAWStore'

/**
 * Watches the store for AudioClips that have a URL but no decoded buffer
 * (e.g. after loading a saved project) and re-decodes them in the background.
 */
export function useBufferRehydration() {
  const tracks     = useDAWStore(s => s.tracks)
  const updateClip = useDAWStore(s => s.updateClip)
  const pending    = useRef<Set<string>>(new Set())
  const ctxRef     = useRef<AudioContext | null>(null)

  useEffect(() => {
    for (const track of tracks) {
      if (track.type !== 'audio') continue
      for (const clip of track.clips) {
        if (clip.buffer || !clip.url || pending.current.has(clip.id)) continue

        pending.current.add(clip.id)

        if (!ctxRef.current) ctxRef.current = new AudioContext()
        const ctx = ctxRef.current

        fetch(clip.url, { credentials: 'include' })
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.arrayBuffer()
          })
          .then(ab => ctx.decodeAudioData(ab))
          .then(buffer => {
            updateClip(track.id, clip.id, { buffer })
          })
          .catch(() => { /* silently skip — clip stays without buffer */ })
          .finally(() => pending.current.delete(clip.id))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks])
}
