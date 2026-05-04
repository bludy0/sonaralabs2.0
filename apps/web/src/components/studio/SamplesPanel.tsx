import { useEffect, useRef, useState } from 'react'
import { useDAWStore, registerBuffer, unregisterBuffer } from '@sonaralabs/daw-studio'
import { C } from '../../theme'
import { toast } from '../../lib/toast'
import { useT } from '../../store/useI18nStore'

const DND_ITEM_TYPE = 'application/x-daw-item'
const SR = 44100

// ── Synthesis helpers ─────────────────────────────────────────────────────────

function makeBuffer(duration: number, fill: (t: number) => number, channels = 1): AudioBuffer {
  const length = Math.floor(SR * duration)
  const buf    = new AudioBuffer({ numberOfChannels: channels, length, sampleRate: SR })
  for (let ch = 0; ch < channels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = Math.max(-1, Math.min(1, fill(i / SR)))
    }
  }
  return buf
}

function noise() { return Math.random() * 2 - 1 }

// Built-in synthesizers
const SYNTHS: Record<string, () => AudioBuffer> = {
  kick: () => makeBuffer(0.55, t => {
    const freq = 90 * Math.exp(-t * 18)
    const amp  = Math.exp(-t * 9)
    return amp * Math.sin(2 * Math.PI * freq * t) * 0.9
  }),
  snare: () => makeBuffer(0.28, t => {
    const tone  = Math.sin(2 * Math.PI * 210 * t) * Math.exp(-t * 30)
    const burst = noise() * Math.exp(-t * 20)
    return tone * 0.35 + burst * 0.65
  }),
  'hh-closed': () => makeBuffer(0.07, t =>
    noise() * Math.exp(-t * 90) * 0.7
  ),
  'hh-open': () => makeBuffer(0.35, t =>
    noise() * Math.exp(-t * 7) * 0.6
  ),
  clap: () => makeBuffer(0.22, t => {
    const b0 = noise() * Math.exp(-t * 120) * 0.9
    const b1 = noise() * Math.exp(-(t - 0.01)  * 100) * (t > 0.01  ? 0.7 : 0)
    const b2 = noise() * Math.exp(-(t - 0.025) * 60)  * (t > 0.025 ? 0.9 : 0)
    return b0 + b1 + b2
  }),
  'tom-hi': () => makeBuffer(0.4, t =>
    Math.sin(2 * Math.PI * (230 * Math.exp(-t * 10)) * t) * Math.exp(-t * 12) * 0.85
  ),
  'tom-low': () => makeBuffer(0.5, t =>
    Math.sin(2 * Math.PI * (120 * Math.exp(-t * 8)) * t) * Math.exp(-t * 8) * 0.85
  ),
  crash: () => makeBuffer(1.4, t =>
    noise() * Math.exp(-t * 4) * 0.5
  ),
  'sub-bass': () => makeBuffer(0.8, t => {
    const amp = Math.exp(-t * 4)
    return amp * (Math.sin(2 * Math.PI * 50 * t) * 0.8 + Math.sin(2 * Math.PI * 100 * t) * 0.2)
  }),
  'bass-stab': () => makeBuffer(0.3, t => {
    const saw = ((t * 85) % 1) * 2 - 1
    return saw * Math.exp(-t * 20) * 0.7
  }),
  pad: () => makeBuffer(2.0, t => {
    const env = t < 1.5 ? 1 - Math.exp(-t * 2) : Math.exp(-(t - 1.5) * 5)
    return env * (
      Math.sin(2 * Math.PI * 220 * t) +
      Math.sin(2 * Math.PI * 330 * t) * 0.6 +
      Math.sin(2 * Math.PI * 440 * t) * 0.3
    ) * 0.4
  }),
  bell: () => makeBuffer(2.5, t => {
    const env = Math.exp(-t * 2.5)
    return env * (
      Math.sin(2 * Math.PI * 880 * t) +
      Math.sin(2 * Math.PI * 1320 * t) * 0.5 +
      Math.sin(2 * Math.PI * 2200 * t) * 0.2
    ) * 0.5
  }),
  lead: () => makeBuffer(0.5, t => {
    const env = Math.exp(-t * 6) * (1 - Math.exp(-t * 40))
    const sq  = Math.sin(2 * Math.PI * 440 * t)
              + Math.sin(2 * Math.PI * 440 * 3 * t) * 0.33
              + Math.sin(2 * Math.PI * 440 * 5 * t) * 0.2
    return env * sq * 0.45
  }),
  'white-noise': () => makeBuffer(1.0, t =>
    noise() * Math.exp(-t * 2) * 0.6
  ),
  riser: () => makeBuffer(2.0, t =>
    (t / 2.0) * Math.sin(2 * Math.PI * (60 * Math.exp(t * 2.5)) * t) * 0.6
  ),
  impact: () => makeBuffer(0.6, t =>
    Math.sin(2 * Math.PI * 40 * t) * Math.exp(-t * 12) * 0.8
    + noise() * Math.exp(-t * 30) * 0.5
  ),
}

