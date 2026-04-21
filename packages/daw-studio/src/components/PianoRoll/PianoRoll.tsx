import { useState, useRef, useCallback } from 'react'
import { useDAWStore }     from '../../store/useDAWStore'
import { SynthEngine }     from '../../engine/SynthEngine'
import { getAudioContext } from '../../engine/context'
import { C } from '../../constants'
import type { MidiTrack } from '../../types'

// C2 (36) → B6 (83), 48 pitches
const MIN_PITCH = 36
const MAX_PITCH = 83
const PITCHES   = MAX_PITCH - MIN_PITCH + 1

const KEY_W     = 40
const ROW_H     = 16
const BEAT_W    = 60
const BEATS     = 16

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const isBlack    = (p: number) => [1,3,6,8,10].includes(p % 12)

const previewSynth = new SynthEngine()

export function PianoRoll() {
  const selectedClipId = useDAWStore(s => s.selectedClipId)
  const tracks         = useDAWStore(s => s.tracks)
  const addMidiNote    = useDAWStore(s => s.addMidiNote)
  const removeMidiNote = useDAWStore(s => s.removeMidiNote)
  const transport      = useDAWStore(s => s.transport)

  const [snap, setSnap] = useState(0.25)   // beats

  // Find selected MIDI clip
  let selectedTrack: MidiTrack | null = null
  let selectedClip: import('../../types').MidiClip | null = null
  for (const t of tracks) {
    if (t.type !== 'midi') continue
    const c = t.clips.find(c => c.id === selectedClipId)
    if (c) { selectedTrack = t as MidiTrack; selectedClip = c; break }
  }

  const previewNote = useCallback((pitch: number) => {
    const ctx = getAudioContext()
    const preset = selectedTrack?.synth ?? {
      oscillator: 'sine' as OscillatorType, attack: 0.01, decay: 0.1,
      sustain: 0.7, release: 0.3, filterFreq: 8000, filterQ: 1,
    }
    previewSynth.noteOn(`preview-${pitch}`, pitch, 100, preset, ctx.destination, ctx)
    setTimeout(() => previewSynth.noteOff(`preview-${pitch}`, preset, ctx), 300)
  }, [selectedTrack])

  function onGridClick(e: React.MouseEvent<HTMLDivElement>, pitch: number) {
    if (!selectedTrack || !selectedClip) return
    const rect = e.currentTarget.getBoundingClientRect()
    const beat = Math.floor((e.clientX - rect.left) / BEAT_W / snap) * snap
    // Check if note exists at this position
    const existing = selectedClip.notes.find(
      n => n.pitch === pitch && Math.abs(n.startBeat - beat) < snap * 0.5
    )
    if (existing) {
      removeMidiNote(selectedTrack.id, selectedClip.id, existing.id)
    } else {
      addMidiNote(selectedTrack.id, selectedClip.id, {
        pitch, velocity: 100, startBeat: beat, durationBeats: snap,
      })
    }
  }

  if (!selectedClip || !selectedTrack) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.bgDeep, color: C.text3, fontSize: 12,
      }}>
        Select a MIDI clip to open the Piano Roll
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: C.bgDeep, overflow: 'hidden' }}>
      {/* Piano keys */}
      <div style={{
        width: KEY_W, flexShrink: 0,
        overflowY: 'auto',
        borderRight: `1px solid ${C.border}`,
      }}>
        {Array.from({ length: PITCHES }, (_, i) => {
          const pitch = MAX_PITCH - i
          const name  = NOTE_NAMES[pitch % 12]
          const black = isBlack(pitch)
          return (
            <div
              key={pitch}
              onMouseDown={() => previewNote(pitch)}
              style={{
                height: ROW_H,
                background: black ? C.bgSubtle : C.bgRaised,
                borderBottom: `1px solid ${C.borderDim}`,
                display: 'flex', alignItems: 'center', paddingLeft: 4,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              {name === 'C' && (
                <span style={{ fontSize: 9, color: C.text3 }}>{name}{Math.floor(pitch / 12) - 2}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Note grid */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}>
        <div style={{ width: BEAT_W * BEATS, position: 'relative' }}>
          {/* Beat grid lines */}
          {Array.from({ length: BEATS + 1 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: i * BEAT_W, width: 1,
              background: i % 4 === 0 ? C.border : C.borderDim,
              zIndex: 1,
            }}/>
          ))}

          {/* Rows */}
          {Array.from({ length: PITCHES }, (_, i) => {
            const pitch = MAX_PITCH - i
            const black = isBlack(pitch)
            const notes = selectedClip!.notes.filter(n => n.pitch === pitch)

            return (
              <div
                key={pitch}
                onClick={e => onGridClick(e, pitch)}
                style={{
                  height: ROW_H,
                  background: black ? C.bgDeep : 'transparent',
                  borderBottom: `1px solid ${C.borderDim}`,
                  position: 'relative',
                  cursor: 'crosshair',
                }}
              >
                {notes.map(n => (
                  <div
                    key={n.id}
                    onMouseDown={e => {
                      e.stopPropagation()
                      removeMidiNote(selectedTrack!.id, selectedClip!.id, n.id)
                    }}
                    style={{
                      position: 'absolute',
                      left:  n.startBeat * BEAT_W,
                      width: Math.max(4, n.durationBeats * BEAT_W - 2),
                      top: 1, bottom: 1,
                      background: selectedTrack!.color,
                      opacity: 0.4 + (n.velocity / 127) * 0.6,
                      borderRadius: 2,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Snap control */}
      <div style={{
        position: 'absolute', bottom: 4, right: 8,
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        <span style={{ fontSize: 9, color: C.text3 }}>Snap</span>
        {[0.25, 0.5, 1].map(s => (
          <button
            key={s}
            onClick={() => setSnap(s)}
            style={{
              padding: '2px 6px', fontSize: 9, borderRadius: 3,
              background: snap === s ? C.accentDim : C.bgSubtle,
              color: snap === s ? C.accent : C.text3,
              border: `1px solid ${snap === s ? C.accentDim : C.borderDim}`,
              cursor: 'pointer',
            }}
          >
            {s === 0.25 ? '1/16' : s === 0.5 ? '1/8' : '1/4'}
          </button>
        ))}
      </div>
    </div>
  )
}
