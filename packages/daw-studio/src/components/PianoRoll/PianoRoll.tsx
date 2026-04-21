import { useState, useRef, useCallback } from 'react'
import { useDAWStore }     from '../../store/useDAWStore'
import { SynthEngine }     from '../../engine/SynthEngine'
import { getAudioContext } from '../../engine/context'
import { C } from '../../constants'
import type { MidiTrack, MidiNote } from '../../types'

// C2 (36) → B6 (83), 48 pitches
const MIN_PITCH = 36
const MAX_PITCH = 83
const PITCHES   = MAX_PITCH - MIN_PITCH + 1

const KEY_W     = 40
const ROW_H     = 16
const BEAT_W    = 60
const BEATS     = 16
const VEL_H     = 72    // velocity editor height

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const isBlack    = (p: number) => [1,3,6,8,10].includes(p % 12)

const previewSynth = new SynthEngine()

export function PianoRoll() {
  const selectedClipId = useDAWStore(s => s.selectedClipId)
  const tracks         = useDAWStore(s => s.tracks)
  const addMidiNote    = useDAWStore(s => s.addMidiNote)
  const updateMidiNote = useDAWStore(s => s.updateMidiNote)
  const removeMidiNote = useDAWStore(s => s.removeMidiNote)

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

  const color = selectedTrack.color
  const gridW = BEAT_W * BEATS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgDeep, overflow: 'hidden' }}>
      {/* ── Top: keys + note grid ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
          <div style={{ width: gridW, position: 'relative' }}>
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
                        background: color,
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
      </div>

      {/* ── Velocity editor ────────────────────────────────────────────────── */}
      <VelocityEditor
        notes={selectedClip.notes}
        trackId={selectedTrack.id}
        clipId={selectedClip.id}
        color={color}
        gridW={gridW}
        keyW={KEY_W}
        updateMidiNote={updateMidiNote}
      />

      {/* ── Snap control ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, alignItems: 'center',
        padding: '4px 8px',
        borderTop: `1px solid ${C.borderDim}`,
        background: C.bgRaised,
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
        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3 }}>
          {selectedClip.notes.length} notes
        </span>
      </div>
    </div>
  )
}

// ── Velocity Editor ───────────────────────────────────────────────────────────

function VelocityEditor({
  notes, trackId, clipId, color, gridW, keyW, updateMidiNote,
}: {
  notes:          MidiNote[]
  trackId:        string
  clipId:         string
  color:          string
  gridW:          number
  keyW:           number
  updateMidiNote: (trackId: string, clipId: string, noteId: string, patch: Partial<Omit<MidiNote,'id'>>) => void
}) {
  const draggingId = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function getVelocityAt(e: MouseEvent | React.MouseEvent): number {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return 64
    const pct = 1 - (e.clientY - rect.top) / rect.height
    return Math.max(1, Math.min(127, Math.round(pct * 127)))
  }

  function onBarMouseDown(e: React.MouseEvent, noteId: string) {
    e.stopPropagation()
    draggingId.current = noteId
    updateMidiNote(trackId, clipId, noteId, { velocity: getVelocityAt(e) })

    const onMove = (mv: MouseEvent) => {
      if (!draggingId.current) return
      updateMidiNote(trackId, clipId, draggingId.current, { velocity: getVelocityAt(mv) })
    }
    const onUp = () => {
      draggingId.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  return (
    <div style={{
      display: 'flex',
      borderTop: `1px solid ${C.border}`,
      height: VEL_H,
      flexShrink: 0,
    }}>
      {/* Key column spacer */}
      <div style={{
        width: keyW, flexShrink: 0,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 9, color: C.text3, transform: 'rotate(-90deg)', whiteSpace: 'nowrap' }}>
          Velocity
        </span>
      </div>

      {/* Bars */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflowX: 'auto', position: 'relative', background: C.bgDeep }}
      >
        <div style={{ width: gridW, height: '100%', position: 'relative' }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(pct => (
            <div key={pct} style={{
              position: 'absolute', left: 0, right: 0,
              top: `${pct * 100}%`, height: 1,
              background: C.borderDim, pointerEvents: 'none',
            }}/>
          ))}

          {/* Note velocity bars */}
          {notes.map(n => {
            const barH = Math.max(3, (n.velocity / 127) * VEL_H)
            const barX = n.startBeat * BEAT_W
            return (
              <div
                key={n.id}
                onMouseDown={e => onBarMouseDown(e, n.id)}
                style={{
                  position: 'absolute',
                  left: barX + 1,
                  bottom: 0,
                  width: 8,
                  height: barH,
                  background: color,
                  opacity: 0.7,
                  borderRadius: '2px 2px 0 0',
                  cursor: 'ns-resize',
                  userSelect: 'none',
                }}
              >
                {/* Cap dot */}
                <div style={{
                  position: 'absolute', top: -3, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 6, height: 6, borderRadius: '50%',
                  background: color,
                }}/>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
