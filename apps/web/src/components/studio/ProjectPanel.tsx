import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { C } from '../../theme'


interface SavedProjectMeta {
  _id:       string
  name:      string
  updatedAt: string
  isPublic:  boolean
}

export interface ProjectPanelProps {
  projectName:  string
  projectId:    string | null
  saving:       boolean
  saveLabel:    string | null
  shareToken:   string | null
  sharing:      boolean
  copied:       boolean
  onNameChange: (name: string) => void
  onSave:       () => void
  onLoad:       (meta: SavedProjectMeta) => void
  onShare:      () => void
  onNew:        () => void
}

export function ProjectPanel({
  projectName, projectId, saving, saveLabel, shareToken, sharing, copied,
  onNameChange, onSave, onLoad, onShare, onNew,
}: ProjectPanelProps) {
  const [projects,  setProjects]  = useState<SavedProjectMeta[]>([])
  const [loading,   setLoading]   = useState(false)
  const [expanded,  setExpanded]  = useState(true)

  async function fetchProjects() {
    setLoading(true)
    try {
      const { data } = await api.get('/api/projects')
      setProjects(data.data ?? [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchProjects() }, [])

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgBase }}>

      {/* ── Aktif Proje ─────────────────────────────────────────────────── */}
      <section style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${C.border}` }}>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
          Current Project
        </p>

        {/* Proje adı */}
        <input
          value={projectName}
          onChange={e => onNameChange(e.target.value)}
          onBlur={() => { if (!projectName.trim()) onNameChange('Untitled Project') }}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.bgSubtle, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '6px 8px',
            fontSize: 12, fontWeight: 600, color: C.text1,
            outline: 'none', marginBottom: 8,
          }}
          maxLength={120}
          placeholder="Untitled Project"
        />

        {/* Kaydet */}
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            width: '100%', padding: '7px 0', borderRadius: 6,
            background: C.accent, color: 'var(--accent-on)',
            border: 'none', cursor: saving ? 'wait' : 'pointer',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase',
            boxShadow: `0 0 12px ${C.accent}30`,
            opacity: saving ? 0.6 : 1,
            marginBottom: 6,
          }}
        >
          {saving ? 'Saving…' : projectId ? 'Save' : 'Save Project'}
        </button>

        {/* Kaydet etiketi */}
        {saveLabel && (
          <p style={{
            fontSize: 11, textAlign: 'center',
            color: saveLabel.includes('✓') ? C.success : C.error,
            marginBottom: 4,
          }}>
            {saveLabel}
          </p>
        )}

        {/* Paylaş */}
        {projectId && (
          <button
            onClick={onShare}
            disabled={sharing}
            style={{
              width: '100%', padding: '6px 0', borderRadius: 6,
              background: shareToken ? `${C.success}20` : C.bgSubtle,
              color:      shareToken ? C.success : C.text2,
              border: `1px solid ${shareToken ? C.success + '60' : C.border}`,
              cursor: sharing ? 'wait' : 'pointer',
              fontSize: 11, fontWeight: 600,
              opacity: sharing ? 0.6 : 1,
            }}
          >
            {copied ? '🔗 Copied!' : shareToken ? '🔗 Share link' : 'Share'}
          </button>
        )}
      </section>

      {/* ── Yeni Proje ──────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
        <button
          onClick={onNew}
          style={{
            width: '100%', padding: '6px 0', borderRadius: 6,
            background: C.bgSubtle, color: C.text2,
            border: `1px solid ${C.border}`,
            cursor: 'pointer', fontSize: 11,
          }}
        >
          + New Project
        </button>
      </div>

      {/* ── Kaydedilen Projeler ──────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, flex: 1 }}>
          Saved Projects
        </p>
        <button
          onClick={e => { e.stopPropagation(); fetchProjects() }}
          style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 12 }}
          title="Reload"
        >↻</button>
        <span style={{ color: C.text3, fontSize: 10, marginLeft: 4 }}>{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', padding: '16px 0' }}>Loading…</p>
          ) : projects.length === 0 ? (
            <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', padding: '16px 0' }}>No saved projects</p>
          ) : projects.map(p => (
            <button
              key={p._id}
              onClick={() => onLoad(p)}
              style={{
                width: '100%', textAlign: 'left',
                padding: '8px 12px', background: p._id === projectId ? `${C.accent}15` : 'none',
                border: 'none', cursor: 'pointer',
                borderLeft: p._id === projectId ? `2px solid ${C.accent}` : '2px solid transparent',
              }}
              onMouseEnter={e => { if (p._id !== projectId) (e.currentTarget as HTMLElement).style.background = C.bgHover }}
              onMouseLeave={e => { if (p._id !== projectId) (e.currentTarget as HTMLElement).style.background = 'none' }}
            >
              <p style={{ fontSize: 11, color: C.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.isPublic && <span style={{ fontSize: 9, color: C.accent, marginRight: 4 }}>🔗</span>}
                {p.name}
              </p>
              <p style={{ fontSize: 9, color: C.text3 }}>{fmt(p.updatedAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
