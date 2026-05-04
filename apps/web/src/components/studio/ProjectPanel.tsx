import React, { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { C } from '../../theme'
import { useT } from '../../store/useI18nStore'
import type { SavedProjectMeta } from '../../pages/StudioPage'

export interface ProjectPanelProps {
  projectName:  string
  projectId:    string | null
  saving:       boolean
  saveLabel:    string | null
  shareToken:   string | null
  sharing:      boolean
  copied:       boolean
  isDirty:      boolean
  onNameChange: (name: string) => void
  onSave:       () => void
  onLoad:       (meta: SavedProjectMeta) => void
  onShare:      () => void
  onNew:        () => void
  onDelete:     (id: string) => Promise<void>
}

export function ProjectPanel({
  projectName, projectId, saving, saveLabel, shareToken, sharing, copied, isDirty,
  onNameChange, onSave, onLoad, onShare, onNew, onDelete,
}: ProjectPanelProps) {
  const t = useT()
  const s = t.studio
  const [projects,      setProjects]      = useState<SavedProjectMeta[]>([])
  const [loading,       setLoading]       = useState(false)
  const [search,        setSearch]        = useState('')
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState<string | null>(null)

  async function fetchProjects() {
    setLoading(true)
    try {
      const { data } = await api.get('/api/projects')
      setProjects(data.data ?? [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchProjects() }, [])

  // Re-fetch list after a successful save (projectId just set) or on new project
  useEffect(() => { if (projectId) fetchProjects() }, [projectId])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await onDelete(id)
      setProjects(prev => prev.filter(p => p._id !== id))
    } catch {}
    finally { setDeletingId(null); setDeletePending(null) }
  }

  const filtered = projects.filter(p =>
    !search.trim() || p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgBase }}>

      {/* ── Aktif Proje ─────────────────────────────────────────────────── */}
      <section style={{ padding: '12px 10px 10px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <Label>{s.current}</Label>

        {/* Proje adı */}
        <input
          value={projectName}
          onChange={e => onNameChange(e.target.value)}
          onBlur={() => { if (!projectName.trim()) onNameChange(s.untitled) }}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.bgSubtle, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '6px 8px',
            fontSize: 12, fontWeight: 600, color: C.text1,
            outline: 'none', marginBottom: 8,
          }}
          maxLength={120}
          placeholder={s.untitled}
        />

        {/* Kaydet */}
        <button
          lang="en"
          onClick={onSave}
          disabled={saving}
          title="Save (Ctrl+S)"
          style={{
            width: '100%', padding: '7px 0', borderRadius: 6, marginBottom: 6,
            background: isDirty ? C.accent : C.bgSubtle,
            color:      isDirty ? 'var(--accent-on, #000)' : C.text2,
            border:     `1px solid ${isDirty ? C.accent : C.border}`,
            cursor:     saving ? 'wait' : 'pointer',
            fontSize: 11, fontWeight: isDirty ? 700 : 500,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            boxShadow: isDirty ? `0 0 12px ${C.accent}30` : 'none',
            opacity: saving ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {saving ? s.saving
            : saveLabel?.includes('✓') ? `✓ ${s.saved}`
            : saveLabel?.includes('✗') ? `✗ ${s.failed}`
            : isDirty
              ? (projectId ? `● ${s.saveChanges}` : `● ${s.saveProject}`)
              : (projectId ? s.saved : s.saveProject)}
        </button>

        {/* Paylaş */}
        {projectId && (
          <button
            onClick={onShare}
            disabled={sharing}
            style={{
              width: '100%', padding: '6px 0', borderRadius: 6,
              background: shareToken ? `${C.success}15` : C.bgSubtle,
              color:      shareToken ? C.success : C.text2,
              border: `1px solid ${shareToken ? C.success + '50' : C.border}`,
              cursor: sharing ? 'wait' : 'pointer',
              fontSize: 11, fontWeight: 600,
              opacity: sharing ? 0.6 : 1,
            }}
          >
            {copied ? s.linkCopied : shareToken ? s.shareLink : s.share}
          </button>
        )}
      </section>

      {/* ── Yeni Proje ──────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <button
          onClick={onNew}
          style={{
            width: '100%', padding: '6px 0', borderRadius: 6,
            background: C.bgSubtle, color: C.text2,
            border: `1px solid ${C.border}`,
            cursor: 'pointer', fontSize: 11,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
          onMouseLeave={e => (e.currentTarget.style.background = C.bgSubtle)}
        >
          {s.newProject}
        </button>
      </div>

      {/* ── Saved Projects list ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{
          padding: '8px 10px 4px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Label style={{ flex: 1, marginBottom: 0 }}>
            {s.saved_projects}
            {projects.length > 0 && (
              <span style={{ marginLeft: 5, fontWeight: 500, opacity: 0.6 }}>
                ({projects.length})
              </span>
            )}
          </Label>
          <button
            onClick={fetchProjects}
            title="Reload"
            style={{
              background: 'none', border: 'none', color: C.text3,
              cursor: 'pointer', fontSize: 12, padding: '0 2px',
              lineHeight: 1,
            }}
          >↻</button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 10px 6px', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={s.searchProjects}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: C.bgSubtle, border: `1px solid ${C.border}`,
              borderRadius: 5, padding: '4px 7px',
              fontSize: 11, color: C.text1, outline: 'none',
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', padding: '20px 0' }}>
              {s.loading}
            </p>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', padding: '20px 12px' }}>
              {projects.length === 0 ? s.noSavedYet : s.noMatches}
            </p>
          ) : filtered.map(p => (
            <ProjectItem
              key={p._id}
              project={p}
              isActive={p._id === projectId}
              isDeletePending={deletePending === p._id}
              isDeleting={deletingId === p._id}
              onLoad={() => onLoad(p)}
              onDeleteRequest={() => setDeletePending(p._id)}
              onDeleteCancel={() => setDeletePending(null)}
              onDeleteConfirm={() => handleDelete(p._id)}
              deleteLabel={s.deleteProject}
              cancelLabel={t.common.cancel}
              deleteConfirmLabel={t.common.delete}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Proje satırı ─────────────────────────────────────────────────────────────
function ProjectItem({
  project, isActive, isDeletePending, isDeleting,
  onLoad, onDeleteRequest, onDeleteCancel, onDeleteConfirm,
  deleteLabel, cancelLabel, deleteConfirmLabel,
}: {
  project:            SavedProjectMeta
  isActive:           boolean
  isDeletePending:    boolean
  isDeleting:         boolean
  onLoad:             () => void
  onDeleteRequest:    () => void
  onDeleteCancel:     () => void
  onDeleteConfirm:    () => void
  deleteLabel:        string
  cancelLabel:        string
  deleteConfirmLabel: string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false) }}
      style={{
        borderLeft: isActive ? `2px solid ${C.accent}` : '2px solid transparent',
        background: isActive ? `${C.accent}12` : hovered ? C.bgHover : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Main row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '7px 10px 7px 8px', gap: 4,
      }}>
        <div
          onClick={onLoad}
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
        >
          <p style={{
            fontSize: 11, fontWeight: isActive ? 600 : 400,
            color: isActive ? C.accentBright : C.text1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}>
            {project.isPublic && <span style={{ fontSize: 9, marginRight: 3, opacity: 0.7 }}>🔗</span>}
            {project.name}
          </p>
          <p style={{ fontSize: 9, color: C.text3, lineHeight: 1.4 }}>
            {relativeTime(project.updatedAt)}
            {project.trackCount > 0 && (
              <span style={{ marginLeft: 5, opacity: 0.7 }}>
                · {project.trackCount} track{project.trackCount !== 1 ? 's' : ''}
              </span>
            )}
            {project.bpm && project.bpm !== 120 && (
              <span style={{ marginLeft: 5, opacity: 0.7 }}>· {project.bpm} BPM</span>
            )}
          </p>
        </div>

        {/* Delete trigger button */}
        {!isDeletePending && (hovered || isActive) && (
          <button
            onClick={e => { e.stopPropagation(); onDeleteRequest() }}
            title="Delete project"
            style={{
              flexShrink: 0,
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.text3, fontSize: 13, padding: '2px 4px',
              borderRadius: 3, lineHeight: 1,
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.error)}
            onMouseLeave={e => (e.currentTarget.style.color = C.text3)}
          >×</button>
        )}
      </div>

      {/* Inline delete confirmation */}
      {isDeletePending && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px 7px',
          background: `${C.error}0d`,
          borderTop: `1px solid ${C.error}30`,
        }}>
          <span style={{ fontSize: 10, color: C.error, flex: 1 }}>
            {deleteLabel}
          </span>
          <button
            onClick={onDeleteCancel}
            style={smallConfirmBtn(C.border, C.text2)}
          >{cancelLabel}</button>
          <button
            onClick={onDeleteConfirm}
            disabled={isDeleting}
            style={smallConfirmBtn(C.error, C.error)}
          >
            {isDeleting ? '…' : deleteConfirmLabel}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: C.text3, marginBottom: 8,
      ...style,
    }}>
      {children}
    </p>
  )
}

function smallConfirmBtn(borderColor: string, color: string): React.CSSProperties {
  return {
    fontSize: 10, padding: '3px 8px', borderRadius: 4,
    background: 'none', border: `1px solid ${borderColor}`,
    color, cursor: 'pointer',
  }
}

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  <  1) return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  <  7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}
