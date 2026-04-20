import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PublishModal } from "../components/library/PublishModal";
import { LibraryItemCard } from "../components/library/LibraryItemCard";
import type { LibraryItem, Collection, TypeFilter, SortBy, StatusFilter } from "../components/library/LibraryTypes";

export default function LibraryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishItem, setPublishItem] = useState<LibraryItem | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [newColName, setNewColName] = useState("");
  const [colLoading, setColLoading] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PAGE_LIMIT = 20;

  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setSearchQ(val.trim()), 400);
  }

  async function fetchItems(
    type: TypeFilter,
    fav: boolean,
    q: string,
    status: StatusFilter,
    nextPage: number,
    append = false
  ) {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: nextPage, limit: PAGE_LIMIT };
      if (fav) params.favorites = "true";
      if (type !== "all") params.type = type;
      if (q) params.q = q;
      if (status !== "all") params.status = status;

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
    fetchItems(typeFilter, favOnly, searchQ, statusFilter, 1, false);
  }, [typeFilter, favOnly, searchQ, statusFilter]);

  useEffect(() => {
    fetchCollections();
  }, []);

  async function handleFavoriteToggle(item: LibraryItem) {
    setItems(prev => prev.map(i => i._id === item._id ? { ...i, isFavorited: !i.isFavorited } : i));
    try {
      await api.patch(`/api/library/${item._type}/${item._id}/favorite`);
    } catch {
      setItems(prev => prev.map(i => i._id === item._id ? { ...i, isFavorited: item.isFavorited } : i));
    }
  }

  function handleOpenInStudio(item: LibraryItem) {
    if (!item.audioUrl) return;
    const name = item.originalName ?? (item.prompt?.slice(0, 40) ?? "Track");
    sessionStorage.setItem("studio:preload", JSON.stringify([{ name, audioUrl: item.audioUrl }]));
    navigate("/studio");
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
    await fetchItems(typeFilter, favOnly, searchQ, statusFilter, next, true);
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
      setPage(1);
      await fetchItems(typeFilter, favOnly, searchQ, statusFilter, 1, false);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? "Yükleme başarısız.";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }

  const hasMore = items.length < total;

  const sortedItems = [...items]
    .filter(item => typeFilter === "all" || item._type === typeFilter)
    .filter(item => statusFilter === "all" || item.status === statusFilter)
    .sort((a, b) => {
    if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortBy === "longest") return (b.duration ?? 0) - (a.duration ?? 0);
    if (sortBy === "shortest") return (a.duration ?? 0) - (b.duration ?? 0);
    return 0;
  });


  return (
    <div className="min-h-screen p-6" style={{ background: "#0e0e0e", color: "#ffffff" }}>
      {publishItem && (
        <PublishModal
          item={publishItem}
          onClose={() => setPublishItem(null)}
          onPublished={() => { setPublishItem(null); setPage(1); fetchItems(typeFilter, favOnly, searchQ, statusFilter, 1, false); }}
        />
      )}

      {/* Page header */}
      <div className="mb-8">
        <p
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
          style={{ color: "#484848" }}
        >
          SONARALABS / LIBRARY
        </p>
        <h1
          className="text-2xl font-bold uppercase"
          style={{ color: "#ffffff", letterSpacing: "-0.01em" }}
        >
          Library
        </h1>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Search input */}
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-[180px]"
              style={{ background: "#131313" }}
            >
              <span className="material-symbols-outlined text-base shrink-0" style={{ color: "#484848" }}>
                search
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search by name or prompt…"
                className="flex-1 text-sm bg-transparent focus:outline-none"
                style={{ color: "#ffffff" }}
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(""); setSearchQ(""); }}
                  className="shrink-0"
                  style={{ color: "#484848" }}
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </div>

            {/* Type chips */}
            <div className="flex gap-1.5">
              {([ ["all", "All"], ["generation", "Generated"], ["upload", "Uploaded"] ] as [TypeFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className="text-xs px-3 py-1.5 rounded-full font-bold transition-colors"
                  style={
                    typeFilter === key
                      ? { background: "#ffdd73", color: "#624e00" }
                      : { background: "#131313", color: "#484848" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Favorites toggle */}
            <button
              onClick={() => setFavOnly(p => !p)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-bold transition-colors"
              style={
                favOnly
                  ? { background: "rgba(255,115,81,0.15)", color: "#ff7351" }
                  : { background: "#131313", color: "#484848" }
              }
            >
              <span className="material-symbols-outlined text-base">
                {favOnly ? "favorite" : "favorite"}
              </span>
              Favorites
            </button>
          </div>

          {/* Second filter row — sort + status */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Sort chips */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase mr-1" style={{ color: "#484848" }}>
                Sort
              </span>
              {([
                ["newest", "Newest"],
                ["oldest", "Oldest"],
                ["longest", "Longest"],
                ["shortest", "Shortest"],
              ] as [SortBy, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className="text-xs px-2.5 py-1 rounded-full font-bold transition-colors"
                  style={
                    sortBy === key
                      ? { background: "#262626", color: "#ffffff" }
                      : { background: "#131313", color: "#484848" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-4 shrink-0" style={{ background: "#262626" }} />

            {/* Status chips */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase mr-1" style={{ color: "#484848" }}>
                Status
              </span>
              {([
                ["all", "All"],
                ["done", "Done"],
                ["processing", "Processing"],
                ["failed", "Failed"],
              ] as [StatusFilter, string][]).map(([key, label]) => {
                const activeColors: Record<string, { bg: string; text: string }> = {
                  done: { bg: "rgba(110,201,110,0.15)", text: "#6ec96e" },
                  processing: { bg: "rgba(255,221,115,0.15)", text: "#ffdd73" },
                  failed: { bg: "rgba(255,115,81,0.15)", text: "#ff7351" },
                  all: { bg: "#262626", text: "#ffffff" },
                };
                const isActive = statusFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className="text-xs px-2.5 py-1 rounded-full font-bold transition-colors"
                    style={
                      isActive
                        ? { background: activeColors[key].bg, color: activeColors[key].text }
                        : { background: "#131313", color: "#484848" }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload area */}
          <div
            className="mb-6 rounded-lg p-5"
            style={{ background: "#131313" }}
          >
            <p
              className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3"
              style={{ color: "#484848" }}
            >
              Upload Audio
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 cursor-pointer transition-colors"
                style={{ background: "#1f2937" }}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="material-symbols-outlined text-base" style={{ color: "#ababab" }}>
                  upload_file
                </span>
                <span className="text-sm" style={{ color: "#ababab" }}>
                  {uploadFile ? uploadFile.name : "Choose file…"}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.ogg"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                style={{
                  background: "#ffdd73",
                  color: "#624e00",
                  boxShadow: "0px 0px 20px rgba(250,204,21,0.3)",
                }}
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
              {uploadError && (
                <span className="text-xs" style={{ color: "#ff7351" }}>{uploadError}</span>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm mb-4" style={{ color: "#ff7351" }}>{error}</p>
          )}

          {/* Items list */}
          {loading && items.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: "#484848" }}>Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: "#484848" }}>No items found.</div>
          ) : (
            <ul className="space-y-2">
              {sortedItems.map(item => (
                <LibraryItemCard
                  key={item._id}
                  item={item}
                  onFavoriteToggle={handleFavoriteToggle}
                  onDelete={handleDelete}
                  onOpenInStudio={handleOpenInStudio}
                  onPublish={item.audioUrl && item.status === "done" ? () => setPublishItem(item) : undefined}
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
                className="px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                style={{ background: "#1f2937", color: "#ababab" }}
              >
                {loading ? "Loading..." : `Load More (${items.length}/${total})`}
              </button>
            </div>
          )}
        </div>

        {/* Right panel — Collections */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="rounded-lg p-4" style={{ background: "#131313" }}>
            <p
              className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
              style={{ color: "#484848" }}
            >
              Collections
            </p>

            {/* Create collection */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateCollection()}
                placeholder="New collection name..."
                className="flex-1 rounded px-3 py-1.5 text-sm focus:outline-none"
                style={{
                  background: "#0e0e0e",
                  color: "#ffffff",
                  border: "none",
                  borderBottom: "1px solid #262626",
                }}
                onFocus={e => (e.currentTarget.style.borderBottom = "1px solid #ffdd73")}
                onBlur={e => (e.currentTarget.style.borderBottom = "1px solid #262626")}
              />
              <button
                onClick={handleCreateCollection}
                disabled={!newColName.trim() || colLoading}
                className="px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: "#ffdd73", color: "#624e00" }}
              >
                +
              </button>
            </div>

            {/* Collection list */}
            {collections.length === 0 ? (
              <p className="text-sm" style={{ color: "#484848" }}>No collections yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {collections.map(col => (
                  <li
                    key={col._id}
                    className="flex items-center justify-between rounded px-3 py-2"
                    style={{ background: "#1f2937" }}
                  >
                    <span className="text-sm truncate" style={{ color: "#ffffff" }}>{col.name}</span>
                    <span className="text-[9px] font-bold tracking-[0.15em] uppercase ml-2 shrink-0" style={{ color: "#484848" }}>
                      {col.items?.length ?? 0}
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

