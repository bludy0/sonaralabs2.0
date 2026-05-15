import { useRef, useState } from 'react'
import { useDAWStore, undo, redo } from '../store/useDAWStore'
import { useAudioEngine } from '../store/useAudioEngine'
import { exportMix, exportMixMp3 } from '../lib/exportMix'
import { C, alpha } from '../constants'
import { useDAWT } from '../i18n'

type MainTab = 'ARRANGER' | 'MIXER' | 'EDITOR'

interface TransportProps {
  activeTab: MainTab
  onTabChange: (tab: MainTab) => void
}

function fmtTimecode(s: number): string {
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const ss  = Math.floor(s % 60)
  const fr  = Math.floor((s % 1) * 30)  // 30fps display
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}:${String(fr).padStart(2,'0')}`
}

export function Transport({ activeTab, onTabChange }: TransportProps) {
  const transport         = useDAWStore(s => s.transport)
  const setBPM            = useDAWStore(s => s.setBPM)
  const setTimeSignature  = useDAWStore(s => s.setTimeSignature)
  const addAudio          = useDAWStore(s => s.addAudioTrack)
  const addMidi           = useDAWStore(s => s.addMidiTrack)
  const toggleLoop        = useDAWStore(s => s.toggleLoop)

  const { isPlaying, currentTime, play, pause, stop } = useAudioEngine()
  const masterVolume  = useAudioEngine(s => s.masterVolume)
  const setMasterVol  = useAudioEngine(s => s.setMasterVol)

  const bpmInputRef = useRef<HTMLInputElement>(null)
  const exporting   = useRef(false)
  const [exportState, setExportState] = useState<'idle' | 'wav' | 'mp3'>('idle')
  const [exportLoop,  setExportLoop]  = useState(false)

  async function handleExport(type: 'wav' | 'mp3') {
    if (exporting.current) return
    exporting.current = true
    setExportState(type)
    try {
      const { tracks, transport } = useDAWStore.getState()
      const loopPoints = exportLoop
        ? { startSec: transport.loopStart, endSec: transport.loopEnd }
        : undefined
      const blob = type === 'wav'
        ? await exportMix(tracks as any, 44100, loopPoints, transport.bpm)
        : await exportMixMp3(tracks as any, 44100, 192, transport.bpm)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `mix.${type}`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      exporting.current = false
      setExportState('idle')
    }
  }

  const dt = useDAWT()
  const bpm    = transport.bpm.toFixed(2)
  const [timeSigNum, timeSigDen] = transport.timeSignature

  const TIME_SIGNATURES: { label: string; value: [number, number] }[] = [
    { label: '4/4', value: [4, 4] },
    { label: '3/4', value: [3, 4] },
    { label: '2/4', value: [2, 4] },
    { label: '2/2', value: [2, 2] },
    { label: '6/8', value: [6, 8] },
    { label: '7/8', value: [7, 8] },
    { label: '5/4', value: [5, 4] },
    { label: '12/8', value: [12, 8] },
  ]
  const currentTimeSigLabel = `${timeSigNum}/${timeSigDen}`

  return (
    <header style={{
      display:        'flex',
      alignItems:     'center',
      height:         48,
      background:     C.bgSubtle,
      borderBottom:   `1px solid ${C.border}`,
      flexShrink:     0,
      fontFamily:     "'Inter', system-ui, sans-serif",
      userSelect:     'none',
      overflow:       'hidden',
    }}>
      {/* ── Logo ───────────────────────────────────────────────────────── */}
      <div style={{
        paddingInline: 16,
        fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
        fontSize: 15, fontWeight: 900,
        letterSpacing: '-0.04em',
        color: C.accentBright,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        SONARALABS
      </div>

      {/* ── Nav tabs ────────────────────────────────────────────────────── */}
      <nav style={{ display: 'flex', gap: 1, paddingRight: 16, flexShrink: 0 }}>
        {(['ARRANGER', 'MIXER', 'EDITOR'] as MainTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            title={
              tab === 'ARRANGER' ? 'Arranger — Arrange and sequence audio/MIDI clips on the timeline' :
              tab === 'MIXER'    ? 'Mixer — Adjust levels, panning and effects for each track' :
                                   'Editor — Piano roll for drawing and editing MIDI notes'
            }
            style={{
              fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
              fontSize:   11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding:    '0 12px',
              height:     48,
              background: 'none',
              border:     'none',
              borderBottom: activeTab === tab
                ? `2px solid ${C.accentBright}`
                : '2px solid transparent',
              color: activeTab === tab ? C.accentBright : C.text2,
              cursor: 'pointer',
              transition: 'color 0.1s, border-color 0.1s',
            }}
            onMouseEnter={e => { if (activeTab !== tab) (e.currentTarget as HTMLElement).style.color = C.text1 }}
            onMouseLeave={e => { if (activeTab !== tab) (e.currentTarget as HTMLElement).style.color = C.text2 }}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* ── Transport display (BPM + time sig + timecode) ───────────────── */}
      <div style={{
        display:     'flex',
        alignItems:  'center',
        gap:         12,
        marginRight: 12,
        padding:     '0 16px',
        background:  C.bgSelected,
        border:      `1px solid ${C.border}`,
        borderRadius: 4,
        height:      32,
        flexShrink:  0,
      }}>
        {/* BPM — editable */}
        <input
          ref={bpmInputRef}
          type="number" min={40} max={300}
          defaultValue={transport.bpm}
          title="BPM — Beats Per Minute. Sets the tempo of the project (40–300). Press Enter or click away to apply."
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const v = Math.max(40, Math.min(300, Number((e.target as HTMLInputElement).value)))
              setBPM(v);
              (e.target as HTMLInputElement).value = v.toFixed(2)
            }
          }}
          onBlur={e => {
            const v = Math.max(40, Math.min(300, Number(e.target.value)))
            setBPM(v)
            e.target.value = v.toFixed(2)
          }}
          style={{
            width:       72,
            background:  'none',
            border:      'none',
            outline:     'none',
            fontFamily:  "'Inter', monospace",
            fontSize:    24,
            fontWeight:  700,
            letterSpacing: '-0.04em',
            color:       C.accent,
            textShadow:  `0 0 20px ${alpha(C.accent, 38)}`,
            cursor:      'text',
            padding:     0,
            textAlign:   'right',
          }}
        />
        {/* Time sig — dropdown */}
        <select
          value={currentTimeSigLabel}
          onChange={e => {
            const found = TIME_SIGNATURES.find(t => t.label === e.target.value)
            if (found) setTimeSignature(found.value)
          }}
          title="Time Signature — Sets the meter of the project (beats per bar / note value)"
          style={{
            background:    C.bgSelected,
            border:        `1px solid ${C.border}`,
            borderRadius:  3,
            color:         C.text2,
            fontSize:      11,
            fontWeight:    600,
            letterSpacing: '0.04em',
            padding:       '2px 4px',
            cursor:        'pointer',
            outline:       'none',
          }}
        >
          {TIME_SIGNATURES.map(t => (
            <option key={t.label} value={t.label}>{t.label}</option>
          ))}
        </select>
        {/* Timecode */}
        <span style={{
          fontFamily: "'Inter', monospace",
          fontSize:   11,
          fontWeight: 600,
          color:      C.text2,
          letterSpacing: '0.04em',
        }}>
          {fmtTimecode(currentTime)}
        </span>
      </div>

      {/* ── Play / Stop / Record ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {/* Play/Pause */}
        <TransportBtn
          title={isPlaying ? 'Pause' : 'Play (Space)'}
          active={isPlaying}
          activeColor={C.success}
          onClick={isPlaying ? pause : play}
        >
          {isPlaying
            ? <PauseIcon />
            : <PlayIcon />}
        </TransportBtn>

        {/* Stop */}
        <TransportBtn title="Stop — Return playhead to the beginning" onClick={stop}>
          <StopIcon />
        </TransportBtn>

      </div>

      {/* ── Spacer ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1 }} />

      {/* ── Loop toggle ─────────────────────────────────────────────────── */}
      <div style={{ padding: '0 4px' }}>
        <IconBtn
          active={transport.loopEnabled}
          onClick={toggleLoop}
          title="Loop (L) — Toggle loop playback between loop start and end points"
        >
          <LoopIcon />
        </IconBtn>
      </div>

      {/* ── Undo / Redo ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 1, padding: '0 4px', borderLeft: `1px solid ${C.border}`, height: '100%', alignItems: 'center' }}>
        <IconBtn active={false} onClick={undo} title="Undo (Ctrl+Z) — Revert the last action"><UndoIcon /></IconBtn>
        <IconBtn active={false} onClick={redo} title="Redo (Ctrl+Y) — Re-apply the last undone action"><RedoIcon /></IconBtn>
      </div>

      {/* ── Add tracks ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px', borderLeft: `1px solid ${C.border}`, height: '100%', alignItems: 'center' }}>
        <SmallTextBtn onClick={addAudio} title="Add Audio Track — Create a new track for audio clips and recordings">{dt.addAudio}</SmallTextBtn>
        <SmallTextBtn onClick={addMidi} title="Add MIDI Track — Create a new track for MIDI instrument clips">{dt.addMidi}</SmallTextBtn>
      </div>

      {/* ── Master Volume ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '0 10px', borderLeft: `1px solid ${C.border}`,
        height: '100%',
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: C.text3, whiteSpace: 'nowrap' }}>
          MASTER
        </span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={masterVolume}
          onChange={e => setMasterVol(parseFloat(e.target.value))}
          title={`Master Volume — Controls the overall output level of the mix (${Math.round(masterVolume * 100)}%)`}
          style={{ width: 64, cursor: 'pointer', accentColor: C.accent, margin: 0 }}
        />
        <span style={{ fontSize: 9, color: C.text3, width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(masterVolume * 100)}%
        </span>
      </div>

      {/* ── Export ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px', borderLeft: `1px solid ${C.border}`, height: '100%', alignItems: 'center' }}>
        <SmallTextBtn
          onClick={() => setExportLoop(v => !v)}
          accent={exportLoop}
          title={exportLoop ? 'Loop Export — Only the loop region will be rendered' : 'Loop Export — Click to export only the loop region instead of the full mix'}
        >
          {exportLoop ? 'LOOP ✓' : 'LOOP'}
        </SmallTextBtn>
        <SmallTextBtn onClick={() => handleExport('wav')} accent title="Export WAV — Render and download the mix as a lossless WAV file">
          {exportState === 'wav' ? '…' : 'WAV'}
        </SmallTextBtn>
        <SmallTextBtn onClick={() => handleExport('mp3')} title="Export MP3 — Render and download the mix as a compressed MP3 (192kbps)">
          {exportState === 'mp3' ? '…' : 'MP3'}
        </SmallTextBtn>
      </div>

    </header>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TransportBtn({ children, title, active, activeColor, onClick }: {
  children: React.ReactNode
  title?: string
  active?: boolean
  activeColor?: string
  onClick?: () => void
}) {
  const color = activeColor ?? C.text2
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32,
        borderRadius: 4,
        background: active ? alpha(color, 12) : 'none',
        border:     'none',
        color:      active ? color : C.text2,
        cursor:     'pointer',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
        boxShadow:  active ? `0 0 8px ${alpha(color, 38)}` : 'none',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.color = color
        el.style.background = alpha(color, 8)
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.color = active ? color : C.text2
        el.style.background = active ? alpha(color, 12) : 'none'
      }}
    >
      {children}
    </button>
  )
}

function IconBtn({ children, active, onClick, title }: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28,
        borderRadius: 4,
        background: active ? alpha(C.accent, 12) : 'none',
        color:      active ? C.accent : C.text2,
        border:     `1px solid ${active ? alpha(C.accent, 31) : 'transparent'}`,
        cursor:     'pointer',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.color = C.text1; el.style.background = C.bgHover } }}
      onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.color = C.text2; el.style.background = 'none' } }}
    >
      {children}
    </button>
  )
}

function SmallTextBtn({ children, onClick, accent, title }: {
  children: React.ReactNode
  onClick: () => void
  accent?: boolean
  title?: string
}) {
  return (
    <button
      lang="en"
      onClick={onClick}
      title={title}
      style={{
        padding:       '3px 8px',
        borderRadius:  3,
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase' as const,
        background:    accent ? C.accent : C.bgHover,
        color:         accent ? C.onAccent : C.text2,
        border:        `1px solid ${accent ? C.accent : C.border}`,
        cursor:        'pointer',
        transition:    'all 0.1s',
        boxShadow:     accent ? `0 0 8px ${alpha(C.accent, 25)}` : 'none',
      }}
    >
      {children}
    </button>
  )
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <path d="M3 2l9 5-9 5V2z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="2" y="2" width="4" height="10" rx="1"/>
      <rect x="8" y="2" width="4" height="10" rx="1"/>
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect width="12" height="12" rx="1.5"/>
    </svg>
  )
}

function LoopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h8a2 2 0 010 4H2"/>
      <path d="M4 2L2 4l2 2"/>
      <path d="M12 10H4a2 2 0 010-4h8"/>
      <path d="M10 12l2-2-2-2"/>
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 6.5A4.5 4.5 0 1 1 6.5 11H4"/>
      <path d="M2 4v2.5h2.5"/>
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ transform: 'scaleX(-1)' }}>
      <path d="M2 6.5A4.5 4.5 0 1 1 6.5 11H4"/>
      <path d="M2 4v2.5h2.5"/>
    </svg>
  )
}

