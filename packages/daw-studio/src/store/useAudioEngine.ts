import { create } from 'zustand'
import AudioEngine from '../engine/AudioEngine'
import { TrackNode } from '../engine/TrackNode'
import { useDAWStore } from './useDAWStore'
import { AudioClip } from '../types'

interface AudioEngineState {
  initialized: boolean
  trackNodes: Map<string, TrackNode>
  playStartContextTime: number
  playStartDawTime: number
  rafId: number | null

  init: () => void
  play: () => void
  pause: () => void
  stop: () => void
  syncTrackNode: (trackId: string) => void
}

export const useAudioEngine = create<AudioEngineState>((set, get) => ({
  initialized: false,
  trackNodes: new Map(),
  playStartContextTime: 0,
  playStartDawTime: 0,
  rafId: null,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    // Subscribe to track changes → keep TrackNodes in sync
    useDAWStore.subscribe((state, prev) => {
      const engine = AudioEngine.get()
      const { trackNodes } = get()

      // New tracks
      state.tracks.forEach(track => {
        if (!trackNodes.has(track.id)) {
          const node = new TrackNode(engine.ctx, engine.masterGain)
          trackNodes.set(track.id, node)
        }
        trackNodes.get(track.id)!.update(track)
      })

      // Removed tracks
      prev.tracks.forEach(pt => {
        if (!state.tracks.find(t => t.id === pt.id)) {
          trackNodes.get(pt.id)?.stopAll()
          trackNodes.delete(pt.id)
        }
      })

      // Master volume
      engine.masterGain.gain.value = state.masterVolume
    })
  },

  play: async () => {
    const engine = AudioEngine.get()
    await engine.resume()

    const dawStore = useDAWStore.getState()
    const currentTime = dawStore.transport.currentTime
    const startContextTime = engine.ctx.currentTime
    const { trackNodes } = get()

    set({ playStartContextTime: startContextTime, playStartDawTime: currentTime })

    // Start all clips
    dawStore.tracks.forEach(track => {
      if (track.muted) return
      const node = trackNodes.get(track.id)
      if (!node) return
      track.clips.forEach((clip: AudioClip) => {
        node.playClip(clip, startContextTime - currentTime, engine.ctx.currentTime)
      })
    })

    dawStore.setPlaying(true)

    // Playhead RAF loop
    const tick = () => {
      const elapsed = AudioEngine.get().ctx.currentTime - get().playStartContextTime
      const dawTime = get().playStartDawTime + elapsed
      useDAWStore.getState().setCurrentTime(dawTime)

      const transport = useDAWStore.getState().transport
      if (transport.loopEnabled && dawTime >= transport.loopEnd) {
        get().stop()
        useDAWStore.getState().setCurrentTime(transport.loopStart)
        setTimeout(() => get().play(), 50)
        return
      }

      set({ rafId: requestAnimationFrame(tick) })
    }
    set({ rafId: requestAnimationFrame(tick) })
  },

  pause: () => {
    const { rafId, trackNodes } = get()
    if (rafId) cancelAnimationFrame(rafId)
    trackNodes.forEach(n => n.stopAll())
    useDAWStore.getState().setPlaying(false)
    set({ rafId: null })
  },

  stop: () => {
    const { rafId, trackNodes } = get()
    if (rafId) cancelAnimationFrame(rafId)
    trackNodes.forEach(n => n.stopAll())
    useDAWStore.getState().setPlaying(false)
    useDAWStore.getState().setCurrentTime(0)
    set({ rafId: null })
  },

  syncTrackNode: (trackId) => {
    const engine = AudioEngine.get()
    const { trackNodes } = get()
    if (!trackNodes.has(trackId)) {
      const node = new TrackNode(engine.ctx, engine.masterGain)
      trackNodes.set(trackId, node)
    }
    const track = useDAWStore.getState().tracks.find(t => t.id === trackId)
    if (track) trackNodes.get(trackId)!.update(track)
  },
}))
