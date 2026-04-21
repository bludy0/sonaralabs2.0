import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { DAWLayout, useDAWStore } from "@sonaralabs/daw-studio";
import { formatDuration } from "../lib/format";

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
  shareToken?: string;
}

type LibraryFilter = "all" | "generations" | "uploads";


export default function StudioPage() {
  const navigate = useNavigate();
  const { token: shareToken_ } = useParams<{ token?: string }>();
  const isReadOnly = Boolean(shareToken_);    // /studio/share/:token → read-only

  // DAW store
  const getSaveable    = useDAWStore(s => s.getSaveable);
  const loadTracks     = useDAWStore(s => s.loadTracks);
  const addAudioTrack  = useDAWStore(s => s.addAudioTrack);
  const addClip        = useDAWStore(s => s.addClip);
  const tracks         = useDAWStore(s => s.tracks);
  const setBPM         = useDAWStore(s => s.setBPM);
  const setLoop        = useDAWStore(s => s.setLoop);
  const reset          = useDAWStore(s => s.reset);

  // Library sidebar state
  const [items, setItems]           = useState<LibraryItem[]>([]);
  const [loadingLib, setLoadingLib] = useState(false);
  const [filter, setFilter]         = useState<LibraryFilter>("all");
  const [search, setSearch]         = useState("");
  const [addedIds, setAddedIds]     = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Project save/load state
  const [projectName, setProjectName]   = useState("Untitled Project");
  const [projectId, setProjectId]       = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [saveLabel, setSaveLabel]       = useState<string | null>(null);
  const [projects, setProjects]         = useState<SavedProjectMeta[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [loadingProjects, setLoadingProjects]     = useState(false);
  const [shareToken, setShareToken]     = useState<string | null>(null);
  const [sharing, setSharing]           = useState(false);
  const [copied, setCopied]             = useState(false);
  const projectPickerRef = useRef<HTMLDivElement>(null);

  const [decodingIds, setDecodingIds] = useState<Set<string>>(new Set());

  // ── Mount: sessionStorage preload OR share token load ────────────────────
  useEffect(() => {
    reset();

    if (shareToken_) {
      // Read-only share view — fetch project from public endpoint
      api.get(`/api/projects/share/${shareToken_}`)
        .then(({ data }) => {
          const proj = data.data;
          if (proj) {
            reset();
            if (proj.bpm)      setBPM(proj.bpm);
            if (proj.loopStart != null && proj.loopEnd != null) setLoop(proj.loopStart, proj.loopEnd);
            if (proj.tracks?.length) loadTracks(proj.tracks);
            setProjectName(proj.name);
          }
        })
        .catch(() => { /* project not found / private */ });
      return; // read-only: skip library load and sessionStorage
    }

    // Normal mode: sessionStorage preload
    const raw = sessionStorage.getItem("studio:preload");
    if (raw) {
      try {
        const preload = JSON.parse(raw) as { name: string; audioUrl: string }[];
        preload.forEach(t => addToDAW({ _id: t.audioUrl, _type: "upload", originalName: t.name, audioUrl: t.audioUrl, isFavorited: false, createdAt: "" }));
      } catch { /* ignore */ }
      sessionStorage.removeItem("studio:preload");
    }

    fetchLibrary();

    function handleClickOutside(e: MouseEvent) {
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node)) {
        setShowProjectPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [shareToken_]);

  // ── Library ───────────────────────────────────────────────────────────────
  async function fetchLibrary() {
    setLoadingLib(true);
    try {
      const { data } = await api.get("/api/library", { params: { page: 1, limit: 100 } });
      const all: LibraryItem[] = data.items ?? data.data?.items ?? [];
      setItems(all.filter(i => i.audioUrl && (!i.status || i.status === "done")));
    } catch { /* silently ignore */ }
    finally { setLoadingLib(false); }
  }

  async function addToDAW(item: LibraryItem) {
    if (!item.audioUrl || addedIds.has(item._id) || decodingIds.has(item._id)) return;
    const name = item.originalName ?? (item.prompt?.slice(0, 40) ?? "Track");
    setDecodingIds(prev => new Set(prev).add(item._id));
    try {
      // Decode audio → add as new track + clip
      const ctx = new AudioContext();
      const resp = await fetch(item.audioUrl, { credentials: "include" });
      const ab   = await resp.arrayBuffer();
      const buf  = await ctx.decodeAudioData(ab);
      // New track is added first, then we get its id from store
      addAudioTrack();
      const allTracks = useDAWStore.getState().tracks;
      const trackId   = allTracks[allTracks.length - 1]?.id;
      if (trackId) {
        // Rename the track to the item name
        useDAWStore.getState().updateTrack(trackId, { name });
        addClip(trackId, {
          name,
          startTime: 0,
          duration:  buf.duration,
          trimStart: 0,
          trimEnd:   0,
          buffer:    buf,
          url:       item.audioUrl,
        });
      }
      setAddedIds(prev => new Set(prev).add(item._id));
    } catch {
      /* silently ignore decode errors */
    } finally {
      setDecodingIds(prev => { const s = new Set(prev); s.delete(item._id); return s; });
    }
  }

  // ── Project save ──────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveLabel(null);
    try {
      // Strip AudioBuffer objects before serializing (not JSON-serializable)
      const rawTracks = getSaveable();
      const saveTracks = rawTracks.map(t => t.type === 'audio'
        ? { ...t, clips: t.clips.map(c => ({ ...c, buffer: null })) }
        : t
      );
      const snapshot = { name: projectName, tracks: saveTracks };
      let res;
      if (projectId) {
        res = await api.put(`/api/projects/${projectId}`, snapshot);
      } else {
        res = await api.post("/api/projects", snapshot);
        setProjectId(res.data.data._id);
        setShareToken(res.data.data.shareToken ?? null);
      }
      setSaveLabel("Saved ✓");
      setTimeout(() => setSaveLabel(null), 2000);
    } catch {
      setSaveLabel("Save failed ✗");
      setTimeout(() => setSaveLabel(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  // ── Project load picker ───────────────────────────────────────────────────
  async function handleOpenPicker() {
    setShowProjectPicker(prev => !prev);
    if (!showProjectPicker) {
      setLoadingProjects(true);
      try {
        const { data } = await api.get("/api/projects");
        setProjects(data.data ?? []);
      } catch { /* ignore */ }
      finally { setLoadingProjects(false); }
    }
  }

  async function handleLoadProject(meta: SavedProjectMeta) {
    try {
      const { data } = await api.get(`/api/projects/${meta._id}`);
      const proj = data.data;
      reset();
      if (proj.bpm)      setBPM(proj.bpm);
      if (proj.loopStart != null && proj.loopEnd != null) setLoop(proj.loopStart, proj.loopEnd);
      if (proj.tracks?.length) loadTracks(proj.tracks);
      setProjectName(proj.name);
      setProjectId(proj._id);
      setShareToken(proj.shareToken ?? null);
      setAddedIds(new Set());
      setShowProjectPicker(false);
    } catch { /* ignore */ }
  }

  // ── Share link ────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!projectId) return;
    setSharing(true);
    try {
      const { data } = await api.post(`/api/projects/${projectId}/share`);
      const token = data.data?.shareToken ?? null;
      setShareToken(token);
      if (token) {
        const url = `${window.location.origin}/studio/share/${token}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch { /* ignore */ }
    finally { setSharing(false); }
  }

  // ── Filtered sidebar items ────────────────────────────────────────────────
  const filteredItems = items.filter(item => {
    if (filter === "generations" && item._type !== "generation") return false;
    if (filter === "uploads"     && item._type !== "upload")     return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const label = (item.originalName ?? item.prompt ?? "").toLowerCase();
      if (!label.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-gray-200 text-sm transition-colors shrink-0"
          title="Back"
        >
          ←
        </button>

        {/* Editable project name (read-only in share view) */}
        {isReadOnly ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-semibold text-gray-200 truncate max-w-xs">{projectName}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/40 shrink-0">Read-only</span>
          </div>
        ) : (
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            onBlur={() => { if (!projectName.trim()) setProjectName("Untitled Project"); }}
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-gray-200 focus:outline-none border-b border-transparent focus:border-gray-600 transition-colors max-w-xs"
            maxLength={120}
            title="Project name"
          />
        )}

        {/* Save label */}
        {saveLabel && (
          <span className={`text-xs shrink-0 ${saveLabel.includes("✓") ? "text-green-400" : "text-red-400"}`}>
            {saveLabel}
          </span>
        )}

        {/* Open project picker — hidden in read-only */}
        {!isReadOnly && <div className="relative" ref={projectPickerRef}>
          <button
            onClick={handleOpenPicker}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-gray-700 transition-colors shrink-0"
            title="Open project"
          >
            Open ▾
          </button>

          {showProjectPicker && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <p className="text-xs text-gray-400 px-3 pt-2.5 pb-1 font-semibold uppercase tracking-wider">Saved Projects</p>
              {loadingProjects ? (
                <p className="text-xs text-gray-500 px-3 py-4 text-center">Loading…</p>
              ) : projects.length === 0 ? (
                <p className="text-xs text-gray-500 px-3 py-4 text-center">No saved projects</p>
              ) : (
                <ul className="max-h-64 overflow-y-auto py-1">
                  {projects.map(p => (
                    <li key={p._id}>
                      <button
                        onClick={() => handleLoadProject(p)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors flex items-center gap-2"
                      >
                        <span className="flex-1 text-sm text-gray-200 truncate">{p.name}</span>
                        {p.isPublic && <span className="text-xs text-indigo-400 shrink-0">shared</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>}

        {/* Save button — hidden in read-only */}
        {!isReadOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-white font-medium transition-colors shrink-0"
          >
            {saving ? "Saving…" : projectId ? "Save" : "Save Project"}
          </button>
        )}

        {/* Share button (only after saving, hidden in read-only) */}
        {!isReadOnly && projectId && (
          <button
            onClick={handleShare}
            disabled={sharing}
            title={shareToken ? "Copy share link" : "Generate share link"}
            className={`text-xs px-2.5 py-1 rounded border transition-colors shrink-0 disabled:opacity-50 ${
              shareToken
                ? "border-green-600 text-green-400 hover:bg-green-900/30"
                : "border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
          >
            {copied ? "Copied!" : shareToken ? "🔗 Shared" : "Share"}
          </button>
        )}

        {/* Library toggle — hidden in read-only */}
        {!isReadOnly && (
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-gray-700 transition-colors shrink-0"
          >
            {sidebarOpen ? "Hide Lib" : "Library"}
          </button>
        )}
      </header>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Library sidebar ────────────────────────────────────────────────── */}
        {sidebarOpen && (
          <aside className="w-60 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-800 space-y-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Library</h2>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-1">
                {(["all", "generations", "uploads"] as LibraryFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 text-xs py-1 rounded transition-colors capitalize ${
                      filter === f ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {f === "all" ? "All" : f === "generations" ? "Gen" : "Up"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {loadingLib ? (
                <p className="text-xs text-gray-500 text-center py-8">Loading…</p>
              ) : filteredItems.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-8">No items</p>
              ) : (
                filteredItems.map(item => (
                  <LibrarySidebarItem
                    key={item._id}
                    item={item}
                    added={addedIds.has(item._id)}
                    decoding={decodingIds.has(item._id)}
                    onAdd={addToDAW}
                  />
                ))
              )}
            </div>

            <div className="p-2 border-t border-gray-800">
              <p className="text-xs text-gray-600 text-center">
                {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
              </p>
            </div>
          </aside>
        )}

        {/* ── DAW area ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          <DAWLayout />
        </div>
      </div>
    </div>
  );
}

// ── Sidebar item ──────────────────────────────────────────────────────────────
interface LibrarySidebarItemProps {
  item: LibraryItem;
  added: boolean;
  decoding: boolean;
  onAdd: (item: LibraryItem) => void;
}

function LibrarySidebarItem({ item, added, decoding, onAdd }: LibrarySidebarItemProps) {
  const label =
    item.originalName ??
    (item.prompt ? item.prompt.slice(0, 36) + (item.prompt.length > 36 ? "…" : "") : "Untitled");

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 group transition-colors">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          item._type === "generation" ? "bg-indigo-500" : "bg-teal-500"
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-200 truncate leading-tight">{label}</p>
        {item.duration != null && (
          <p className="text-xs text-gray-600">{formatDuration(item.duration)}</p>
        )}
      </div>
      <button
        onClick={() => onAdd(item)}
        disabled={added || decoding}
        className={`shrink-0 text-xs px-1.5 py-0.5 rounded transition-colors ${
          added
            ? "text-green-500 cursor-default"
            : decoding
            ? "text-yellow-500 cursor-wait opacity-100"
            : "text-gray-500 hover:text-indigo-400 hover:bg-gray-700 opacity-0 group-hover:opacity-100"
        }`}
        title={added ? "Already added" : decoding ? "Decoding…" : "Add to DAW"}
      >
        {added ? "✓" : decoding ? "…" : "+"}
      </button>
    </div>
  );
}
