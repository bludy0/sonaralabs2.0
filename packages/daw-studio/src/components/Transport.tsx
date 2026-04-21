import { useRef } from 'react'
import { useDAWStore }    from '../store/useDAWStore'
import { useAudioEngine } from '../store/useAudioEngine'
import { exportMix, exportMixMp3 } from '../lib/exportMix'
import { C } from '../constants'

function fmt(s: number): string {
  const m  = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 10)
  return `${m}:${ss.toString().padStart(2, '0')}.${ms}`
}

export function Transport() {
  const tracks    = useDAWStore(s => s.tracks)
  const transport = useDAWStore(s => s.transport)
  const setBPM    = useDAWStore(s => s.setBPM)
  const toggleLoop= useDAWStore(s => s.toggleLoop)
  const addAudio  = useDAWStore(s => s.addAudioTrack)
  const addMidi   = useDAWStore(s => s.addMidiTrack)

  const { isPlaying, currentTime, masterVolume, play, pause, stop, setMasterVol } = useAudioEngine()

  const bpmRef  = useRef<HTMLInputElement>(null)
  const exporting = useRef(false)

  async function handleExportWav() {
    if (exporting.current) return
    exporting.current = true
    try {
      const blob = await exportMix(tracks as any)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'mix.wav'
      a.click()
      URL.revokeObjectURL(url)
    } finally { exporting.current = false }
  }

  async function handleExportMp3() {
    if (exporting.current) return
    exporting.current = true
    try {
      const blob = await exportMixMp3(tracks as any)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'mix.mp3'
      a.click()
      URL.revokeObjectURL(url)
    } finally { exporting.current = false }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '0 16px',
      height: 52,
      background: C.bgRaised,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    }}>
      {/* Playback */}
      <div style={{ display: 'flex', gap: 4 }}>
        <Btn title="Stop (Space)" onClick={stop} active={false}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="2" width="10" height="10" rx="1"/>
          </svg>
        </Btn>
        <Btn title="Play / Pause (Space)" onClick={isPlaying ? pause : play} active={isPlaying}>
          {isPlaying
            ? <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="3.5" height="10" rx="1"/><rect x="8.5" y="2" width="3.5" height="10" rx="1"/></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 2l9 5-9 5V2z"/></svg>
          }
        </Btn>
      </div>

      {/* Time display */}
      <div style={{
        fontFamily: 'monospace',
        fontSize: 18,
        fontWeight: 700,
        color: C.text1,
        letterSpacing: 1,
        minWidth: 80,
      }}>
        {fmt(currentTime)}
      </div>

      <Divider />

      {/* BPM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Label>BPM</Label>
        <input
          ref={bpmRef}
          type="number"
          min={20} max={300}
          defaultValue={transport.bpm}
          onBlur={e => setBPM(Number(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') setBPM(Number((e.target as HTMLInputElement).value)) }}
          style={{
            width: 54, textAlign: 'center',
            background: C.bgSubtle, color: C.text1,
            border: `1px solid ${C.border}`,
            borderRadius: 4, padding: '3px 6px',
            fontSize: 14, fontWeight: 600,
          }}
        />
      </div>

      <Divider />

      {/* Loop */}
      <Btn
        title="Loop (L)"
        onClick={toggleLoop}
        active={transport.loopEnabled}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 4h8a2 2 0 010 4H2" strokeLinecap="round"/>
          <path d="M4 2L2 4l2 2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 10H4a2 2 0 010-4h8" strokeLinecap="round"/>
          <path d="M10 12l2-2-2-2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </Btn>

      <Divider />

      {/* Master volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Label>VOL</Label>
        <input
          type="range" min={0} max={1} step={0.01}
          value={masterVolume}
          onChange={e => setMasterVol(parseFloat(e.target.value))}
          style={{ width: 72, accentColor: C.accent }}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Add tracks */}
      <Btn title="Add Audio Track" onClick={addAudio} active={false}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>+ Audio</span>
      </Btn>
      <Btn title="Add MIDI Track" onClick={addMidi} active={false}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>+ MIDI</span>
      </Btn>

      <Divider />

      {/* Export */}
      <Btn title="Export WAV" onClick={handleExportWav} active={false}>
        <span style={{ fontSize: 11 }}>WAV</span>
      </Btn>
      <Btn title="Export MP3" onClick={handleExportMp3} active={false}>
        <span style={{ fontSize: 11 }}>MP3</span>
      </Btn>
    </div>
  )
}

function Btn({
  children, onClick, active, title,
}: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  title?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 4, padding: '5px 10px',
        background: active ? C.accentDim : C.bgSubtle,
        color: active ? C.accent : C.text2,
        border: `1px solid ${active ? C.accentDim : C.border}`,
        borderRadius: 5, cursor: 'pointer', transition: 'all 0.1s',
        fontSize: 13,
      }}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, color: C.text3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{children}</span>
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: C.border }} />
}
