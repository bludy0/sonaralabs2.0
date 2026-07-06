import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import { useT } from "../store/useI18nStore";
import { PublishModal } from "../components/library/PublishModal";
import { LibraryItemCard } from "../components/library/LibraryItemCard";
import type { LibraryItem, Collection, TypeFilter, SortBy, StatusFilter } from "../components/library/LibraryTypes";

export default function LibraryPage() {
  const t = useT();
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

  // Collection management
  const [activeColId,    setActiveColId]    = useState<string | null>(null);
  const [activeColRefs,  setActiveColRefs]  = useState<Set<string>>(new Set());
  const [loadingColId,   setLoadingColId]   = useState<string | null>(null);
  const [renamingColId,  setRenamingColId]  = useState<string | null>(null);
  const [renameValue,    setRenameValue]    = useState("");
  const [deletingColId,  setDeletingColId]  = useState<string | null>(null);
  const [addingToColId,  setAddingToColId]  = useState<string | null>(null); // itemId being added

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
      setError(t.library.loadError);
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

  async function handleOpenInStudio(item: LibraryItem) {
    if (!item.audioUrl) return;
    const name = item.originalName ?? (item.prompt?.slice(0, 40) ?? "Track");
    try {
      const { data } = await api.post("/api/library/projects", {
        name,
        tracks: [],
        bpm: item.bpm ?? 120,
        loopEnabled: item.isLoop ?? false,
        loopStart: 0,
        loopEnd: item.duration ?? 8,
      });
      const projectId = data.data?._id ?? data.data?.id;
      sessionStorage.setItem("studio:preload", JSON.stringify([{ name, audioUrl: item.audioUrl, projectId }]));
      navigate(`/studio?projectId=${projectId}`);
    } catch {
      sessionStorage.setItem("studio:preload", JSON.stringify([{ name, audioUrl: item.audioUrl }]));
      navigate("/studio");
    }
  }

  async function handleDelete(item: LibraryItem) {
    if (!confirm(t.library.confirmDelete)) return;
    try {
      await api.delete(`/api/library/${item._type}/${item._id}`);
      setItems(prev => prev.filter(i => i._id !== item._id));
      setTotal(prev => prev - 1);
    } catch {
      toast(t.common.error, "error");
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
      toast(t.library.collectionError, "error");
    } finally {
      setColLoading(false);
    }
  }

  // ── Koleksiyon seç / genişlet ────────────────────────────────────────────────
  async function handleSelectCollection(colId: string) {
    if (activeColId === colId) {
      // Deselect
      setActiveColId(null);
      setActiveColRefs(new Set());
      return;
    }
    setLoadingColId(colId);
    try {
      const { data } = await api.get(`/api/collections/${colId}`);
      const col: Collection = data.data;
      setActiveColId(colId);
      setActiveColRefs(new Set(col.items.map(i => i.refId)));
    } catch {
      toast(t.library.loadCollectionError, "error");
    } finally {
      setLoadingColId(null);
    }
  }

  // ── Koleksiyon yeniden adlandır ───────────────────────────────────────────────
  async function handleRenameCollection(colId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) { setRenamingColId(null); return; }
    try {
      await api.patch(`/api/collections/${colId}`, { name: trimmed });
      setCollections(prev => prev.map(c => c._id === colId ? { ...c, name: trimmed } : c));
    } catch {
      toast(t.library.renameError, "error");
    } finally {
      setRenamingColId(null);
    }
  }

  // ── Koleksiyon sil ────────────────────────────────────────────────────────────
  async function handleDeleteCollection(colId: string) {
    setDeletingColId(colId);
    try {
      await api.delete(`/api/collections/${colId}`);
      setCollections(prev => prev.filter(c => c._id !== colId));
      if (activeColId === colId) { setActiveColId(null); setActiveColRefs(new Set()); }
    } catch {
      toast(t.library.deleteCollectionError, "error");
    } finally {
      setDeletingColId(null);
    }
  }

  // ── Item'ı koleksiyona ekle ───────────────────────────────────────────────────
  async function handleAddToCollection(item: LibraryItem, colId: string) {
    const refModel = item._type === "generation" ? "Generation" : "Upload";
    setAddingToColId(item._id);
    try {
      await api.post(`/api/collections/${colId}/items`, { refId: item._id, refModel });
      setCollections(prev => prev.map(c =>
        c._id === colId
          ? { ...c, items: [...c.items, { refId: item._id, refModel, addedAt: new Date().toISOString() }] }
          : c
      ));
      if (activeColId === colId) setActiveColRefs(prev => new Set(prev).add(item._id));
      toast(t.library.addedToCollection, "success");
    } catch {
      toast(t.library.collectionError, "error");
    } finally {
      setAddingToColId(null);
    }
  }

  // ── Item'ı koleksiyondan çıkar ────────────────────────────────────────────────
  async function handleRemoveFromCollection(colId: string, refId: string) {
    try {
      await api.delete(`/api/collections/${colId}/items/${refId}`);
      setCollections(prev => prev.map(c =>
        c._id === colId
          ? { ...c, items: c.items.filter(i => i.refId !== refId) }
          : c
      ));
      if (activeColId === colId) {
        setActiveColRefs(prev => { const s = new Set(prev); s.delete(refId); return s; });
      }
    } catch {
      toast(t.library.removeError, "error");
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
    setUploadProgress(0);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      await api.post("/api/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress(e) {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      setUploadFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast(t.library.uploadSuccess, "success");
      setPage(1);
      await fetchItems(typeFilter, favOnly, searchQ, statusFilter, 1, false);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t.library.uploadFailed;
      setUploadError(msg);
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  }

  const hasMore = !activeColId && items.length < total;

  const sortedItems = [...items]
    .filter(item => !activeColId || activeColRefs.has(item._id))
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
    <div className="min-h-screen p-6" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>
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
          style={{ color: "var(--text-3)" }}
        >
          SONARALABS / LIBRARY
        </p>
        <h1
          lang="en"
          className="text-2xl font-bold uppercase"
          style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}
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
              style={{ background: "var(--bg-card)" }}
            >
              <span className="material-symbols-outlined text-base shrink-0" style={{ color: "var(--text-3)" }}>
                search
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder={t.library.search}
                className="flex-1 text-sm bg-transparent focus:outline-none"
                style={{ color: "var(--text-1)" }}
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(""); setSearchQ(""); }}
                  className="shrink-0"
                  style={{ color: "var(--text-3)" }}
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </div>

            {/* Type chips */}
            <div className="flex gap-1.5">
              {([
                ["all",        t.library.filterAll],
                ["generation", t.library.filterGenerated],
                ["upload",     t.library.filterUploaded],
              ] as [TypeFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className="text-xs px-3 py-1.5 rounded-full font-bold transition-colors"
                  style={
                    typeFilter === key
                      ? { background: "var(--accent)", color: "var(--accent-on)" }
                      : { background: "var(--bg-card)", color: "var(--text-3)" }
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
                  ? { background: "color-mix(in srgb, var(--error) 15%, transparent)", color: "var(--error)" }
                  : { background: "var(--bg-card)", color: "var(--text-3)" }
              }
            >
              <span className="material-symbols-outlined text-base">
                {favOnly ? "favorite" : "favorite"}
              </span>
              {t.library.favorites}
            </button>
          </div>

          {/* Second filter row — sort + status */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Sort chips */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase mr-1" style={{ color: "var(--text-3)" }}>
                Sort
              </span>
              {([
                ["newest",   t.library.sortNewest],
                ["oldest",   t.library.sortOldest],
                ["longest",  t.library.sortLongest],
                ["shortest", t.library.sortShortest],
              ] as [SortBy, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className="text-xs px-2.5 py-1 rounded-full font-bold transition-colors"
                  style={
                    sortBy === key
                      ? { background: "var(--bg-border)", color: "var(--text-1)" }
                      : { background: "var(--bg-card)", color: "var(--text-3)" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-4 shrink-0" style={{ background: "var(--bg-border)" }} />

            {/* Status chips */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase mr-1" style={{ color: "var(--text-3)" }}>
                Status
              </span>
              {([
                ["all",        t.library.filterAll],
                ["done",       t.library.filterDone],
                ["processing", t.library.filterProcessing],
                ["failed",     t.library.filterFailed],
              ] as [StatusFilter, string][]).map(([key, label]) => {
                const activeColors: Record<string, { bg: string; text: string }> = {
                  done: { bg: "color-mix(in srgb, var(--success) 15%, transparent)", text: "var(--success)" },
                  processing: { bg: "color-mix(in srgb, var(--accent) 15%, transparent)", text: "var(--accent)" },
                  failed: { bg: "color-mix(in srgb, var(--error) 15%, transparent)", text: "var(--error)" },
                  all: { bg: "var(--bg-border)", text: "#ffffff" },
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
                        : { background: "var(--bg-card)", color: "var(--text-3)" }
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
            style={{ background: "var(--bg-card)" }}
          >
            <p
              lang="en"
              className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3"
              style={{ color: "var(--text-3)" }}
            >
              Upload Audio
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 cursor-pointer transition-colors"
                style={{ background: "var(--bg-input)" }}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="material-symbols-outlined text-base" style={{ color: "var(--text-2)" }}>
                  upload_file
                </span>
                <span className="text-sm" style={{ color: "var(--text-2)" }}>
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
                  background: "var(--accent)",
                  color: "var(--accent-on)",
                  boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)",
                }}
              >
                {uploading ? `Uploading… ${uploadProgress}%` : "Upload"}
              </button>
              {uploadError && (
                <span className="text-xs" style={{ color: "var(--error)" }}>{uploadError}</span>
              )}
            </div>
            {/* Upload progress bar */}
            {uploading && (
              <div
                className="h-1 rounded-full overflow-hidden mt-2"
                style={{ background: "var(--bg-border)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${uploadProgress}%`,
                    background: "var(--accent)",
                    boxShadow: "0 0 6px color-mix(in srgb, var(--accent) 50%, transparent)",
                  }}
                />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm mb-4" style={{ color: "var(--error)" }}>{error}</p>
          )}

          {/* Active collection banner */}
          {activeColId && (
            <div
              className="mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5"
              style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" }}
            >
              <span className="material-symbols-outlined text-base" style={{ color: "var(--accent)" }}>folder_open</span>
              <span className="text-sm font-semibold flex-1" style={{ color: "var(--accent)" }}>
                {collections.find(c => c._id === activeColId)?.name ?? "Collection"}
              </span>
              <span className="text-xs" style={{ color: "var(--text-3)" }}>{activeColRefs.size} items</span>
              <button
                onClick={() => { setActiveColId(null); setActiveColRefs(new Set()); }}
                className="text-xs font-semibold transition-colors"
                style={{ color: "var(--text-3)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                ✕ Clear filter
              </button>
            </div>
          )}

          {/* Items list */}
          {loading && items.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: "var(--text-3)" }}>Loading...</div>
          ) : sortedItems.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: "var(--text-3)" }}>
              {activeColId ? "This collection is empty. Add items using the folder icon on any track." : "No items found."}
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedItems.map(item => (
                <LibraryItemCard
                  key={item._id}
                  item={item}
                  collections={collections}
                  inActiveCollection={!!activeColId && activeColRefs.has(item._id)}
                  addingToCol={addingToColId === item._id}
                  onFavoriteToggle={handleFavoriteToggle}
                  onDelete={handleDelete}
                  onOpenInStudio={handleOpenInStudio}
                  onPublish={item.audioUrl && item.status === "done" ? () => setPublishItem(item) : undefined}
                  onAddToCollection={handleAddToCollection}
                  onRemoveFromCollection={activeColId ? (refId) => handleRemoveFromCollection(activeColId, refId) : undefined}
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
                style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
              >
                {loading ? "Loading..." : `Load More (${items.length}/${total})`}
              </button>
            </div>
          )}
        </div>

        {/* Right panel — Collections */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="rounded-lg p-4" style={{ background: "var(--bg-card)" }}>
            <p
              lang="en"
              className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
              style={{ color: "var(--text-3)" }}
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
                  background: "var(--bg-page)",
                  color: "var(--text-1)",
                  border: "none",
                  borderBottom: "1px solid var(--bg-border)",
                }}
                onFocus={e => (e.currentTarget.style.borderBottom = "1px solid var(--accent)")}
                onBlur={e => (e.currentTarget.style.borderBottom = "1px solid var(--bg-border)")}
              />
              <button
                onClick={handleCreateCollection}
                disabled={!newColName.trim() || colLoading}
                className="px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-on)" }}
              >
                +
              </button>
            </div>

            {/* Collection list */}
            {collections.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>No collections yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {collections.map(col => {
                  const isActive   = activeColId === col._id;
                  const isRenaming = renamingColId === col._id;
                  const isDeleting = deletingColId === col._id;
                  const isLoading  = loadingColId  === col._id;
                  return (
                    <li key={col._id}>
                      <div
                        className="flex items-center gap-1.5 rounded px-3 py-2 group transition-colors cursor-pointer"
                        style={{
                          background:  isActive ? "color-mix(in srgb, var(--accent) 12%, var(--bg-input))" : "var(--bg-input)",
                          borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                        }}
                        onClick={() => { if (!isRenaming) handleSelectCollection(col._id); }}
                      >
                        {/* Folder icon */}
                        <span
                          className="material-symbols-outlined text-base shrink-0 transition-colors"
                          style={{ color: isActive ? "var(--accent)" : "var(--text-3)", fontSize: 16 }}
                        >
                          {isLoading ? "hourglass_empty" : isActive ? "folder_open" : "folder"}
                        </span>

                        {/* Name / rename input */}
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter")  handleRenameCollection(col._id, renameValue);
                              if (e.key === "Escape") setRenamingColId(null);
                            }}
                            onBlur={() => handleRenameCollection(col._id, renameValue)}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 min-w-0 text-sm bg-transparent outline-none border-b"
                            style={{ color: "var(--text-1)", borderColor: "var(--accent)" }}
                          />
                        ) : (
                          <span className="flex-1 min-w-0 text-sm truncate" style={{ color: isActive ? "var(--accent)" : "var(--text-1)" }}>
                            {col.name}
                          </span>
                        )}

                        {/* Item count badge */}
                        <span
                          className="text-[9px] font-bold tracking-wide shrink-0 px-1.5 py-0.5 rounded"
                          style={{
                            background: isActive ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--bg-page)",
                            color: isActive ? "var(--accent)" : "var(--text-3)",
                          }}
                        >
                          {col.items?.length ?? 0}
                        </span>

                        {/* Action buttons — visible on hover */}
                        {!isRenaming && (
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {/* Rename */}
                            <button
                              onClick={e => { e.stopPropagation(); setRenamingColId(col._id); setRenameValue(col.name); }}
                              title="Rename"
                              className="p-0.5 rounded transition-colors"
                              style={{ color: "var(--text-3)" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                            </button>
                            {/* Delete */}
                            <button
                              onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${col.name}"?`)) handleDeleteCollection(col._id); }}
                              disabled={isDeleting}
                              title="Delete collection"
                              className="p-0.5 rounded transition-colors disabled:opacity-40"
                              style={{ color: "var(--text-3)" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "var(--error)")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                {isDeleting ? "hourglass_empty" : "delete"}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

