import { useState, useRef, useCallback } from 'react'
import { useDAWStore }        from '../../store/useDAWStore'
import { SynthEngine }        from '../../engine/SynthEngine'
import { SamplerEngine }      from '../../engine/SamplerEngine'
import { getAudioContext }    from '../../engine/context'
import { INSTRUMENTS, getInstrumentsByCategory } from '../../engine/instruments'
import { C, alpha }           from '../../constants'
import { useDAWT }            from '../../i18n'
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

const previewSynth    = new SynthEngine()
const previewSampler  = new SamplerEngine()

const KEYS   = ['C','C#','D','D#','E','F','F#','G','Ab','A','Bb','B']
const SCALES = ['Major','Minor','Pentatonic','Blues','Dorian']

export function PianoRoll() {
  const selectedClipId  = useDAWStore(s => s.selectedClipId)
  const tracks          = useDAWStore(s => s.tracks)
  const addMidiNote     = useDAWStore(s => s.addMidiNote)
  const updateMidiNote  = useDAWStore(s => s.updateMidiNote)
  const removeMidiNote  = useDAWStore(s => s.removeMidiNote)
  const setInstrument   = useDAWStore(s => s.setInstrument)
  const replaceMidiNotes= useDAWStore(s => s.replaceMidiNotes)

  const dt = useDAWT()
  const [snap, setSnap] = useState(0.25)   // beats
  const [showInstPicker, setShowInstPicker] = useState(false)
  const [aiModal, setAiModal]   = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBars, setAiBars]     = useState(4)
  const [aiKey, setAiKey]       = useState('C')
  const [aiScale, setAiScale]   = useState('Major')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]   = useState('')

  // Find selected MIDI clip
  let selectedTrack: MidiTrack | null = null
  let selectedClip: import('../../types').MidiClip | null = null
  for (const t of tracks) {
    if (t.type !== 'midi') continue
    const c = t.clips.find(c => c.id === selectedClipId)
    if (c) { selectedTrack = t as MidiTrack; selectedClip = c; break }
  }

  // Preview note: use sampler if loaded, else synth
  const previewNote = useCallback((pitch: number) => {
    const ctx = getAudioContext()
    if (selectedTrack?.instrument && previewSampler.currentInstrument === selectedTrack.instrument && previewSampler.isReady) {
      previewSampler.noteOn(`prev-${pitch}`, pitch, 100, null, ctx.destination, ctx)
      setTimeout(() => previewSampler.noteOff(`prev-${pitch}`, null, ctx), 400)
    } else {
      const preset = selectedTrack?.synth ?? {
        oscillator: 'sine' as OscillatorType, attack: 0.01, decay: 0.1,
        sustain: 0.7, release: 0.3, filterFreq: 8000, filterQ: 1,
      }
      previewSynth.noteOn(`preview-${pitch}`, pitch, 100, preset, ctx.destination, ctx)
      setTimeout(() => previewSynth.noteOff(`preview-${pitch}`, preset, ctx), 300)
    }
  }, [selectedTrack])

  // Load sampler preview when instrument changes
  const handleSelectInstrument = useCallback((instrumentId: string | null, trackId: string) => {
    setInstrument(trackId, instrumentId)
    setShowInstPicker(false)
    if (instrumentId) {
      const ctx = getAudioContext() as AudioContext
      previewSampler.loadInstrument(instrumentId, ctx).catch(() => {/* ignore */})
    }
  }, [setInstrument])

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

  async function handleAiGenerate() {
    if (!selectedTrack || !selectedClip) return
    setAiLoading(true)
    setAiError('')
    try {
      const bpm = useDAWStore.getState().transport.bpm
      const resp = await fetch('/api/generate/midi', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:       aiPrompt || `${aiKey} ${aiScale} melody`,
          bars:         aiBars,
          bpm,
          key:          aiKey,
          scale:        aiScale,
          durationBeats: aiBars * 4,
        }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      // data.notes = array of { pitch, velocity, startBeat, durationBeats }
      replaceMidiNotes(selectedTrack.id, selectedClip.id, data.notes)
      // Also update clip duration to cover generated content
      setAiModal(false)
      setAiPrompt('')
    } catch (err: unknown) {
      setAiError((err as Error).message ?? 'Unknown error')
    } finally {
      setAiLoading(false)
    }
  }

  if (!selectedClip || !selectedTrack) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.bgDeep, color: C.text3, fontSize: 12,
      }}>
        {dt.selectMidiClip}
      </div>
    )
  }

  const color = selectedTrack.color
  const gridW = BEAT_W * BEATS

  const instObj = INSTRUMENTS.find(i => i.id === selectedTrack!.instrument)
  const byCategory = getInstrumentsByCategory()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgDeep, overflow: 'hidden', position: 'relative' }}>
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
                  background: black ? C.pianoBlack : C.pianoWhite,
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

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, alignItems: 'center',
        padding: '4px 8px',
        borderTop: `1px solid ${C.borderDim}`,
        background: C.bgRaised,
        flexWrap: 'wrap',
      }}>
        {/* Instrument picker button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowInstPicker(p => !p)}
            style={{
              padding: '2px 8px', fontSize: 10, borderRadius: 3, fontWeight: 600,
              background: showInstPicker ? C.accentDim : C.bgSubtle,
              color: showInstPicker ? C.accent : C.text2,
              border: `1px solid ${showInstPicker ? C.accent : C.borderDim}`,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span>{instObj ? instObj.emoji : '🎹'}</span>
            <span>{instObj ? instObj.name : 'Synth'}</span>
            <span style={{ fontSize: 8, opacity: 0.6 }}>▼</span>
          </button>

          {/* Dropdown */}
          {showInstPicker && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, zIndex: 100,
              background: C.bgRaised, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: 4,
              maxHeight: 260, overflowY: 'auto',
              minWidth: 200,
              boxShadow: `0 -4px 16px ${C.shadowLg}`,
            }}>
              {/* Synth (default) option */}
              <div
                onClick={() => handleSelectInstrument(null, selectedTrack!.id)}
                style={{
                  padding: '4px 8px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
                  background: !selectedTrack.instrument ? C.accentDim : 'transparent',
                  color: !selectedTrack.instrument ? C.accent : C.text2,
                  fontWeight: !selectedTrack.instrument ? 700 : 400,
                }}
              >
                🎛️ Synth (built-in)
              </div>
              <div style={{ height: 1, background: C.border, margin: '4px 0' }} />
              {Array.from(byCategory.entries()).map(([cat, insts]) => (
                <div key={cat}>
                  <div style={{ padding: '2px 8px', fontSize: 9, color: C.text3, fontWeight: 700, letterSpacing: '0.05em' }}>
                    {cat.toUpperCase()}
                  </div>
                  {insts.map(inst => (
                    <div
                      key={inst.id}
                      onClick={() => handleSelectInstrument(inst.id, selectedTrack!.id)}
                      style={{
                        padding: '3px 8px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
                        background: selectedTrack.instrument === inst.id ? C.accentDim : 'transparent',
                        color: selectedTrack.instrument === inst.id ? C.accent : C.text2,
                        fontWeight: selectedTrack.instrument === inst.id ? 700 : 400,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span>{inst.emoji}</span>
                      <span>{inst.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: C.border }} />

        {/* AI Generate button */}
        <button
          onClick={() => { setAiModal(true); setShowInstPicker(false) }}
          style={{
            padding: '2px 8px', fontSize: 10, borderRadius: 3, fontWeight: 700,
            background: C.accentDim,
            color: C.accent,
            border: `1px solid ${C.accent}`,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {dt.aiGenerate}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: C.border }} />

        {/* Snap */}
        <span style={{ fontSize: 9, color: C.text3 }}>{dt.snap}</span>
        {[0.25, 0.5, 1].map(s => (
          <button
            key={s}
            onClick={() => setSnap(s)}
            style={{
              padding: '2px 6px', fontSize: 9, borderRadius: 3, fontWeight: 700,
              background: snap === s ? C.accent : C.bgSubtle,
              color: snap === s ? C.onAccent : C.text3,
              border: `1px solid ${snap === s ? C.accent : C.borderDim}`,
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {s === 0.25 ? '1/16' : s === 0.5 ? '1/8' : '1/4'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3 }}>
          {selectedClip.notes.length} notes
        </span>
      </div>

      {/* ── AI Generate Modal ────────────────────────────────────────────────── */}
      {aiModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setAiModal(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: C.overlay,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: C.bgRaised, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 24, width: 360,
            boxShadow: `0 8px 32px ${C.shadowLg}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text1, marginBottom: 16 }}>
              {dt.aiMelodyGenerator}
            </div>

            {/* Prompt */}
            <label style={{ fontSize: 10, color: C.text3, display: 'block', marginBottom: 4 }}>
              {dt.describeMelody}
            </label>
            <input
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder={`${aiKey} ${aiScale} melody, bright and energetic`}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '7px 10px', fontSize: 12,
                background: C.bgSubtle, border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.text1, outline: 'none',
                marginBottom: 12,
              }}
            />

            {/* Row: Key + Scale + Bars */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.text3, display: 'block', marginBottom: 4 }}>{dt.keyLabel}</label>
                <select
                  value={aiKey}
                  onChange={e => setAiKey(e.target.value)}
                  style={{
                    width: '100%', padding: '5px 8px', fontSize: 11,
                    background: C.bgSubtle, border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.text1,
                  }}
                >
                  {KEYS.map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: 10, color: C.text3, display: 'block', marginBottom: 4 }}>{dt.scaleLabel}</label>
                <select
                  value={aiScale}
                  onChange={e => setAiScale(e.target.value)}
                  style={{
                    width: '100%', padding: '5px 8px', fontSize: 11,
                    background: C.bgSubtle, border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.text1,
                  }}
                >
                  {SCALES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.text3, display: 'block', marginBottom: 4 }}>{dt.barsLabel}</label>
                <select
                  value={aiBars}
                  onChange={e => setAiBars(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '5px 8px', fontSize: 11,
                    background: C.bgSubtle, border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.text1,
                  }}
                >
                  {[1, 2, 4, 8].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
            </div>

            <div style={{ fontSize: 10, color: C.text3, marginBottom: 16 }}>
              {dt.creditWarning}
            </div>

            {aiError && (
              <div style={{
                fontSize: 11, color: C.error, background: alpha(C.error, 10),
                border: `1px solid ${C.error}`, borderRadius: 5,
                padding: '6px 10px', marginBottom: 12,
              }}>
                {aiError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setAiModal(false); setAiError('') }}
                disabled={aiLoading}
                style={{
                  padding: '7px 16px', fontSize: 12, borderRadius: 5,
                  background: 'none', color: C.text3,
                  border: `1px solid ${C.borderDim}`,
                  cursor: 'pointer',
                }}
              >
                {dt.cancel}
              </button>
              <button
                onClick={handleAiGenerate}
                disabled={aiLoading}
                style={{
                  padding: '7px 20px', fontSize: 12, fontWeight: 700, borderRadius: 5,
                  background: aiLoading ? C.bgSubtle : C.accent,
                  color: aiLoading ? C.text3 : C.onAccent,
                  border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {aiLoading ? (
                  <>
                    <span style={{
                      display: 'inline-block', width: 10, height: 10,
                      border: `2px solid ${C.text3}`, borderTopColor: 'transparent',
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                    }}/>
                    {dt.generating}
                  </>
                ) : dt.generate}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
