// frontend/src/store/useGenerationStore.ts
import { create } from "zustand";
import { api } from "../lib/api";
import { GenerationStatus, MusicProvider, MusicStyle, MusicMood, GenerationDuration, MusicKey, MusicScale, TimeSignature, SseStatusEvent, GenerationType } from "@sonaralabs/types";

export interface GenerationItem {
  _id: string;
  jobId?: string;
  type?: GenerationType;
  prompt: string;
  provider: string;         // MusicProvider | SFXProvider
  style?: MusicStyle;
  mood?: MusicMood;
  duration?: number;
  bpm?: number;
  key?: MusicKey;
  scale?: MusicScale;
  timeSignature?: TimeSignature;
  intensity?: number;
  waveformData?: number[];
  status: GenerationStatus;
  audioUrl?: string;
  creditCost: number;
  isFavorited: boolean;
  isImageGeneration: boolean;
  isLoop?: boolean;
  failReason?: string;
  createdAt: string;
}

interface GenerationState {
  items: GenerationItem[];
  activeJobId: string | null;
  isGenerating: boolean;
  generate: (params: {
    prompt: string;
    provider: MusicProvider;
    style: MusicStyle;
    mood: MusicMood;
    duration: GenerationDuration;
    loop: boolean;
    bpm?: number;
    key?: MusicKey;
    scale?: MusicScale;
    timeSignature?: TimeSignature;
    intensity?: number;
  }) => Promise<{ jobId: string; generationId: string }>;
  generateSFX: (params: {
    prompt: string;
    durationSeconds?: number;
  }) => Promise<{ jobId: string; generationId: string }>;
  analyzeImage: (imageBase64: string, mimeType: string) => Promise<string>;
  retry: (generationId: string) => Promise<void>;
  removeItem: (generationId: string) => Promise<void>;
  handleSSEEvent: (event: SseStatusEvent) => void;
  fetchHistory: (status?: GenerationStatus) => Promise<void>;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  items: [],
  activeJobId: null,
  isGenerating: false,

  generate: async (params) => {
    set({ isGenerating: true });
    try {
      const { data } = await api.post("/api/generate", params);
      const { jobId, generationId, creditCost } = data.data;

      // Optimistik item ekle
      const optimistic: GenerationItem = {
        _id: generationId,
        jobId,
        ...params,
        status: "pending",
        creditCost,
        isFavorited: false,
        isImageGeneration: false,
        isLoop: params.loop,
        createdAt: new Date().toISOString(),
      };

      set(s => ({ items: [optimistic, ...s.items], activeJobId: jobId, isGenerating: false }));
      return { jobId, generationId };
    } catch (err) {
      set({ isGenerating: false });
      throw err;
    }
  },

  generateSFX: async ({ prompt, durationSeconds }) => {
    set({ isGenerating: true });
    try {
      const { data } = await api.post("/api/generate/sfx", { prompt, durationSeconds, provider: "elevenlabs" });
      const { jobId, generationId, creditCost } = data.data;
      const optimistic: GenerationItem = {
        _id: generationId, jobId, type: "sfx",
        prompt, provider: "elevenlabs",
        status: "pending", creditCost,
        isFavorited: false, isImageGeneration: false,
        createdAt: new Date().toISOString(),
      };
      set(s => ({ items: [optimistic, ...s.items], activeJobId: jobId, isGenerating: false }));
      return { jobId, generationId };
    } catch (err) {
      set({ isGenerating: false });
      throw err;
    }
  },

  analyzeImage: async (imageBase64, mimeType) => {
    const { data } = await api.post("/api/generate/analyze-image", { imageBase64, mimeType });
    return data.data.prompt as string;
  },

  retry: async (generationId) => {
    const { data } = await api.post(`/api/generate/${generationId}/retry`);
    const { jobId, generationId: newId, creditCost } = data.data;
    // Yeni pending item ekle
    const src = get().items.find(i => i._id === generationId);
    if (src) {
      const retryItem: GenerationItem = { ...src, _id: newId, jobId, status: "pending", creditCost, createdAt: new Date().toISOString() };
      set(s => ({ items: [retryItem, ...s.items], activeJobId: jobId }));
    }
  },

  removeItem: async (generationId: string) => {
    // Optimistik: önce UI'dan kaldır, sonra backend'e sil isteği gönder
    set(s => ({ items: s.items.filter(i => i._id !== generationId) }));
    try {
      await api.delete(`/api/generate/${generationId}`);
    } catch {
      // Sessizce geç — UI'dan zaten kalktı, sayfa yenilenirse geri gelir
    }
  },

  handleSSEEvent: (event: SseStatusEvent) => {
    set(s => {
      const idx = s.items.findIndex(i => i.jobId === event.jobId);
      if (idx === -1) return s;
      const newItems = [...s.items];
      newItems[idx] = { ...newItems[idx], status: event.status, audioUrl: event.audioUrl ?? newItems[idx].audioUrl, failReason: event.failReason };
      return {
        items: newItems,
        activeJobId: event.status === "done" || event.status === "failed" ? null : s.activeJobId,
      };
    });
  },

  fetchHistory: async (status) => {
    const params = status ? `?status=${status}&limit=50` : "?limit=50";
    const { data } = await api.get(`/api/generate/history${params}`);
    const fetched: GenerationItem[] = data.data.items;
    const fetchedIds = new Set(fetched.map((i: GenerationItem) => i._id));
    // Preserve any optimistic items (no _id yet on server) that aren't in the response
    set(s => ({
      items: [
        ...fetched,
        ...s.items.filter(i => !fetchedIds.has(i._id) && !i._id),
      ],
    }));
  },
}));
