// apps/web/src/store/useLibraryStore.ts
import { create } from "zustand";
import { api } from "../lib/api";

export interface LibraryItem {
  _id: string;
  _type: "generation" | "upload";
  prompt?: string;
  originalName?: string;
  audioUrl?: string;
  duration?: number;
  isFavorited: boolean;
  provider?: string;
  style?: string;
  mood?: string;
  status?: string;
  type?: string;        // 'sfx' | 'music' for generations
  createdAt: string;
}

export interface Collection {
  _id: string;
  name: string;
  items: Array<{ refId: string; refModel: string; addedAt: string }>;
  createdAt: string;
}

export type FilterTab = "all" | "favorites" | "generations" | "uploads";

const PAGE_LIMIT = 20;

interface LibraryState {
  // Items list
  items:   LibraryItem[];
  total:   number;
  page:    number;
  tab:     FilterTab;
  loading: boolean;
  error:   string | null;

  // Collections
  collections:  Collection[];
  colLoading:   boolean;

  // Actions — items
  fetchItems:    (tab?: FilterTab, nextPage?: number, append?: boolean) => Promise<void>;
  toggleFavorite:(id: string, model: "generation" | "upload") => Promise<void>;
  deleteItem:    (id: string, model: "generation" | "upload") => Promise<void>;
  setTab:        (tab: FilterTab) => void;
  loadMore:      () => Promise<void>;
  reset:         () => void;

  // Actions — collections
  fetchCollections: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addToCollection:  (colId: string, refId: string, refModel: string) => Promise<void>;
  removeFromCollection: (colId: string, refId: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items:       [],
  total:       0,
  page:        1,
  tab:         "all",
  loading:     false,
  error:       null,
  collections: [],
  colLoading:  false,

  // ── Items ──────────────────────────────────────────────────────────────────

  fetchItems: async (tab, nextPage, append = false) => {
    const resolvedTab  = tab      ?? get().tab;
    const resolvedPage = nextPage ?? 1;

    set({ loading: true, error: null });
    try {
      const params: Record<string, string | number> = { page: resolvedPage, limit: PAGE_LIMIT };
      if (resolvedTab === "favorites")   params.favorites = "true";
      if (resolvedTab === "generations") params.type = "generation";
      if (resolvedTab === "uploads")     params.type = "upload";

      const { data } = await api.get("/api/library", { params });
      const incoming: LibraryItem[] = data.items ?? data.data?.items ?? [];
      const total:    number        = data.total  ?? data.data?.total ?? 0;

      set(state => ({
        items:   append ? [...state.items, ...incoming] : incoming,
        total,
        page:    resolvedPage,
        tab:     resolvedTab,
        loading: false,
      }));
    } catch {
      set({ error: "Kütüphane yüklenemedi.", loading: false });
    }
  },

  toggleFavorite: async (id, model) => {
    // Optimistic
    set(state => ({
      items: state.items.map(item =>
        item._id === id ? { ...item, isFavorited: !item.isFavorited } : item
      ),
    }));
    try {
      await api.patch(`/api/library/${model}s/${id}/favorite`);
    } catch {
      // Revert on failure
      set(state => ({
        items: state.items.map(item =>
          item._id === id ? { ...item, isFavorited: !item.isFavorited } : item
        ),
      }));
    }
  },

  deleteItem: async (id, model) => {
    await api.delete(`/api/library/${model}s/${id}`);
    set(state => ({
      items: state.items.filter(item => item._id !== id),
      total: Math.max(0, state.total - 1),
    }));
  },

  setTab: (tab) => {
    set({ tab, items: [], page: 1, total: 0 });
    get().fetchItems(tab, 1, false);
  },

  loadMore: async () => {
    const { items, total, page, tab, loading } = get();
    if (loading || items.length >= total) return;
    await get().fetchItems(tab, page + 1, true);
  },

  reset: () => set({ items: [], total: 0, page: 1, tab: "all", error: null }),

  // ── Collections ────────────────────────────────────────────────────────────

  fetchCollections: async () => {
    set({ colLoading: true });
    try {
      const { data } = await api.get("/api/collections");
      set({ collections: data.data ?? data ?? [], colLoading: false });
    } catch {
      set({ colLoading: false });
    }
  },

  createCollection: async (name) => {
    const { data } = await api.post("/api/collections", { name });
    const newCol: Collection = data.data ?? data;
    set(state => ({ collections: [newCol, ...state.collections] }));
  },

  deleteCollection: async (id) => {
    await api.delete(`/api/collections/${id}`);
    set(state => ({ collections: state.collections.filter(c => c._id !== id) }));
  },

  addToCollection: async (colId, refId, refModel) => {
    await api.post(`/api/collections/${colId}/items`, { refId, refModel });
    await get().fetchCollections(); // refresh for updated item list
  },

  removeFromCollection: async (colId, refId) => {
    await api.delete(`/api/collections/${colId}/items/${refId}`);
    set(state => ({
      collections: state.collections.map(c =>
        c._id === colId
          ? { ...c, items: c.items.filter(i => i.refId !== refId) }
          : c
      ),
    }));
  },
}));
