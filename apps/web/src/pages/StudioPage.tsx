import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { DAWLayout, useDAWStore } from "@sonaralabs/daw-studio";
import { formatDuration } from "../lib/format";

// ── Design tokens — mirror the DAW's Studio Dark theme ───────────────────────
const C = {
  bg:       "#111117",
  bgRaised: "#18181f",
  bgSubtle: "#1e1e27",
  border:   "#2a2a38",
  accent:   "#7c6dfa",
  accentDim:"#3a3470",
  text1:    "#eeeef6",
  text2:    "#a0a0b8",
  text3:    "#606078",
  success:  "#4ade80",
  warning:  "#facc15",
  danger:   "#f87171",
} as const;

interface LibraryItem {
  _id: string;
  _type: "generation" | "upload";
  originalName?: string;
  prompt?: string;
  audioUrl?: string;
  duration?: number;
  isFavorited: boolean;
  createdAt: string;
  status?: string;
}

interface SavedProjectMeta {
  _id: string;
  name: string;
  updatedAt: string;
  isPublic: boolean;
}

type LibraryFilter = "all" | "generations" | "uploads";

export default function StudioPage() {
  const navigate    = useNavigate();
  const { token: shareToken_ } = useParams<{ token?: string }>();
  const isReadOnly  = Boolean(shareToken_);

  const getSaveable   = useDAWStore(s => s.getSaveable);
  const loadTracks    = useDAWStore(s => s.loadTracks);
  const addAudioTrack = useDAWStore(s => s.addAudioTrack);
  const addClip       = useDAWStore(s => s.addClip);
  const setBPM        = useDAWStore(s => s.setBPM);
  const setLoop       = useDAWStore(s => s.setLoop);
  const reset         = useDAWStore(s => s.reset);

  const [items,       setItems]       = useState<LibraryItem[]>([]);
  const [loadingLib,  setLoadingLib]  = useState(false);
  const [filter,      setFilter]      = useState<LibraryFilter>("all");
  const [search,      setSearch]      = useState("");
  const [addedIds,    setAddedIds]    = useState<Set<string>>(new Set());
  const [decodingIds, setDecodingIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [projectName,        setProjectName]        = useState("Untitled Project");
  const [projectId,          setProjectId]          = useState<string | null>(null);
  const [saving,             setSaving]             = useState(false);
  const [saveLabel,          setSaveLabel]          = useState<string | null>(null);
  const [projects,           setProjects]           = useState<SavedProjectMeta[]>([]);
  const [showProjectPicker,  setShowProjectPicker]  = useState(false);
  const [loadingProjects,    setLoadingProjects]    = useState(false);
  const [shareToken,         setShareToken]         = useState<string | null>(null);
  const [sharing,            setSharing]            = useState(false);
  const [copied,             setCopied]             = useState(false);
  const projectPickerRef = useRef<HTMLDivElement>(null);

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    reset();
    if (shareToken_) {
      api.get(`/api/projects/share/${shareToken_}`)
        .then(({ data }) => {
          const p = data.data;
          if (p) {
            if (p.bpm) setBPM(p.bpm);
            if (p.loopStart != null) setLoop(p.loopStart, p.loopEnd);
            if (p.tracks?.length)   loadTracks(p.tracks);
            setProjectName(p.name);
          }
        }).catch(() => {});
      return;
    }

    const raw = sessionStorage.getItem("studio:preload");
    if (raw) {
      try {
        const preload = JSON.parse(raw) as { name: string; audioUrl: string }[];
        preload.forEach(t => addToDAW({
          _id: t.audioUrl, _type: "upload",
          originalName: t.name, audioUrl: t.audioUrl,
          isFavorited: false, createdAt: "",
        }));
      } catch {}
      sessionStorage.removeItem("studio:preload");
    }
    fetchLibrary();

    const onClickOutside = (e: MouseEvent) => {
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node))
        setShowProjectPicker(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [shareToken_]);

  // ── Library ───────────────────────────────────────────────────────────────
  async function fetchLibrary() {
    setLoadingLib(true);
    try {
      const { data } = await api.get("/api/library", { params: { page: 1, limit: 100 } });
      const all: LibraryItem[] = data.items ?? data.data?.items ?? [];
      setItems(all.filter(i => i.audioUrl && (!i.status || i.status === "done")));
    } catch {}
    finally { setLoadingLib(false); }
  }

  async function addToDAW(item: LibraryItem) {
    if (!item.audioUrl || addedIds.has(item._id) || decodingIds.has(item._id)) return;
    const name = item.originalName ?? item.prompt?.slice(0, 40) ?? "Track";
    setDecodingIds(prev => new Set(prev).add(item._id));
    try {
      const ctx  = new AudioContext();
      const resp = await fetch(item.audioUrl, { credentials: "include" });
      const ab   = await resp.arrayBuffer();
      const buf  = await ctx.decodeAudioData(ab);
      addAudioTrack();
      const allTracks = useDAWStore.getState().tracks;
      const trackId   = allTracks[allTracks.length - 1]?.id;
      if (trackId) {
        useDAWStore.getState().updateTrack(trackId, { name });
        addClip(trackId, {
          name, startTime: 0, duration: buf.duration,
          trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0,
          buffer: buf, url: item.audioUrl,
        });
      }
      setAddedIds(prev => new Set(prev).add(item._id));
    } catch {}
    finally {
      setDecodingIds(prev => { const s = new Set(prev); s.delete(item._id); return s; });
    }
  }

  // ── Project save ──────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveLabel(null);
    try {
      const rawTracks  = getSaveable();
      const saveTracks = rawTracks.map(t =>
        t.type === "audio" ? { ...t, clips: t.clips.map(c => ({ ...c, buffer: null })) } : t
      );
      const payload = { name: projectName, tracks: saveTracks };
      let res;
      if (projectId) {
        res = await api.put(`/api/projects/${projectId}`, payload);
      } else {
        res = await api.post("/api/projects", payload);
        setProjectId(res.data.data._id);
        setShareToken(res.data.data.shareToken ?? null);
      }
      setSaveLabel("Saved ✓");
      setTimeout(() => setSaveLabel(null), 2000);
    } catch {
      setSaveLabel("Failed ✗");
      setTimeout(() => setSaveLabel(null), 3000);
    } finally { setSaving(false); }
  }

  // ── Project load ──────────────────────────────────────────────────────────
  async function handleOpenPicker() {
    setShowProjectPicker(v => !v);
    if (!showProjectPicker) {
      setLoadingProjects(true);
      try {
        const { data } = await api.get("/api/projects");
        setProjects(data.data ?? []);
      } catch {}
      finally { setLoadingProjects(false); }
    }
  }

  async function handleLoadProject(meta: SavedProjectMeta) {
    try {
      const { data } = await api.get(`/api/projects/${meta._id}`);
      const p = data.data;
      reset();
      if (p.bpm) setBPM(p.bpm);
      if (p.loopStart != null) setLoop(p.loopStart, p.loopEnd);
      if (p.tracks?.length)   loadTracks(p.tracks);
      setProjectName(p.name);
      setProjectId(p._id);
      setShareToken(p.shareToken ?? null);
      setAddedIds(new Set());
      setShowProjectPicker(false);
    } catch {}
  }

  // ── Share ─────────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!projectId) return;
    setSharing(true);
    try {
      const { data } = await api.post(`/api/projects/${projectId}/share`);
      const tok = data.data?.shareToken ?? null;
      setShareToken(tok);
      if (tok) {
        await navigator.clipboard.writeText(`${location.origin}/studio/share/${tok}`);
        setCopied(true); setTimeout(() => setCopied(false), 2500);
      }
    } catch {}
    finally { setSharing(false); }
  }

  // ── Filtered items ────────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    if (filter === "generations" && item._type !== "generation") return false;
    if (filter === "uploads"     && item._type !== "upload")     return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(item.originalName ?? item.prompt ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: C.bg, color: C.text1,
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
    }}>
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 12px", height: 44, flexShrink: 0,
        background: C.bgRaised,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Back */}
        <button onClick={() => navigate(-1)} style={iconBtnStyle}>
          ←
        </button>

        <div style={{ width: 1, height: 18, background: C.border }} />

        {/* Project name */}
        {isReadOnly ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{projectName}</span>
        ) : (
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            onBlur={() => { if (!projectName.trim()) setProjectName("Untitled Project"); }}
            style={{
              background: "transparent", border: "none",
              fontSize: 13, fontWeight: 600, color: C.text1,
              outline: "none", maxWidth: 200,
            }}
            maxLength={120}
          />
        )}

        {isReadOnly && (
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 10,
            background: C.accentDim, color: C.accent,
            border: `1px solid ${C.accentDim}`,
          }}>Read-only</span>
        )}

        {/* Save label */}
        {saveLabel && (
          <span style={{
            fontSize: 11,
            color: saveLabel.includes("✓") ? C.success : C.danger,
          }}>{saveLabel}</span>
        )}

        <div style={{ flex: 1 }} />

        {/* Open project */}
        {!isReadOnly && (
          <div style={{ position: "relative" }} ref={projectPickerRef}>
            <button onClick={handleOpenPicker} style={smallBtnStyle}>
              Open ▾
            </button>
            {showProjectPicker && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                width: 240, background: C.bgRaised,
                border: `1px solid ${C.border}`,
                borderRadius: 10, boxShadow: "0 16px 40px #00000088",
                zIndex: 100, overflow: "hidden",
              }}>
                <p style={{ fontSize: 10, color: C.text3, padding: "10px 12px 6px", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
                  Saved Projects
                </p>
                {loadingProjects ? (
                  <p style={{ fontSize: 12, color: C.text3, textAlign: "center", padding: "16px 0" }}>Loading…</p>
                ) : projects.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.text3, textAlign: "center", padding: "16px 0" }}>No saved projects</p>
                ) : (
                  <ul style={{ maxHeight: 240, overflowY: "auto", listStyle: "none", margin: 0, padding: "4px 0" }}>
                    {projects.map(p => (
                      <li key={p._id}>
                        <button
                          onClick={() => handleLoadProject(p)}
                          style={{
                            width: "100%", textAlign: "left",
                            padding: "8px 12px", background: "none", border: "none",
                            cursor: "pointer", fontSize: 12, color: C.text1,
                            display: "flex", alignItems: "center", gap: 6,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.bgSubtle)}
                          onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          {p.isPublic && <span style={{ fontSize: 10, color: C.accent }}>shared</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Save */}
        {!isReadOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...smallBtnStyle,
              background: C.accent, color: "#fff",
              border: `1px solid ${C.accent}`,
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : projectId ? "Save" : "Save Project"}
          </button>
        )}

        {/* Share */}
        {!isReadOnly && projectId && (
          <button
            onClick={handleShare}
            disabled={sharing}
            style={{
              ...smallBtnStyle,
              color:   shareToken ? C.success : C.text2,
              border: `1px solid ${shareToken ? C.success + "60" : C.border}`,
              opacity: sharing ? 0.5 : 1,
            }}
          >
            {copied ? "Copied!" : shareToken ? "🔗 Shared" : "Share"}
          </button>
        )}

        <div style={{ width: 1, height: 18, background: C.border }} />

        {/* Library toggle */}
        {!isReadOnly && (
          <button onClick={() => setSidebarOpen(v => !v)} style={iconBtnStyle} title="Toggle library">
            {sidebarOpen ? "⇤" : "⇥"}
          </button>
        )}
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Library sidebar ──────────────────────────────────────────────── */}
        {sidebarOpen && !isReadOnly && (
          <aside style={{
            width: 220, flexShrink: 0,
            display: "flex", flexDirection: "column",
            background: C.bgRaised,
            borderRight: `1px solid ${C.border}`,
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Library
              </p>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: C.bgSubtle, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: "5px 8px",
                  fontSize: 11, color: C.text1,
                  outline: "none", marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 3 }}>
                {(["all", "generations", "uploads"] as LibraryFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      flex: 1, fontSize: 10, padding: "3px 0", borderRadius: 4,
                      background: filter === f ? C.accentDim : "transparent",
                      color:      filter === f ? C.accent    : C.text3,
                      border: `1px solid ${filter === f ? C.accentDim : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    {f === "all" ? "All" : f === "generations" ? "Gen" : "Up"}
                  </button>
                ))}
              </div>
            </div>

            {/* Items */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingLib ? (
                <p style={{ fontSize: 12, color: C.text3, textAlign: "center", padding: "24px 0" }}>Loading…</p>
              ) : filtered.length === 0 ? (
                <p style={{ fontSize: 12, color: C.text3, textAlign: "center", padding: "24px 0" }}>
                  {items.length === 0 ? "No audio in library" : "No matches"}
                </p>
              ) : filtered.map(item => (
                <SidebarItem
                  key={item._id}
                  item={item}
                  added={addedIds.has(item._id)}
                  decoding={decodingIds.has(item._id)}
                  onAdd={addToDAW}
                />
              ))}
            </div>

            <div style={{ padding: "6px 12px", borderTop: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 10, color: C.text3, textAlign: "center" }}>
                {filtered.length} item{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>
          </aside>
        )}

        {/* ── DAW ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <DAWLayout />
        </div>
      </div>
    </div>
  );
}

// ── Sidebar item ──────────────────────────────────────────────────────────────
function SidebarItem({
  item, added, decoding, onAdd,
}: {
  item: LibraryItem; added: boolean; decoding: boolean;
  onAdd: (item: LibraryItem) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const label = item.originalName ?? (item.prompt ? item.prompt.slice(0, 36) + (item.prompt.length > 36 ? "…" : "") : "Untitled");

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 12px",
        background: hovered ? C.bgSubtle : "transparent",
        cursor: "default", transition: "background 0.1s",
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
        background: item._type === "generation" ? "#7c6dfa" : "#2dd4bf",
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: C.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
          {label}
        </p>
        {item.duration != null && (
          <p style={{ fontSize: 10, color: C.text3 }}>{formatDuration(item.duration)}</p>
        )}
      </div>
      <button
        onClick={() => onAdd(item)}
        disabled={added || decoding}
        style={{
          flexShrink: 0, fontSize: 14, lineHeight: 1,
          background: "none", border: "none", cursor: added ? "default" : "pointer",
          color: added ? "#4ade80" : decoding ? "#facc15" : C.accent,
          opacity: hovered || added || decoding ? 1 : 0,
          transition: "opacity 0.15s",
          padding: "2px 4px",
        }}
        title={added ? "Added" : decoding ? "Decoding…" : "Add to DAW"}
      >
        {added ? "✓" : decoding ? "…" : "+"}
      </button>
    </div>
  );
}

// ── Shared button styles ──────────────────────────────────────────────────────
const iconBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: C.text2, fontSize: 14, padding: "4px 6px", borderRadius: 5,
}

const smallBtnStyle: React.CSSProperties = {
  fontSize: 11, padding: "4px 10px", borderRadius: 5,
  background: C.bgSubtle, color: C.text2,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
}
