import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

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

interface Collection {
  _id: string;
  name: string;
  items: { refId: string; refModel: string; addedAt: string }[];
}

type FilterTab = "all" | "favorites" | "generations" | "uploads";

function formatDuration(seconds?: number): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [newColName, setNewColName] = useState("");
  const [colLoading, setColLoading] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PAGE_LIMIT = 20;

  async function fetchItems(tab: FilterTab, nextPage: number, append = false) {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: nextPage, limit: PAGE_LIMIT };
      if (tab === "favorites") params.favorites = "true";
      if (tab === "generations") params.type = "generation";
      if (tab === "uploads") params.type = "upload";

      const { data } = await api.get("/api/library", { params });
      const incoming: LibraryItem[] = data.items ?? data.data?.items ?? [];
      const totalCount: number = data.total ?? data.data?.total ?? 0;

      setItems(prev => (append ? [...prev, ...incoming] : incoming));
      setTotal(totalCount);
    } catch {
      setError("Liste yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCollections() {
    try {
      const { data } = await api.get("/api/collections");
      setCollections(data.data ?? data ?? []);
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    setPage(1);
    setItems([]);
    fetchItems(activeTab, 1, false);
  }, [activeTab]);

  useEffect(() => {
    fetchCollections();
  }, []);

  async function handleFavoriteToggle(item: LibraryItem) {
    try {
      await api.patch(`/api/library/${item._type}/${item._id}/favorite`);
      setItems(prev =>
        prev.map(i =>
          i._id === item._id ? { ...i, isFavorited: !i.isFavorited } : i
        )
      );
    } catch {
      // silently ignore
    }
  }

  async function handleDelete(item: LibraryItem) {
    if (!confirm("Bu öğeyi silmek istediğinizden emin misiniz?")) return;
    try {
      await api.delete(`/api/library/${item._type}/${item._id}`);
      setItems(prev => prev.filter(i => i._id !== item._id));
      setTotal(prev => prev - 1);
    } catch {
      alert("Silinemedi.");
    }
  }

  async function handleLoadMore() {
    const next = page + 1;
    setPage(next);
    await fetchItems(activeTab, next, true);
  }

  async function handleCreateCollection() {
    const name = newColName.trim();
    if (!name) return;
    setColLoading(true);
    try {
      const { data } = await api.post("/api/collections", { name });
      setCollections(prev => [...prev, data.data ?? data]);
      setNewColName("");
    } catch {
      alert("Koleksiyon oluşturulamadı.");
    } finally {
      setColLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    setUploadError(null);
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      await api.post("/api/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Refresh list
      setPage(1);
      await fetchItems(activeTab, 1, false);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? "Yükleme başarısız.";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "favorites", label: "Favorites" },
    { key: "generations", label: "Generations" },
    { key: "uploads", label: "Uploads" },
  ];

  const hasMore = items.length < total;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-6">Library</h1>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Filter tabs */}
          <div className="flex gap-1 mb-5 border-b border-gray-800 pb-0">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                  activeTab === t.key
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Upload area */}
          <div className="mb-5 bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-400 font-medium">Upload audio:</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3,.ogg"
              onChange={handleFileChange}
              className="text-sm text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600"
            />
            {uploadFile && (
              <span className="text-xs text-gray-400">{uploadFile.name}</span>
            )}
            <button
              onClick={handleUpload}
              disabled={!uploadFile || uploading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
            {uploadError && (
              <span className="text-xs text-red-400">{uploadError}</span>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}

          {/* Items list */}
          {loading && items.length === 0 ? (
            <div className="text-gray-500 py-16 text-center">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-gray-500 py-16 text-center">No items found.</div>
          ) : (
            <ul className="space-y-2">
              {items.map(item => (
                <LibraryItemCard
                  key={item._id}
                  item={item}
                  onFavoriteToggle={handleFavoriteToggle}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="mt-5 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-5 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded text-sm font-medium transition-colors"
              >
                {loading ? "Loading..." : `Load More (${items.length}/${total})`}
              </button>
            </div>
          )}
        </div>

        {/* Right panel — Collections */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-base font-semibold mb-3 text-gray-100">Collections</h2>

            {/* Create collection */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateCollection()}
                placeholder="New collection name..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleCreateCollection}
                disabled={!newColName.trim() || colLoading}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
              >
                +
              </button>
            </div>

            {/* Collection list */}
            {collections.length === 0 ? (
              <p className="text-gray-500 text-sm">No collections yet.</p>
            ) : (
              <ul className="space-y-2">
                {collections.map(col => (
                  <li
                    key={col._id}
                    className="flex items-center justify-between bg-gray-800 rounded px-3 py-2"
                  >
                    <span className="text-sm text-gray-200 truncate">{col.name}</span>
                    <span className="text-xs text-gray-500 ml-2 shrink-0">
                      {col.items?.length ?? 0} items
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface LibraryItemCardProps {
  item: LibraryItem;
  onFavoriteToggle: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
}

function LibraryItemCard({ item, onFavoriteToggle, onDelete }: LibraryItemCardProps) {
  const label =
    item.originalName ??
    (item.prompt ? item.prompt.slice(0, 60) + (item.prompt.length > 60 ? "…" : "") : "Untitled");

  const statusColor: Record<string, string> = {
    done: "bg-green-700 text-green-100",
    failed: "bg-red-800 text-red-100",
    processing: "bg-yellow-700 text-yellow-100",
    pending: "bg-gray-700 text-gray-200",
  };

  return (
    <li className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 hover:border-gray-700 transition-colors">
      {/* Type badge */}
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${
          item._type === "generation"
            ? "bg-indigo-800 text-indigo-200"
            : "bg-teal-800 text-teal-200"
        }`}
      >
        {item._type === "generation" ? "GEN" : "UP"}
      </span>

      {/* Name / prompt */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-100 truncate">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{formatDate(item.createdAt)}</p>
      </div>

      {/* Duration */}
      {item.duration != null && (
        <span className="text-xs text-gray-400 shrink-0 w-10 text-right">
          {formatDuration(item.duration)}
        </span>
      )}

      {/* Status badge */}
      {item.status && (
        <span
          className={`text-xs px-2 py-0.5 rounded shrink-0 ${
            statusColor[item.status] ?? "bg-gray-700 text-gray-300"
          }`}
        >
          {item.status}
        </span>
      )}

      {/* Favorite */}
      <button
        onClick={() => onFavoriteToggle(item)}
        className={`shrink-0 text-lg leading-none transition-colors ${
          item.isFavorited ? "text-pink-400" : "text-gray-600 hover:text-pink-400"
        }`}
        title={item.isFavorited ? "Remove from favorites" : "Add to favorites"}
      >
        {item.isFavorited ? "♥" : "♡"}
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(item)}
        className="shrink-0 text-gray-600 hover:text-red-400 transition-colors text-sm"
        title="Delete"
      >
        ✕
      </button>
    </li>
  );
}
