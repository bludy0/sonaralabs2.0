import { useEffect, useRef } from 'react'
import { useDAWStore } from '../store/useDAWStore'
import { decodeWithContext } from '../engine/context'

/**
 * Watches the store for AudioClips that have a URL but no decoded buffer
 * (e.g. after loading a saved project) and re-decodes them in the background.
 *
 * Subscribes to a narrow slice — the list of (clipId, url) pairs that still
 * need a buffer — instead of the entire `tracks` array.  This means dragging a
 * fader or editing MIDI notes (which produce new `tracks` references) no longer
 * forces this effect to iterate every clip on every change.
 */
export function useBufferRehydration() {
  // Build a compact signature that only changes when a clip is added/removed
  // or its url changes.  Buffer→filled transitions also change the signature,
  // because once `buffer` is set the clip drops out of the list entirely.
  const pendingSignature = useDAWStore(s => {
    const parts: string[] = []
    for (const t of s.tracks) {
      if (t.type !== 'audio') continue
      for (const c of t.clips) {
        if (c.buffer || !c.url) continue
        parts.push(`${c.id}:${c.url}`)
      }
    }
    return parts.join('|')
  })
  const updateClip = useDAWStore(s => s.updateClip)
  const pending    = useRef<Set<string>>(new Set())
  const failed     = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!pendingSignature) return
    const tracks = useDAWStore.getState().tracks
    for (const track of tracks) {
      if (track.type !== 'audio') continue
      for (const clip of track.clips) {
        if (clip.buffer || !clip.url || pending.current.has(clip.id) || failed.current.has(clip.id)) continue

        pending.current.add(clip.id)

        fetch(clip.url, { credentials: 'include' })
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.arrayBuffer()
          })
          .then(ab => decodeWithContext(ab))
          .then(buffer => {
            updateClip(track.id, clip.id, { buffer, loadError: false })
          })
          .catch(err => {
            failed.current.add(clip.id)
            updateClip(track.id, clip.id, { loadError: true })
            // eslint-disable-next-line no-console
            console.error(`[useBufferRehydration] failed to load clip ${clip.id}:`, err)
          })
          .finally(() => pending.current.delete(clip.id))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSignature, updateClip])
}