// ── Built-in catalogue ────────────────────────────────────────────────────────

interface SampleDef { id: string; name: string; builtIn: true }
interface UserSampleDef { id: string; name: string; builtIn: false }
type AnySample = SampleDef | UserSampleDef

const BUILT_IN_CATEGORIES: { label: string; samples: SampleDef[] }[] = [
  {
    label: 'DRUMS',
    samples: [
      { id: 'kick',      name: 'Kick',       builtIn: true },
      { id: 'snare',     name: 'Snare',      builtIn: true },
      { id: 'hh-closed', name: 'Hi-Hat Cl',  builtIn: true },
      { id: 'hh-open',   name: 'Hi-Hat Op',  builtIn: true },
      { id: 'clap',      name: 'Clap',       builtIn: true },
      { id: 'tom-hi',    name: 'Tom Hi',     builtIn: true },
      { id: 'tom-low',   name: 'Tom Low',    builtIn: true },
      { id: 'crash',     name: 'Crash',      builtIn: true },
    ],
  },
  {
    label: 'BASS',
    samples: [
      { id: 'sub-bass',  name: 'Sub Bass',   builtIn: true },
      { id: 'bass-stab', name: 'Bass Stab',  builtIn: true },
    ],
  },
  {
    label: 'SYNTH',
    samples: [
      { id: 'pad',  name: 'Pad',  builtIn: true },
      { id: 'bell', name: 'Bell', builtIn: true },
      { id: 'lead', name: 'Lead', builtIn: true },
    ],
  },
  {
    label: 'FX',
    samples: [
      { id: 'white-noise', name: 'White Noise', builtIn: true },
      { id: 'riser',       name: 'Riser',       builtIn: true },
      { id: 'impact',      name: 'Impact',       builtIn: true },
    ],
  },
]

// ── Preview audio context ─────────────────────────────────────────────────────

