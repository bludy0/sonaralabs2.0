// apps/web/src/store/useSocialStore.ts
import { create } from "zustand";
import { api } from "../lib/api";

export interface PublicTrack {
  id:            string;
  userId:        string;
  title:         string;
  audioUrl:      string;
  durationSec:   number;
  bpm?:          number;
  genreTags:     string[];
  moodTags:      string[];
  gameTypeTags:  string[];
  likeCount:     number;
  isLoop:        boolean;
  loopMetadata?: { loopStart: number; loopEnd: number; tempo: number };
  waveformData?: number[];
  createdAt:     string;
  // joined fields
  authorUsername?: string;
  likedByMe?:      boolean;
}

export interface FeedEvent {
  id:             string;
  actorId:        string;
  actorUsername:  string;
  verb:           "published" | "liked" | "followed";
  objectType:     "track" | "user";
  objectId:       string;
  objectTitle?:   string;
  createdAt:      string;
}

export interface PublishTrackPayload {
  title:        string;
  audioUrl:     string;
  durationSec:  number;
  bpm?:         number;
  genreTags:    string[];
  moodTags:     string[];
  gameTypeTags: string[];
  isLoop:       boolean;
  generationId?: string;
  uploadId?:    string;
}

interface SocialState {
  // Explore / public tracks
  exploreTracks: PublicTrack[];
  exploreTotal:  number;
  exploreLoading:boolean;

  // My tracks
  myTracks:      PublicTrack[];
  myTracksTotal: number;

  // Feed
  feedEvents:    FeedEvent[];
  feedLoading:   boolean;

  // Follow state cache (userId → following?)
  followCache:   Record<string, boolean>;

  // Actions — explore
  fetchExploreTracks: (params?: {
    page?: number;
    genre?: string;
    mood?: string;
    search?: string;
    append?: boolean;
  }) => Promise<void>;

  // Actions — my tracks
  fetchMyTracks:  () => Promise<void>;
  publishTrack:   (payload: PublishTrackPayload) => Promise<PublicTrack>;
  deleteTrack:    (id: string) => Promise<void>;

  // Actions — likes
  toggleLike: (trackId: string) => Promise<void>;

  // Actions — follow
  fetchFollowStatus: (userId: string) => Promise<boolean>;
  toggleFollow:      (userId: string) => Promise<boolean>;  // returns new following state

  // Actions — feed
  fetchFeed: () => Promise<void>;
  prependFeedEvent: (event: FeedEvent) => void;

  reset: () => void;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  exploreTracks:  [],
  exploreTotal:   0,
  exploreLoading: false,
  myTracks:       [],
  myTracksTotal:  0,
  feedEvents:     [],
  feedLoading:    false,
  followCache:    {},

  // ── Explore ────────────────────────────────────────────────────────────────

  fetchExploreTracks: async ({ page = 1, genre, mood, search, append = false } = {}) => {
    set({ exploreLoading: true });
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (genre)  params.genre  = genre;
      if (mood)   params.mood   = mood;
      if (search) params.search = search;

      const { data } = await api.get("/api/social/tracks", { params });
      const incoming: PublicTrack[] = data.data?.items ?? data.data ?? [];
      const total: number           = data.data?.total  ?? incoming.length;

      set(state => ({
        exploreTracks:  append ? [...state.exploreTracks, ...incoming] : incoming,
        exploreTotal:   total,
        exploreLoading: false,
      }));
    } catch {
      set({ exploreLoading: false });
    }
  },

  // ── My tracks ──────────────────────────────────────────────────────────────

  fetchMyTracks: async () => {
    try {
      const { data } = await api.get("/api/social/my-tracks");
      const items: PublicTrack[] = data.data?.items ?? data.data ?? [];
      set({ myTracks: items, myTracksTotal: items.length });
    } catch { /* silent */ }
  },

  publishTrack: async (payload) => {
    const { data } = await api.post("/api/social/tracks", payload);
    const track: PublicTrack = data.data;
    set(state => ({
      myTracks:      [track, ...state.myTracks],
      myTracksTotal: state.myTracksTotal + 1,
    }));
    return track;
  },

  deleteTrack: async (id) => {
    await api.delete(`/api/social/tracks/${id}`);
    set(state => ({
      myTracks:       state.myTracks.filter(t => t.id !== id),
      exploreTracks:  state.exploreTracks.filter(t => t.id !== id),
      myTracksTotal:  Math.max(0, state.myTracksTotal - 1),
    }));
  },

  // ── Likes ──────────────────────────────────────────────────────────────────

  toggleLike: async (trackId) => {
    // Optimistic — works for both explore and myTracks lists
    const applyLike = (tracks: PublicTrack[], liked: boolean) =>
      tracks.map(t =>
        t.id === trackId
          ? { ...t, likedByMe: liked, likeCount: t.likeCount + (liked ? 1 : -1) }
          : t
      );

    const wasLiked = get().exploreTracks.find(t => t.id === trackId)?.likedByMe ?? false;
    set(state => ({
      exploreTracks: applyLike(state.exploreTracks, !wasLiked),
      myTracks:      applyLike(state.myTracks,      !wasLiked),
    }));

    try {
      await api.post(`/api/social/tracks/${trackId}/like`);
    } catch {
      // Revert
      set(state => ({
        exploreTracks: applyLike(state.exploreTracks, wasLiked),
        myTracks:      applyLike(state.myTracks,      wasLiked),
      }));
    }
  },

  // ── Follow ─────────────────────────────────────────────────────────────────

  fetchFollowStatus: async (userId) => {
    try {
      const { data } = await api.get(`/api/social/follow/${userId}/status`);
      const following: boolean = data.data?.following ?? false;
      set(state => ({ followCache: { ...state.followCache, [userId]: following } }));
      return following;
    } catch {
      return false;
    }
  },

  toggleFollow: async (userId) => {
    const prev = get().followCache[userId] ?? false;
    // Optimistic
    set(state => ({ followCache: { ...state.followCache, [userId]: !prev } }));
    try {
      const { data } = await api.post(`/api/social/follow/${userId}`);
      const following: boolean = data.data?.following ?? !prev;
      set(state => ({ followCache: { ...state.followCache, [userId]: following } }));
      return following;
    } catch {
      // Revert
      set(state => ({ followCache: { ...state.followCache, [userId]: prev } }));
      return prev;
    }
  },

  // ── Feed ───────────────────────────────────────────────────────────────────

  fetchFeed: async () => {
    set({ feedLoading: true });
    try {
      const { data } = await api.get("/api/social/feed", { params: { limit: 50 } });
      const items: FeedEvent[] = data.data?.items ?? [];
      set({ feedEvents: items, feedLoading: false });
    } catch {
      set({ feedLoading: false });
    }
  },

  prependFeedEvent: (event) => {
    set(state => ({ feedEvents: [event, ...state.feedEvents] }));
  },

  reset: () => set({
    exploreTracks: [], exploreTotal: 0, myTracks: [], myTracksTotal: 0,
    feedEvents: [], followCache: {},
  }),
}));
