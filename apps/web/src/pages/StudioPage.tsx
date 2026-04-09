import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { DAWStudio } from "@sonaralabs/daw-studio";
import type { ExportedTrack } from "@sonaralabs/daw-studio";

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

type LibraryFilter = "all" | "generations" | "uploads";

function formatDuration(seconds?: number): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StudioPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const [initialTracks, setInitialTracks] = useState<{ name: string; audioUrl: string }[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetchLibrary();
  }, []);

  async function fetchLibrary() {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: 1, limit: 100 };
      const { data } = await api.get("/api/library", { params });
      const all: LibraryItem[] = data.items ?? data.data?.items ?? [];
      // Only show items that have an audioUrl (ready to use)
      setItems(all.filter(i => i.audioUrl && (!i.status || i.status === "done")));
    } catch {
      // silently ignore — DAW still usable without library items
    } finally {
      setLoading(false);
    }
  }

  function addToDAW(item: LibraryItem) {
    if (!item.audioUrl || addedIds.has(item._id)) return;
    const name =
      item.originalName ??
      (item.prompt ? item.prompt.slice(0, 40) : "Track");
    setInitialTracks(prev => [...prev, { name, audioUrl: item.audioUrl! }]);
    setAddedIds(prev => new Set(prev).add(item._id));
  }

  async function handleSave(tracks: ExportedTrack[]) {
    if (!tracks.length) return;
    // Export the first track as an upload back to the library
    try {
      // Navigate to library after save
      navigate("/library");
    } catch {
      // ignore
    }
  }

  const filteredItems = items.filter(item => {
    if (filter === "generations" && item._type !== "generation") return false;
    if (filter === "uploads" && item._type !== "upload") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const label = (item.originalName ?? item.prompt ?? "").toLowerCase();
      if (!label.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
          title="Back"
        >
          ← Back
        </button>
        <span className="text-sm font-semibold text-gray-200 flex-1">DAW Studio</span>
        <button
          onClick={() => setSidebarOpen(prev => !prev)}
          className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-gray-700 transition-colors"
        >
          {sidebarOpen ? "Hide Library" : "Show Library"}
        </button>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Library sidebar ─────────────────────────────────────────────── */}
        {sidebarOpen && (
          <aside className="w-64 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-800">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Library
              </h2>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              {/* Filter tabs */}
              <div className="flex gap-1 mt-2">
                {(["all", "generations", "uploads"] as LibraryFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 text-xs py-1 rounded transition-colors capitalize ${
                      filter === f
                        ? "bg-indigo-600 text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {f === "all" ? "All" : f === "generations" ? "Gen" : "Up"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {loading ? (
                <p className="text-xs text-gray-500 text-center py-8">Loading...</p>
              ) : filteredItems.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-8">No items</p>
              ) : (
                filteredItems.map(item => (
                  <LibrarySidebarItem
                    key={item._id}
                    item={item}
                    added={addedIds.has(item._id)}
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

        {/* ── DAW area ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          <DAWStudio
            mode="embedded"
            initialTracks={initialTracks}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  );
}

// ── Sidebar item ─────────────────────────────────────────────────────────────
interface LibrarySidebarItemProps {
  item: LibraryItem;
  added: boolean;
  onAdd: (item: LibraryItem) => void;
}

function LibrarySidebarItem({ item, added, onAdd }: LibrarySidebarItemProps) {
  const label =
    item.originalName ??
    (item.prompt ? item.prompt.slice(0, 36) + (item.prompt.length > 36 ? "…" : "") : "Untitled");

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 group transition-colors">
      {/* Type indicator */}
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          item._type === "generation" ? "bg-indigo-500" : "bg-teal-500"
        }`}
      />

      {/* Name + duration */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-200 truncate leading-tight">{label}</p>
        {item.duration != null && (
          <p className="text-xs text-gray-600">{formatDuration(item.duration)}</p>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={() => onAdd(item)}
        disabled={added}
        className={`shrink-0 text-xs px-1.5 py-0.5 rounded transition-colors ${
          added
            ? "text-green-500 cursor-default"
            : "text-gray-500 hover:text-indigo-400 hover:bg-gray-700 opacity-0 group-hover:opacity-100"
        }`}
        title={added ? "Already added" : "Add to DAW"}
      >
        {added ? "✓" : "+"}
      </button>
    </div>
  );
}
