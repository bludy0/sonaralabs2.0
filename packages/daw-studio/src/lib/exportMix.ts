import { DAWTrack } from '../types'
import { audioBufferToWav, LoopPoints } from './audioUtils'
import { audioBufferToMp3 } from './exportMp3'
import type { WorkerTrack, WorkerMidiClip, RenderResult, RenderError } from './renderMixWorker'
import { DEFAULT_SYNTH } from '../types'

/**
 * Serialize DAWTracks (audio + MIDI) into transferable data for the render worker.
 * AudioBuffers cannot cross thread boundaries — PCM is extracted as Float32Arrays.
 * MIDI clips are passed as plain objects (already serialisable).
 */
function serializeTracks(
  tracks: DAWTrack[],
  bpm: number,
): { workerTracks: WorkerTrack[]; transferables: ArrayBuffer[] } {
  const transferables: ArrayBuffer[] = []
  const workerTracks: WorkerTrack[] = tracks.map(track => {
    // ── Audio track ────────────────────────────────────────────────────────
    if (track.type === 'audio') {
      const clips = track.clips
        .filter(c => c.buffer != null)
        .map(c => {
          const buf = c.buffer!
          const channels: Float32Array[] = []
          for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const data = new Float32Array(buf.getChannelData(ch))
            channels.push(data)
            transferables.push(data.buffer as ArrayBuffer)
          }
          return {
            startTime: c.startTime,
            trimStart: c.trimStart,
            trimEnd:   c.trimEnd,
            duration:  c.duration,
            sampleRate: buf.sampleRate,
            channels,
          }
        })
      return {
        volume: track.volume, pan: track.pan, muted: track.muted,
        effects: track.effects, bpm,
        clips, midiClips: [], synth: null,
      }
    }

    // ── MIDI track ─────────────────────────────────────────────────────────
    const midiClips: WorkerMidiClip[] = track.clips.map(mc => ({
      startTime:     mc.startTime,
      durationBeats: mc.durationBeats,
      loopBeats:     mc.loopBeats ?? mc.durationBeats,
      notes:         mc.notes.map(n => ({
        pitch:         n.pitch,
        velocity:      n.velocity,
        startBeat:     n.startBeat,
        durationBeats: n.durationBeats,
      })),
    }))
    return {
      volume: track.volume, pan: track.pan, muted: track.muted,
      effects: track.effects, bpm,
      clips: [], midiClips, synth: track.synth ?? DEFAULT_SYNTH,
    }
  })
  return { workerTracks, transferables }
}

/**
 * Render all tracks (audio + MIDI) via a Web Worker.
 * Returns an AudioBuffer assembled from the worker's rendered PCM.
 */
export function renderMix(tracks: DAWTrack[], sampleRate = 44100, bpm = 120): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./renderMixWorker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (e: MessageEvent<RenderResult | RenderError>) => {
      worker.terminate()
      const msg = e.data
      if (msg.type === 'error') {
        reject(new Error(msg.message))
        return
      }
      const ctx = new OfflineAudioContext(msg.channels.length, msg.length, msg.sampleRate)
      const buf = ctx.createBuffer(msg.channels.length, msg.length, msg.sampleRate)
      for (let ch = 0; ch < msg.channels.length; ch++) {
        buf.copyToChannel(new Float32Array(msg.channels[ch].buffer as ArrayBuffer), ch)
      }
      resolve(buf)
    }

    worker.onerror = (err) => {
      worker.terminate()
      reject(new Error(err.message))
    }

    const { workerTracks, transferables } = serializeTracks(tracks, bpm)
    worker.postMessage({ type: 'render', tracks: workerTracks, sampleRate }, { transfer: transferables })
  })
}

/** Export mix as WAV. Embeds SMPL loop chunk when loopPoints provided. */
export async function exportMix(
  tracks: DAWTrack[],
  sampleRate = 44100,
  loopPoints?: LoopPoints,
  bpm = 120,
): Promise<Blob> {
  const buf = await renderMix(tracks, sampleRate, bpm)
  return audioBufferToWav(buf, loopPoints)
}

/** Export mix as MP3 (192 kbps, lamejs). */
export async function exportMixMp3(
  tracks: DAWTrack[],
  sampleRate = 44100,
  kbps = 192,
  bpm = 120,
): Promise<Blob> {
  const buf = await renderMix(tracks, sampleRate, bpm)
  return audioBufferToMp3(buf, kbps)
}

/**
 * Export mix as OGG via server-side FFmpeg conversion.
 * Requires the /api/generation/export/ogg endpoint.
 */
export async function exportMixOgg(
  tracks: DAWTrack[],
  sampleRate = 44100,
  apiBaseUrl = '',
): Promise<Blob> {
  const wavBlob = await exportMix(tracks, sampleRate)

  const formData = new FormData()
  formData.append('wav', wavBlob, 'mix.wav')

  const resp = await fetch(`${apiBaseUrl}/api/generate/export/ogg`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'OGG export failed' }))
    throw new Error((err as { error?: string }).error ?? 'OGG export failed')
  }

  return resp.blob()
}
