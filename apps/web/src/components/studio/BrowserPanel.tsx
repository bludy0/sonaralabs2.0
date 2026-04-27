import { useEffect, useState, useCallback } from 'react'
import { api } from '../../lib/api'
import { useDAWStore } from '@sonaralabs/daw-studio'
import { formatDuration } from '../../lib/format'
import { C } from '../../theme'

// ── Design tokens (DAW tema ile uyumlu) ─────────────────────────────────────

interface LibraryItem {
  _id:           string
  _type:         'generation' | 'upload'
  originalName?: string
  prompt?:       string
  audioUrl?:     string
  duration?:     number
  isFavorited:   boolean
  createdAt:     string
  status?:       string
}

type Filter = 'all' | 'generations' | 'uploads'

export function BrowserPanel() {
  const addAudioTrack = useDAWStore(s => s.addAudioTrack)
  const addClip       = useDAWStore(s => s.addClip)

  const [items,       setItems]       = useState<LibraryItem[]>([])
  const [loading,     setLoading]     = useState(false)
  const [filter,      setFilter]      = useState<Filter>('all')
  const [search,      setSearch]      = useState('')
  const [addedIds,    setAddedIds]    = useState<Set<string>>(new Set())
  const [decodingIds, setDecodingIds] = useState<Set<string>>(new Set())

  const fetchLibrary = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/library', { params: { page: 1, limit: 100 } })
      const all: LibraryItem[] = data.items ?? data.data?.items ?? []
      setItems(all.filter(i => i.audioUrl && (!i.status || i.status === 'done')))
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLibrary() }, [fetchLibrary])

  async function addToDAW(item: LibraryItem) {
    if (!item.audioUrl || addedIds.has(item._id) || decodingIds.has(item._id)) return
    const name = item.originalName ?? item.prompt?.slice(0, 40) ?? 'Track'
    setDecodingIds(prev => new Set(prev).add(item._id))
    try {
      const ctx  = new AudioContext()
      const resp = await fetch(item.audioUrl, { credentials: 'include' })
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
          buffer: buf, url: item.audioUrl,
        })
      }
      setAddedIds(prev => new Set(prev).add(item._id))
    } catch (err) {
      console.error('BrowserPanel: addToDAW failed', err)
    } finally {
      setDecodingIds(prev => { const s = new Set(prev); s.delete(item._id); return s })
    }
  }

  const filtered = items.filter(item => {
    if (filter === 'generations' && item._type !== 'generation') return false
    if (filter === 'uploads'     && item._type !== 'upload')     return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(item.originalName ?? item.prompt ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgBase }}>

      {/* ── Arama + filtre ──────────────────────────────────────────────── */}
      <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.bgSubtle, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '5px 8px',
            fontSize: 11, color: C.text1, outline: 'none',
            marginBottom: 6,
          }}
        />
        <div style={{ display: 'flex', gap: 3 }}>
          {(['all', 'generations', 'uploads'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1, fontSize: 9, padding: '3px 0', borderRadius: 4,
                background: filter === f ? `${C.accent}20` : 'transparent',
                color:      filter === f ? C.accent : C.text3,
                border: `1px solid ${filter === f ? C.accent + '60' : 'transparent'}`,
                cursor: 'pointer',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {f === 'all' ? 'All' : f === 'generations' ? 'Gen' : 'Up'}
            </button>
          ))}
          <button
            onClick={fetchLibrary}
            title="Reload"
            style={{
              width: 24, fontSize: 12, borderRadius: 4,
              background: 'transparent', color: C.text3,
              border: 'none', cursor: 'pointer',
            }}
          >↻</button>
        </div>
      </div>

      {/* ── Liste ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', padding: '24px 0' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', padding: '24px 12px' }}>
            {items.length === 0 ? 'Library is empty' : 'No matches'}
          </p>
        ) : filtered.map(item => (
          <BrowserItem
            key={item._id}
            item={item}
            added={addedIds.has(item._id)}
            decoding={decodingIds.has(item._id)}
            onAdd={addToDAW}
          />
        ))}
      </div>

      {/* ── Alt durum ───────────────────────────────────────────────────── */}
      <div style={{ padding: '5px 10px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: C.text3 }}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}

// ── Tek satır öğe ─────────────────────────────────────────────────────────────
function BrowserItem({
  item, added, decoding, onAdd,
}: {
  item: LibraryItem; added: boolean; decoding: boolean
  onAdd: (item: LibraryItem) => void
}) {
  const [hovered, setHovered] = useState(false)
  const label = item.originalName
    ?? (item.prompt ? item.prompt.slice(0, 34) + (item.prompt.length > 34 ? '…' : '') : 'Untitled')

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 10px',
        background: hovered ? C.bgHover : 'transparent',
        cursor: 'default', transition: 'background 0.1s',
      }}
    >
      {/* Tip renk noktası */}
      <span style={{
        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
        background: item._type === 'generation' ? C.accent : '#56b6c2',
      }} />

      {/* Etiket */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 11, color: C.text1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}>
          {label}
        </p>
        {item.duration != null && (
          <p style={{ fontSize: 9, color: C.text3 }}>{formatDuration(item.duration)}</p>
        )}
      </div>

      {/* Ekle butonu */}
      <button
        onClick={() => onAdd(item)}
        disabled={added || decoding}
        title={added ? 'Added' : decoding ? 'Decoding…' : 'Add to DAW'}
        style={{
          flexShrink: 0, fontSize: 14, lineHeight: 1,
          background: 'none', border: 'none',
          cursor: added ? 'default' : 'pointer',
          color: added ? C.success : decoding ? C.warning : C.accent,
          opacity: hovered || added || decoding ? 1 : 0,
          transition: 'opacity 0.15s',
          padding: '2px 4px',
        }}
      >
        {added ? '✓' : decoding ? '…' : '+'}
      </button>
    </div>
  )
}