let _previewCtx: AudioContext | null = null
function getPreviewCtx(): AudioContext {
  if (!_previewCtx) _previewCtx = new AudioContext({ sampleRate: SR })
  return _previewCtx
}
let _previewSrc: AudioBufferSourceNode | null = null
function stopPreview() {
  if (_previewSrc) { try { _previewSrc.stop() } catch { /**/ } _previewSrc = null }
}
function previewBuffer(buf: AudioBuffer) {
  stopPreview()
  const ctx = getPreviewCtx()
  if (ctx.state === 'suspended') ctx.resume()
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  src.onended = () => { _previewSrc = null }
  _previewSrc = src
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function SamplesPanel() {
  const t = useT()
  const s = t.studio
  const addAudioTrack = useDAWStore(s => s.addAudioTrack)
  const addClip       = useDAWStore(s => s.addClip)

  const [search,      setSearch]      = useState('')
  const [playingId,   setPlayingId]   = useState<string | null>(null)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [userSamples, setUserSamples] = useState<UserSampleDef[]>([])
  const [importing,   setImporting]   = useState(false)

  // Buffer cache: maps sample ID → AudioBuffer (for both built-in and user)
  const bufCache  = useRef<Map<string, AudioBuffer>>(new Map())
  // Registry keys: maps sample ID → registry key (for DnD)
  const regKeys   = useRef<Map<string, string>>(new Map())
  const fileInput = useRef<HTMLInputElement>(null)

  // ── Get or create buffer ──────────────────────────────────────────────────
  function getBuffer(id: string): AudioBuffer | undefined {
    if (bufCache.current.has(id)) return bufCache.current.get(id)
    if (SYNTHS[id]) {
      const buf = SYNTHS[id]()
      bufCache.current.set(id, buf)
      return buf
    }
    return undefined
  }

  // Get (or lazily register) a sample's registry key for DnD
  function getRegKey(id: string, buf: AudioBuffer): string {
    if (regKeys.current.has(id)) return regKeys.current.get(id)!
    const key = registerBuffer(buf, id)
    regKeys.current.set(id, key)
    return key
  }

  // ── Ctrl+V keyboard shortcut ──────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return
      const isMacPaste = e.metaKey && e.key === 'v'
      const isWinPaste = e.ctrlKey  && e.key === 'v'
      const isEnter    = e.key === 'Enter'
      if (!isMacPaste && !isWinPaste && !isEnter) return
      if (document.activeElement?.tagName === 'INPUT') return
      if (document.activeElement?.tagName === 'TEXTAREA') return
      // Ctrl+V: DAW clipboard varsa onun paste işlemine bırak, biz karışmayalım
      if ((isMacPaste || isWinPaste) && useDAWStore.getState().clipboard !== null) return
      e.preventDefault()
      handleAdd(selectedId, getSampleName(selectedId))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])   // eslint-disable-line react-hooks/exhaustive-deps

  function getSampleName(id: string): string {
    for (const cat of BUILT_IN_CATEGORIES) {
      const s = cat.samples.find(s => s.id === id)
      if (s) return s.name
    }
    return userSamples.find(s => s.id === id)?.name ?? id
  }

  // ── Add to DAW — same track, placed right after the last existing clip ──────
  function handleAdd(id: string, name: string) {
    const buf = getBuffer(id)
    if (!buf) return

    const state = useDAWStore.getState()

    // 1. Use the currently selected track if it's audio
    // 2. Fall back to the last audio track
    // 3. Create a new audio track only as last resort
    let trackId: string | undefined
    const selectedTrackId = state.selectedTrackId
    const selectedTrack   = selectedTrackId ? state.tracks.find(t => t.id === selectedTrackId) : null

    if (selectedTrack?.type === 'audio') {
      trackId = selectedTrack.id
    } else {
      const audioTracks = state.tracks.filter(t => t.type === 'audio')
      trackId = audioTracks[audioTracks.length - 1]?.id
    }

    if (!trackId) {
      // No audio track yet — create one
      addAudioTrack()
      const newState = useDAWStore.getState()
      const audioTracks2 = newState.tracks.filter(t => t.type === 'audio')
      trackId = audioTracks2[audioTracks2.length - 1]?.id
      if (!trackId) return
    }

    // Find where to place the clip: right after the last clip on this track
    const track = useDAWStore.getState().tracks.find(t => t.id === trackId)
    let startTime = 0
    if (track?.type === 'audio' && track.clips.length > 0) {
      startTime = Math.max(...track.clips.map(c => c.startTime + c.duration - c.trimStart - c.trimEnd))
    }

    addClip(trackId, {
      name, startTime, duration: buf.duration,
      trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0,
      buffer: buf, url: '',
    })
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  function handlePreview(id: string) {
    const buf = getBuffer(id)
    if (!buf) return
    previewBuffer(buf)
    setPlayingId(id)
    setTimeout(() => setPlayingId(prev => prev === id ? null : prev), buf.duration * 1000 + 100)
  }

  // ── File import ───────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setImporting(true)
    try {
      const ctx = getPreviewCtx()
      for (const file of files) {
        const ab  = await file.arrayBuffer()
        const buf = await ctx.decodeAudioData(ab)
        const id  = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const name = file.name.replace(/\.[^.]+$/, '')
        bufCache.current.set(id, buf)
        registerBuffer(buf, id)   // also register in daw-studio registry
        regKeys.current.set(id, id)
        setUserSamples(prev => [...prev, { id, name, builtIn: false }])
      }
    } catch {
      toast('Could not decode audio file.', 'error')
    } finally {
      setImporting(false)
      // reset input so the same file can be re-imported
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function handleDeleteUser(id: string) {
    unregisterBuffer(id)
    regKeys.current.delete(id)
    bufCache.current.delete(id)
    setUserSamples(prev => prev.filter(s => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // ── Search filtering ──────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()

  const filteredBuiltIn = BUILT_IN_CATEGORIES.map(cat => ({
    ...cat,
    samples: cat.samples.filter(s =>
      !q || s.name.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)
    ),
  })).filter(cat => cat.samples.length > 0)

  const filteredUser = userSamples.filter(s =>
    !q || s.name.toLowerCase().includes(q)
  )

  const totalCount = BUILT_IN_CATEGORIES.reduce((n, c) => n + c.samples.length, 0) + userSamples.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgBase }}>

      {/* ── Search + Import ─────────────────────────────────────────────── */}
      <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={s.sampleSearch}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.bgSubtle, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '5px 8px',
            fontSize: 11, color: C.text1, outline: 'none',
            marginBottom: 6,
          }}
        />
        <button
          lang="en"
          onClick={() => fileInput.current?.click()}
          disabled={importing}
          style={{
            width: '100%', padding: '5px 0',
            background: `${C.accent}15`,
            border: `1px dashed ${C.accent}50`,
            borderRadius: 6, cursor: 'pointer',
            color: C.accent, fontSize: 10,
            fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: importing ? 0.5 : 1,
          }}
        >
          {importing ? s.importing : s.importSample}
        </button>
        <input
          ref={fileInput} type="file" multiple
          accept=".wav,.mp3,.ogg,.flac,.aiff,.aif,.m4a"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {/* ── Hint when sample selected ────────────────────────────────────── */}
      {selectedId && (
        <div style={{
          padding: '4px 10px',
          background: `${C.accent}10`,
          borderBottom: `1px solid ${C.accent}30`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 9, color: C.accent }}>
            <strong>{getSampleName(selectedId)}</strong> —
            {s.sampleHintDrag} <kbd style={{ background: C.bgSubtle, borderRadius: 3, padding: '0 3px', fontFamily: 'monospace' }}>Enter</kbd> /
            <kbd style={{ background: C.bgSubtle, borderRadius: 3, padding: '0 3px', fontFamily: 'monospace' }}>Ctrl+V</kbd> {s.sampleHintAdd}
          </span>
        </div>
      )}

      {/* ── Sample list ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* User-imported samples */}
        {filteredUser.length > 0 && (
          <>
            <CategoryHeader label={s.mySamples} />
            {filteredUser.map(s => (
              <SampleRow
                key={s.id}
                id={s.id} name={s.name}
                playing={playingId === s.id}
                selected={selectedId === s.id}
                onPreview={() => handlePreview(s.id)}
                onAdd={() => handleAdd(s.id, s.name)}
                onSelect={() => setSelectedId(id => id === s.id ? null : s.id)}
                onDelete={() => handleDeleteUser(s.id)}
                getBuffer={getBuffer}
                getRegKey={getRegKey}
              />
            ))}
          </>
        )}

        {/* Built-in categories */}
        {filteredBuiltIn.map(cat => (
          <div key={cat.label}>
            <CategoryHeader label={cat.label} />
            {cat.samples.map(s => (
              <SampleRow
                key={s.id}
                id={s.id} name={s.name}
                playing={playingId === s.id}
                selected={selectedId === s.id}
                onPreview={() => handlePreview(s.id)}
                onAdd={() => handleAdd(s.id, s.name)}
                onSelect={() => setSelectedId(id => id === s.id ? null : s.id)}
                getBuffer={getBuffer}
                getRegKey={getRegKey}
              />
            ))}
          </div>
        ))}

        {filteredBuiltIn.length === 0 && filteredUser.length === 0 && (
          <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', padding: '24px 12px' }}>
            {s.noMatches}
          </p>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '5px 10px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: C.text3 }}>
          {totalCount} {s.sampleCount}
        </span>
      </div>
    </div>
  )
}

