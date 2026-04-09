// frontend/src/store/useGenerationStore.ts
import { create } from "zustand";
import { api } from "../lib/api";
import { GenerationStatus, MusicProvider, MusicStyle, MusicMood, GenerationDuration, SseStatusEvent } from "@sonaralabs/types";

export interface GenerationItem {
  _id: string;
  jobId?: string;
  prompt: string;
  provider: MusicProvider;
  style: MusicStyle;
  mood: MusicMood;
  duration: GenerationDuration;
  status: GenerationStatus;
  audioUrl?: string;
  creditCost: number;
  isFavorited: boolean;
  isImageGeneration: boolean;
  failReason?: string;
  createdAt: string;
}

interface GenerationState {
  items: GenerationItem[];
  activeJobId: string | null;
  isGenerating: boolean;
  // actions
  generate: (params: {
    prompt: string;
    provider: MusicProvider;
    style: MusicStyle;
    mood: MusicMood;
    duration: GenerationDuration;
  }) => Promise<{ jobId: string; generationId: string }>;
  analyzeImage: (imageBase64: string, mimeType: string) => Promise<string>;
  retry: (generationId: string) => Promise<void>;
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

  handleSSEEvent: (event: SseStatusEvent) => {
    set(s => ({
      items: s.items.map(item =>
        item.jobId === event.jobId
          ? { ...item, status: event.status, audioUrl: event.audioUrl ?? item.audioUrl, failReason: event.failReason }
          : item
      ),
      activeJobId: event.status === "done" || event.status === "failed" ? null : s.activeJobId,
    }));
  },

  fetchHistory: async (status) => {
    const params = status ? `?status=${status}&limit=50` : "?limit=50";
    const { data } = await api.get(`/api/generate/history${params}`);
    set({ items: data.data.items });
  },
}));
