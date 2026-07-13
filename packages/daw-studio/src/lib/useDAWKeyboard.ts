import { useEffect } from 'react'
import { useDAWStore, undo, redo } from '../store/useDAWStore'
import { useAudioEngine } from '../store/useAudioEngine'

/**
 * Global keyboard shortcuts for the DAW.
 * Mount once inside DAWLayout.
 *
 * Space          — Play / Pause
 * Shift+Space    — Stop
 * L              — Toggle loop
 * S              — Toggle snap (G also works as an alias)
 * M              — Mute the selected track
 * B              — Solo the selected track
 * Delete/Back    — Remove selected clip(s)
 * Ctrl+A         — Select all clips on selected track
 * Ctrl+C         — Copy selected clip(s)
 * Ctrl+V         — Paste clipboard clips after selection
 * Ctrl+D         — Duplicate selected clip
 * Ctrl+Z         — Undo
 * Ctrl+Shift+Z   — Redo
 * Ctrl+Y         — Redo (Windows style)
 * [ / ]          — Loop in / Loop out (set to playhead)
 * Home / End     — Playhead'i başa / proje sonuna al
 * + / -          — Zoom in / out
 * ?              — Kısayol panelini aç/kapat
 * Escape         — Panel açıksa kapat, değilse seçimi bırak
 */
export function useDAWKeyboard() {
  const store = useDAWStore

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore when typing inside an input / textarea / select
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

      const ctrl = e.ctrlKey || e.metaKey

      switch (e.key) {
        // ── Playback ──────────────────────────────────────────────────────
        case ' ': {
          e.preventDefault()
          const engine = useAudioEngine.getState()
          if (e.shiftKey) {
            engine.stop()
          } else {
            engine.isPlaying ? engine.pause() : engine.play()
          }
          break
        }

        // ── Loop ─────────────────────────────────────────────────────────
        case 'l':
        case 'L':
          if (!ctrl) { e.preventDefault(); store.getState().toggleLoop() }
          break

        case '[': {
          e.preventDefault()
          const t = useAudioEngine.getState().currentTime
          const { transport } = store.getState()
          store.getState().setLoop(t, Math.max(t + 0.5, transport.loopEnd))
          break
        }
        case ']': {
          e.preventDefault()
          const t = useAudioEngine.getState().currentTime
          const { transport } = store.getState()
          store.getState().setLoop(Math.min(transport.loopStart, t - 0.5), t)
          break
        }

        // ── Snap ─────────────────────────────────────────────────────────
        case 's':
        case 'S':
          if (!ctrl) { e.preventDefault(); store.getState().toggleSnap() }
          break
        case 'g':
        case 'G':
          if (!ctrl) { e.preventDefault(); store.getState().toggleSnap() }
          break

        // ── Mute / Solo selected track ─────────────────────────────────
        case 'm':
        case 'M': {
          if (ctrl) break
          const { selectedTrackId, tracks } = store.getState()
          const t = tracks.find(t => t.id === selectedTrackId)
          if (t) { e.preventDefault(); store.getState().updateTrack(t.id, { muted: !t.muted }) }
          break
        }
        case 'b':
        case 'B': {
          if (ctrl) break
          const { selectedTrackId, tracks } = store.getState()
          const t = tracks.find(t => t.id === selectedTrackId)
          if (t) { e.preventDefault(); store.getState().updateTrack(t.id, { soloed: !t.soloed }) }
          break
        }

        // ── Select all clips on selected track ────────────────────────────
        case 'a':
        case 'A':
          if (ctrl) {
            e.preventDefault()
            const { selectedTrackId } = store.getState()
            if (selectedTrackId) store.getState().selectAllClipsOnTrack(selectedTrackId)
          }
          break

        // ── Copy ─────────────────────────────────────────────────────────
        case 'c':
        case 'C':
          if (ctrl) {
            e.preventDefault()
            store.getState().copySelectedClips()
          }
          break

        // ── Paste ─────────────────────────────────────────────────────────
        case 'v':
        case 'V':
          if (ctrl) {
            e.preventDefault()
            store.getState().pasteClips()
          }
          break

        // ── Delete selected clip(s) ───────────────────────────────────────
        case 'Delete':
        case 'Backspace': {
          const { selectedClipIds, tracks } = store.getState()
          if (selectedClipIds.length === 0) break
          e.preventDefault()
          const idSet = new Set(selectedClipIds)
          for (const t of tracks) {
            if (t.type === 'audio') {
              for (const clip of t.clips) {
                if (idSet.has(clip.id)) store.getState().removeClip(t.id, clip.id)
              }
            }
            if (t.type === 'midi') {
              for (const clip of t.clips) {
                if (idSet.has(clip.id)) store.getState().removeMidiClip(t.id, clip.id)
              }
            }
          }
          store.getState().selectClip(null)
          break
        }

        case 'd':
        case 'D':
          if (ctrl) {
            e.preventDefault()
            const { selectedClipId, tracks } = store.getState()
            if (!selectedClipId) break
            for (const t of tracks) {
              if (t.type === 'audio' && t.clips.find(c => c.id === selectedClipId)) {
                store.getState().duplicateClip(t.id, selectedClipId)
                break
              }
            }
          }
          break

        // ── Undo / Redo ───────────────────────────────────────────────────
        case 'z':
        case 'Z':
          if (ctrl) {
            e.preventDefault()
            e.shiftKey ? redo() : undo()
          }
          break

        case 'y':
        case 'Y':
          if (ctrl) { e.preventDefault(); redo() }
          break

        // ── Playhead konumu ───────────────────────────────────────────────
        case 'Home':
          e.preventDefault()
          useAudioEngine.getState().seek(0)
          break

        case 'End': {
          e.preventDefault()
          // Proje sonu = en geç biten audio clip / midi clip
          const { tracks, transport } = store.getState()
          const secPerBeat = 60 / transport.bpm
          let end = 0
          for (const t of tracks) {
            if (t.type === 'audio') {
              for (const c of t.clips) {
                const e2 = c.startTime + (c.trimEnd || c.duration) - c.trimStart
                if (e2 > end) end = e2
              }
            } else if (t.type === 'midi') {
              for (const c of t.clips) {
                const e2 = c.startTime + c.durationBeats * secPerBeat
                if (e2 > end) end = e2
              }
            }
          }
          useAudioEngine.getState().seek(end)
          break
        }

        // ── Zoom ─────────────────────────────────────────────────────────
        case '+':
        case '=':
          if (!ctrl) { e.preventDefault(); store.getState().setZoom(store.getState().zoom * 1.25) }
          break
        case '-':
        case '_':
          if (!ctrl) { e.preventDefault(); store.getState().setZoom(store.getState().zoom * 0.8) }
          break

        // ── Kısayol paneli / seçim bırakma ────────────────────────────────
        case '?':
          e.preventDefault()
          store.getState().setShortcutsOpen(!store.getState().shortcutsOpen)
          break

        case 'Escape':
          if (store.getState().shortcutsOpen) {
            e.preventDefault()
            store.getState().setShortcutsOpen(false)
          } else if (store.getState().selectedClipIds.length > 0) {
            e.preventDefault()
            store.getState().selectClip(null)
          }
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