// ── Category header ───────────────────────────────────────────────────────────

function CategoryHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '8px 10px 4px',
      fontSize: 9, fontWeight: 700,
      letterSpacing: '0.15em', textTransform: 'uppercase',
      color: C.text3,
      position: 'sticky', top: 0,
      background: C.bgBase,
      borderBottom: `1px solid ${C.border}`,
    }}>
      {label}
    </div>
  )
}

// ── Sample row ────────────────────────────────────────────────────────────────

function SampleRow({
  id, name, playing, selected,
  onPreview, onAdd, onSelect, onDelete,
  getBuffer, getRegKey,
}: {
  id: string; name: string; playing: boolean; selected: boolean
  onPreview: () => void
  onAdd: () => void
  onSelect: () => void
  onDelete?: () => void
  getBuffer: (id: string) => AudioBuffer | undefined
  getRegKey: (id: string, buf: AudioBuffer) => string
}) {
  const [hovered,  setHovered]  = useState(false)
  const [dragging, setDragging] = useState(false)

  function onDragStart(e: React.DragEvent) {
    const buf = getBuffer(id)
    if (!buf) { e.preventDefault(); return }
    setDragging(true)
    const regKey = getRegKey(id, buf)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(DND_ITEM_TYPE, JSON.stringify({
      sampleId: regKey,
      name,
      duration: buf.duration,
    }))
    // Ghost pill
    const ghost = document.createElement('div')
    ghost.textContent = name
    Object.assign(ghost.style, {
      position: 'fixed', top: '-200px',
      background: C.accent, color: '#000',
      padding: '4px 10px', borderRadius: '20px',
      fontSize: '11px', fontWeight: '700',
      whiteSpace: 'nowrap', fontFamily: 'inherit',
    })
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 50, 16)
    setTimeout(() => ghost.remove(), 0)
  }

  return (
    <div
      draggable
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragEnd={() => setDragging(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px',
        background: selected
          ? `${C.accent}18`
          : dragging ? `${C.accent}10`
          : hovered ? C.bgHover : 'transparent',
        cursor: 'grab',
        transition: 'background 0.1s',
        opacity: dragging ? 0.6 : 1,
        borderLeft: selected ? `2px solid ${C.accent}` : '2px solid transparent',
      }}
    >
      {/* Playing dot */}
      <span style={{
        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
        background: playing ? C.accent : selected ? C.accent + '80' : C.text3,
        transition: 'background 0.15s',
        boxShadow: playing ? `0 0 5px ${C.accent}` : 'none',
      }} />

      {/* Name */}
      <span style={{
        flex: 1, fontSize: 11,
        color: selected ? C.accent : C.text1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontWeight: selected ? 600 : 400,
      }}>
        {name}
      </span>

      {/* Preview */}
      <button
        onClick={e => { e.stopPropagation(); onPreview() }}
        title="Preview"
        style={{
          flexShrink: 0, background: 'none', border: 'none',
          cursor: 'pointer', padding: '2px 4px',
          color: playing ? C.accent : C.text3,
          opacity: hovered || playing ? 1 : 0,
          transition: 'opacity 0.15s, color 0.15s',
          fontSize: 11,
        }}
      >
        {playing ? '▮' : '▶'}
      </button>

      {/* Add */}
      <button
        onClick={e => { e.stopPropagation(); onAdd() }}
        title="Add to DAW (unlimited)"
        style={{
          flexShrink: 0, background: 'none', border: 'none',
          cursor: 'pointer', padding: '2px 4px',
          color: C.accent,
          opacity: hovered || selected ? 1 : 0,
          transition: 'opacity 0.15s',
          fontSize: 14, fontWeight: 700,
        }}
      >
        +
      </button>

      {/* Delete (user samples only) */}
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Remove sample"
          style={{
            flexShrink: 0, background: 'none', border: 'none',
            cursor: 'pointer', padding: '2px 4px',
            color: C.text3,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s, color 0.15s',
            fontSize: 12,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = C.error)}
          onMouseLeave={e => (e.currentTarget.style.color = C.text3)}
        >
          ×
        </button>
      )}
    </div>
  )
}
