import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { DAWLayout, useDAWStore } from '@sonaralabs/daw-studio'
import '@sonaralabs/daw-studio/src/index.css'
import { BrowserPanel } from '../components/studio/BrowserPanel'
import { ProjectPanel } from '../components/studio/ProjectPanel'
import { C } from '../theme'

interface SavedProjectMeta {
  _id:       string
  name:      string
  updatedAt: string
  isPublic:  boolean
}

export default function StudioPage() {
  const navigate       = useNavigate()
  const { token: shareToken_ } = useParams<{ token?: string }>()
  const isReadOnly     = Boolean(shareToken_)

  const getSaveable = useDAWStore(s => s.getSaveable)
  const loadTracks  = useDAWStore(s => s.loadTracks)
  const addAudioTrack = useDAWStore(s => s.addAudioTrack)
  const addClip       = useDAWStore(s => s.addClip)
  const setBPM        = useDAWStore(s => s.setBPM)
  const setLoop       = useDAWStore(s => s.setLoop)
  const reset         = useDAWStore(s => s.reset)

  const [projectName,       setProjectName]       = useState('Untitled Project')
  const [projectId,         setProjectId]         = useState<string | null>(null)
  const [saving,            setSaving]            = useState(false)
  const [saveLabel,         setSaveLabel]         = useState<string | null>(null)
  const [shareToken,        setShareToken]        = useState<string | null>(null)
  const [sharing,           setSharing]           = useState(false)
  const [copied,            setCopied]            = useState(false)

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    reset()
    if (shareToken_) {
      api.get(`/api/projects/share/${shareToken_}`)
        .then(({ data }) => {
          const p = data.data
          if (p) {
            if (p.bpm)              setBPM(p.bpm)
            if (p.loopStart != null) setLoop(p.loopStart, p.loopEnd)
            if (p.tracks?.length)   loadTracks(p.tracks)
            setProjectName(p.name)
          }
        }).catch(() => {})
      return
    }

    // Önceki sayfadan preload (Library → Studio)
    const raw = sessionStorage.getItem('studio:preload')
    if (raw) {
      try {
        const preload = JSON.parse(raw) as { name: string; audioUrl: string }[]
        preload.forEach(t => addFromUrl({ name: t.name, audioUrl: t.audioUrl }))
      } catch {}
      sessionStorage.removeItem('studio:preload')
    }
  }, [shareToken_])

  async function addFromUrl({ name, audioUrl }: { name: string; audioUrl: string }) {
    try {
      const ctx  = new AudioContext()
      const resp = await fetch(audioUrl, { credentials: 'include' })
      const ab   = await resp.arrayBuffer()
      const buf  = await ctx.decodeAudioData(ab)
      addAudioTrack()
      const allTracks = useDAWStore.getState().tracks
      const trackId   = allTracks[allTracks.length - 1]?.id
      if (trackId) {
        useDAWStore.getState().updateTrack(trackId, { name })
        addClip(trackId, {
          name, startTime: 0, duration: buf.duration,
          trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0,
          buffer: buf, url: audioUrl,
        })
      }
    } catch {}
  }

  // ── Kaydet ───────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveLabel(null)
    try {
      const rawTracks  = getSaveable()
      const saveTracks = rawTracks.map(t =>
        t.type === 'audio' ? { ...t, clips: t.clips.map(c => ({ ...c, buffer: null })) } : t
      )
      const payload = { name: projectName, tracks: saveTracks }
      let res
      if (projectId) {
        res = await api.put(`/api/projects/${projectId}`, payload)
      } else {
        res = await api.post('/api/projects', payload)
        setProjectId(res.data.data._id)
        setShareToken(res.data.data.shareToken ?? null)
      }
      setSaveLabel('Saved ✓')
      setTimeout(() => setSaveLabel(null), 2000)
    } catch {
      setSaveLabel('Failed ✗')
      setTimeout(() => setSaveLabel(null), 3000)
    } finally { setSaving(false) }
  }

  // ── Proje yükle ─────────────────────────────────────────────────────────
  async function handleLoadProject(meta: SavedProjectMeta) {
    try {
      const { data } = await api.get(`/api/projects/${meta._id}`)
      const p = data.data
      reset()
      if (p.bpm)              setBPM(p.bpm)
      if (p.loopStart != null) setLoop(p.loopStart, p.loopEnd)
      if (p.tracks?.length)   loadTracks(p.tracks)
      setProjectName(p.name)
      setProjectId(p._id)
      setShareToken(p.shareToken ?? null)
    } catch {}
  }

  // ── Yeni proje ──────────────────────────────────────────────────────────
  function handleNewProject() {
    reset()
    setProjectName('Untitled Project')
    setProjectId(null)
    setShareToken(null)
    setSaveLabel(null)
  }

  // ── Paylaş ───────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!projectId) return
    setSharing(true)
    try {
      const { data } = await api.post(`/api/projects/${projectId}/share`)
      const tok = data.data?.shareToken ?? null
      setShareToken(tok)
      if (tok) {
        await navigator.clipboard.writeText(`${location.origin}/studio/share/${tok}`)
        setCopied(true); setTimeout(() => setCopied(false), 2500)
      }
    } catch {}
    finally { setSharing(false) }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: C.pageBg, color: C.text1,
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      overflow: 'hidden',
    }}>
      {/* ── Üst çubuk ─────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 40, flexShrink: 0,
        background: C.cardBg,
        borderBottom: `1px solid ${C.border}`,
        zIndex: 50,
      }}>
        {/* Geri */}
        <button onClick={() => navigate(-1)} style={iconBtnStyle} title="Back">←</button>
        <div style={{ width: 1, height: 16, background: C.border }} />

        {/* Logo */}
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: C.accentBright,
        }}>SONARALABS</span>
        <div style={{ width: 1, height: 16, background: C.border }} />

        {/* Proje adı */}
        {isReadOnly ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text1 }}>{projectName}</span>
        ) : (
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            onBlur={() => { if (!projectName.trim()) setProjectName('Untitled Project') }}
            style={{
              background: 'transparent', border: 'none',
              fontSize: 12, fontWeight: 600, color: C.text1,
              outline: 'none', maxWidth: 200,
            }}
            maxLength={120}
          />
        )}

        {isReadOnly && (
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 10,
            background: `${C.accent}20`, color: C.accent,
            border: `1px solid ${C.accent}40`,
          }}>Read-only</span>
        )}

        {/* Kaydet etiketi */}
        {saveLabel && (
          <span style={{
            fontSize: 11,
            color: saveLabel.includes('✓') ? C.success : C.error,
          }}>{saveLabel}</span>
        )}

        <div style={{ flex: 1 }} />

        {/* Kaydet */}
        {!isReadOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...smallBtnStyle,
              background: C.accent, color: C.accentOn,
              border: `1px solid ${C.accent}`,
              fontWeight: 700,
              boxShadow: `0 0 10px ${C.accent}30`,
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : projectId ? 'Save' : 'Save Project'}
          </button>
        )}

        {/* Paylaş */}
        {!isReadOnly && projectId && (
          <button
            onClick={handleShare}
            disabled={sharing}
            style={{
              ...smallBtnStyle,
              color:   shareToken ? C.success : C.text2,
              border: `1px solid ${shareToken ? C.success + '60' : C.border}`,
              opacity: sharing ? 0.5 : 1,
            }}
          >
            {copied ? 'Copied!' : shareToken ? '🔗 Shared' : 'Share'}
          </button>
        )}
      </header>

      {/* ── DAW (tam yükseklik) ───────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DAWLayout
          browserPanel={!isReadOnly ? <BrowserPanel /> : undefined}
          projectPanel={!isReadOnly ? (
            <ProjectPanel
              projectName={projectName}
              projectId={projectId}
              saving={saving}
              saveLabel={saveLabel}
              shareToken={shareToken}
              sharing={sharing}
              copied={copied}
              onNameChange={setProjectName}
              onSave={handleSave}
              onLoad={handleLoadProject}
              onShare={handleShare}
              onNew={handleNewProject}
            />
          ) : undefined}
        />
      </div>
    </div>
  )
}

// ── Paylaşılan buton stilleri ─────────────────────────────────────────────────
const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: C.text2, fontSize: 14, padding: '4px 6px', borderRadius: 5,
}

const smallBtnStyle: React.CSSProperties = {
  fontSize: 11, padding: '4px 10px', borderRadius: 5,
  background: C.midBg, color: C.text2,
  border: `1px solid ${C.border}`,
  cursor: 'pointer',
}
