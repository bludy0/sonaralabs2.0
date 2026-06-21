// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yunus Emre Aslan

// shared/types.ts
// Tüm servislerde ortak kullanılan tipler.
// Her servise kopyalanır veya git submodule / npm workspace ile paylaşılır.

// ── JWT PAYLOADS ─────────────────────────────────────────────────────────────

export interface UserJwtPayload {
  sub: string;        // userId
  role: "user" | "admin";
  iat: number;
  exp: number;
}

export interface InternalJwtPayload {
  sub: string;        // userId
  role: "user" | "admin";
  iat: number;
  exp: number;
  _internal: true;   // internal token'ı user token'dan ayırt etmek için
}

// ── HTTP INTERNAL HEADERS ────────────────────────────────────────────────────

export const INTERNAL_TOKEN_HEADER = "x-internal-token" as const;

// ── API RESPONSE ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── CREDIT ───────────────────────────────────────────────────────────────────

export interface SpendCreditPayload {
  userId: string;
  amount: number;
  reason: string;
  relatedId?: string;
  relatedModel?: string;
}

// ── GENERATION ───────────────────────────────────────────────────────────────

export type GenerationStatus   = "pending" | "processing" | "done" | "failed";
export type MusicProvider      = "beatoven" | "lyria" | "sonauto" | "stableaudio";
export type SFXProvider        = "elevenlabs";
export type MusicStyle =
  | "ambient" | "action" | "adventure" | "puzzle" | "horror" | "platformer"
  | "orchestral" | "chiptune" | "synthwave" | "fantasy" | "boss" | "racing"
  | "scifi" | "lofi" | "medieval" | "cyberpunk" | "western" | "jrpg";
export type MusicMood =
  | "tense" | "calm" | "epic" | "mysterious" | "cheerful" | "heroic"
  | "melancholic" | "dark" | "energetic" | "dreamy" | "playful" | "triumphant";
export type GenerationDuration = 15 | 30 | 60;

export interface GenerationRequest {
  prompt: string;
  provider: MusicProvider;
  style: MusicStyle;
  mood: MusicMood;
  duration: GenerationDuration;
  /** Kusursuz döngü (oyun loop'u) — intro/outro olmadan üret. Varsayılan true. */
  loop?: boolean;
}

export interface SFXRequest {
  prompt: string;
  provider: SFXProvider;
  durationSeconds?: number; // 0.5 – 22, default 5
}

// ── SSE EVENTS ───────────────────────────────────────────────────────────────

export interface SseStatusEvent {
  type: "status";
  jobId: string;
  status: GenerationStatus;
  audioUrl?: string;
  failReason?: string;
}

// ── NOTIFICATION ─────────────────────────────────────────────────────────────

export interface NotifyJobPayload {
  userId: string;
  jobId: string;
  status: GenerationStatus;
  audioUrl?: string;
  failReason?: string;
}

// ── SOCIAL TYPES ──────────────────────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  gameGenres: string[];
  isPublic: boolean;
  followerCount: number;
  followingCount: number;
  trackCount: number;
  createdAt: string;
}

export interface PublicTrack {
  id: string;
  userId: string;
  username: string;        // display username (@handle)
  generationId: string;
  title: string;
  audioUrl: string;
  waveformData?: number[];
  durationSec: number;
  bpm?: number;
  genreTags: string[];
  moodTags: string[];
  gameTypeTags: string[];
  likeCount: number;
  isLoop: boolean;
  loopMetadata?: { loopStart: number; loopEnd: number; tempo: number };
  createdAt: string;
}

export interface FeedEvent {
  id: string;
  actorId: string;
  actorUsername: string;
  verb: "published" | "liked" | "followed";
  objectType: "track" | "user";
  objectId: string;
  objectTitle?: string;
  createdAt: string;
}

export interface SocialSseEvent {
  type: "follow" | "like" | "publish";
  actorId: string;
  actorUsername?: string;
  objectId: string;
  objectTitle?: string;
  createdAt: string;
}

// ── GENERATION V2 TYPES ───────────────────────────────────────────────────────

export type GenerationType = "music" | "sfx";

// ── CREDIT COST TABLES ────────────────────────────────────────────────────────

export const MUSIC_CREDIT_COST: Record<MusicProvider, Record<number, number>> = {
  beatoven:  { 15: 3,  30: 5,  60: 8  },
  lyria:     { 15: 2,  30: 3,  60: 5  },
  /**
   * Sonauto v2 her zaman ~95s üretir (duration parametresi modeli etkilemez).
   * Flat fiyat: her istekte 5 kredi.
   */
  sonauto:   { 15: 5,  30: 5,  60: 5  },
  /**
   * Stable Audio (HF Space / ZeroGPU) — ücretsiz (HF token kotası). Flat 1 kredi.
   */
  stableaudio: { 15: 1,  30: 1,  60: 1  },
} as const;

export const SFX_CREDIT_COST: Record<SFXProvider, number> = {
  elevenlabs: 1,
} as const;

export function getMusicCreditCost(provider: MusicProvider, duration: number, isRetry = false): number {
  const base = MUSIC_CREDIT_COST[provider]?.[duration] ?? 5;
  return isRetry ? Math.ceil(base / 2) : base;
}

export function getSFXCreditCost(provider: SFXProvider): number {
  return SFX_CREDIT_COST[provider] ?? 1;
}
