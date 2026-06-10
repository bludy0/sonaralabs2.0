import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { DAWLayout, useDAWStore } from '@sonaralabs/daw-studio'
import '@sonaralabs/daw-studio/src/index.css'
import { BrowserPanel }  from '../components/studio/BrowserPanel'
import { ProjectPanel }  from '../components/studio/ProjectPanel'
import { SamplesPanel }  from '../components/studio/SamplesPanel'
import { PluginsPanel }  from '../components/studio/PluginsPanel'
import { C } from '../theme'
import { audioBufferToDataUrlSync, dataUrlToAudioBuffer } from '@sonaralabs/daw-studio'

export interface SavedProjectMeta {
  _id:        string
  name:       string
  updatedAt:  string
  isPublic:   boolean
  shareToken?: string
  trackCount: number
  bpm:        number
}

export default function StudioPage() {
  const navigate                        = useNavigate()
  const { token: shareToken_ }          = useParams<{ token?: string }>()
  const isReadOnly                      = Boolean(shareToken_)

  // ── Store subscriptions ───────────────────────────────────────────────────
  const tracks        = useDAWStore(s => s.tracks)
  const transport     = useDAWStore(s => s.transport)
  const getSaveable   = useDAWStore(s => s.getSaveable)
  const loadTracks    = useDAWStore(s => s.loadTracks)
  const loadTransport = useDAWStore(s => s.loadTransport)
  const addAudioTrack = useDAWStore(s => s.addAudioTrack)
  const addClip       = useDAWStore(s => s.addClip)
  const reset         = useDAWStore(s => s.reset)

  // ── Project state ────────────────────────────────────────────────────────
  const [projectName,  setProjectName]  = useState('Untitled Project')
  const [projectId,    setProjectId]    = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [saveLabel,    setSaveLabel]    = useState<string | null>(null)
  const [shareToken,   setShareToken]   = useState<string | null>(null)
  const [sharing,      setSharing]      = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [isDirty,      setIsDirty]      = useState(false)
  const [lastSavedAt,  setLastSavedAt]  = useState<Date | null>(null)

  // ── Dirty tracking ────────────────────────────────────────────────────────
  // suppressUntilRef: after save/load, ignore change events for 500ms
  const suppressUntilRef = useRef(0)
  const firstRenderRef   = useRef(true)

  function suppressDirty(ms = 600) {
    suppressUntilRef.current = Date.now() + ms
  }

  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return }
    if (Date.now() < suppressUntilRef.current) return
    setIsDirty(true)
  }, [tracks, transport])

  // ── Tab title ────────────────────────────────────────────────────────────
  useEffect(() => {
    document.title = `${projectName} — Sonaralabs`
    return () => { document.title = 'Sonaralabs' }
  }, [projectName])

  // ── Beforeunload — warn on unsaved changes ────────────────────────────────
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty || isReadOnly) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty, isReadOnly])

  // ── Back button ───────────────────────────────────────────────────────────
  function handleBack() {
    if (isDirty && !isReadOnly) {
      const ok = window.confirm('You have unsaved changes. Leave without saving?')
      if (!ok) return
    }
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/library')
    }
  }

  // ── Keyboard shortcut: Ctrl/Cmd+S ────────────────────────────────────────
  const handleSaveRef = useRef<(auto?: boolean) => void>(() => {})
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        handleSaveRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Mount: shared project or preload ─────────────────────────────────────
  useEffect(() => {
    reset()
    suppressDirty(1000)
    setIsDirty(false)

    if (shareToken_) {
      api.get(`/api/projects/share/${shareToken_}`)
        .then(({ data }) => {
          const p = data.data
          if (!p) return
          loadTransport({
            bpm:         p.bpm        ?? 120,
            loopStart:   p.loopStart  ?? 0,
            loopEnd:     p.loopEnd    ?? 8,
            loopEnabled: p.loopEnabled ?? false,
          })
          if (p.tracks?.length) loadTracks(p.tracks)
          setProjectName(p.name)
        }).catch(() => {})
      return
    }

    // Önceki sayfadan preload (Library → Studio)
    const raw = sessionStorage.getItem('studio:preload')
    if (raw) {
      try {
        const preload = JSON.parse(raw) as { name: string; audioUrl: string }[]
        preload.forEach(t => addFromUrl(t))
      } catch {}
      sessionStorage.removeItem('studio:preload')
    }
  }, [shareToken_])

  // ── Helpers ───────────────────────────────────────────────────────────────
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
    } catch {
      toast(`Could not load audio: ${name}`, 'error')
    }
  }

  // ── Autosave ─────────────────────────────────────────────────────────────
  // Yalnızca daha önce kaydedilmiş projelerde (projectId varken) çalışır —
  // istem dışı "Untitled Project" kayıtları oluşturmaz. Son değişiklikten
  // 4sn sonra sessizce kaydeder.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isReadOnly || !projectId || !isDirty) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => handleSaveRef.current(true), 4000)
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current) }
  }, [tracks, transport, isDirty, projectId, isReadOnly])

  // ── Kaydet ───────────────────────────────────────────────────────────────
  async function handleSave(auto = false) {
    if (saving) return
    setSaving(true); setSaveLabel(null)
    try {
      const rawTracks  = getSaveable()
      // For audio clips: keep the URL if it exists (remote/upload).
      // For synthesized clips (buffer exists, no http URL), encode buffer → WAV data URL.
      const saveTracks = rawTracks.map(t => {
        if (t.type !== 'audio') return t
        return {
          ...t,
          clips: t.clips.map(c => {
            const hasRemoteUrl = c.url && (c.url.startsWith('http') || c.url.startsWith('blob'))
            const dataUrl = (!hasRemoteUrl && c.buffer)
              ? audioBufferToDataUrlSync(c.buffer, 3_000_000)
              : null
            return { ...c, buffer: null, url: dataUrl ?? c.url ?? '' }
          }),
        }
      })
      const { bpm, loopStart, loopEnd, loopEnabled } = transport
      const payload = { name: projectName, tracks: saveTracks, bpm, loopStart, loopEnd, loopEnabled }
      let res
      if (projectId) {
        res = await api.put(`/api/projects/${projectId}`, payload)
      } else {
        res = await api.post('/api/projects', payload)
        setProjectId(res.data.data._id)
        setShareToken(res.data.data.shareToken ?? null)
      }
      suppressDirty()
      setIsDirty(false)
      setLastSavedAt(new Date())
      if (!auto) {
        setSaveLabel('Saved ✓')
        setTimeout(() => setSaveLabel(null), 2000)
      }
    } catch {
      setSaveLabel('Failed ✗')
      setTimeout(() => setSaveLabel(null), 3000)
    } finally { setSaving(false) }
  }

  // Keep the ref up-to-date so the keyboard shortcut always calls the latest version
  handleSaveRef.current = handleSave

  // ── Proje yükle ─────────────────────────────────────────────────────────
  async function handleLoadProject(meta: SavedProjectMeta) {
    try {
      const { data } = await api.get(`/api/projects/${meta._id}`)
      const p = data.data
      suppressDirty()
      reset()
      loadTransport({
        bpm:         p.bpm         ?? 120,
        loopStart:   p.loopStart   ?? 0,
        loopEnd:     p.loopEnd     ?? 8,
        loopEnabled: p.loopEnabled ?? false,
      })
      if (p.tracks?.length) loadTracks(p.tracks)
      setProjectName(p.name)
      setProjectId(p._id)
      setShareToken(p.shareToken ?? null)
      setIsDirty(false)
      // Decode synthesized clips stored as data URLs back to AudioBuffers
      if (p.tracks?.length) {
        const ctx = new AudioContext()
        for (const track of p.tracks) {
          if (track.type !== 'audio') continue
          for (const clip of track.clips ?? []) {
            if (clip.url?.startsWith('data:audio/')) {
              dataUrlToAudioBuffer(clip.url, ctx).then((buf: AudioBuffer) => {
                useDAWStore.getState().updateClip(track.id, clip.id, { buffer: buf })
              }).catch(() => {})
            }
          }
        }
      }
    } catch {}
  }

  // ── Yeni proje ──────────────────────────────────────────────────────────
  function handleNewProject(confirmed = false) {
    if (isDirty && tracks.length > 0 && !confirmed) {
      if (!window.confirm('Kaydedilmemiş değişiklikler var. Yine de yeni proje açılsın mı?')) return
    }
    suppressDirty()
    reset()
    setProjectName('Untitled Project')
    setProjectId(null)
    setShareToken(null)
    setSaveLabel(null)
    setIsDirty(false)
  }

  // ── Proje sil ───────────────────────────────────────────────────────────
  async function handleDeleteProject(id: string) {
    await api.delete(`/api/projects/${id}`)
    if (id === projectId) handleNewProject(true)
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
        <button onClick={handleBack} style={iconBtnStyle} title="Back">←</button>
        <div style={{ width: 1, height: 16, background: C.border }} />

        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: C.accentBright, flexShrink: 0,
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

        {/* Read-only badge */}
        {isReadOnly && (
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 10,
            background: `${C.accent}20`, color: C.accent,
            border: `1px solid ${C.accent}40`, flexShrink: 0,
          }}>Read-only</span>
        )}

        {/* Unsaved indicator */}
        {!isReadOnly && isDirty && !saving && (
          <span style={{
            fontSize: 10, color: C.warning, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: 7 }}>●</span> Unsaved
          </span>
        )}

        {/* Save feedback */}
        {saveLabel && (
          <span style={{
            fontSize: 11, flexShrink: 0,
            color: saveLabel.includes('✓') ? C.success : C.error,
          }}>{saveLabel}</span>
        )}

        {/* Last autosave time */}
        {!isReadOnly && !isDirty && !saveLabel && lastSavedAt && (
          <span style={{ fontSize: 10, color: C.text3, flexShrink: 0 }}>
            Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Kaydet */}
        {!isReadOnly && (
          <button
            onClick={() => handleSave()}
            disabled={saving}
            title="Save (Ctrl+S)"
            style={{
              ...smallBtnStyle,
              background: isDirty ? C.accent : C.midBg,
              color:      isDirty ? C.accentOn : C.text2,
              border:     `1px solid ${isDirty ? C.accent : C.border}`,
              fontWeight: isDirty ? 700 : 500,
              boxShadow:  isDirty ? `0 0 10px ${C.accent}40` : 'none',
              opacity: saving ? 0.5 : 1,
              transition: 'all 0.2s',
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

      {/* ── DAW ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DAWLayout
          browserPanel={!isReadOnly ? <BrowserPanel /> : undefined}
          samplesPanel={!isReadOnly ? <SamplesPanel /> : undefined}
          pluginsPanel={!isReadOnly ? <PluginsPanel /> : undefined}
          projectPanel={!isReadOnly ? (
            <ProjectPanel
              projectName={projectName}
              projectId={projectId}
              saving={saving}
              saveLabel={saveLabel}
              shareToken={shareToken}
              sharing={sharing}
              copied={copied}
              isDirty={isDirty}
              onNameChange={setProjectName}
              onSave={handleSave}
              onLoad={handleLoadProject}
              onShare={handleShare}
              onNew={() => handleNewProject()}
              onDelete={handleDeleteProject}
            />
          ) : undefined}
        />
      </div>
    </div>
  )
}

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
