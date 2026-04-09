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

export type CreditTransactionType = "earn" | "spend" | "refund";

export interface SpendCreditPayload {
  userId: string;
  amount: number;
  reason: string;
  relatedId?: string;
  relatedModel?: string;
}

// ── GENERATION ───────────────────────────────────────────────────────────────

export type GenerationStatus   = "pending" | "processing" | "done" | "failed";
export type MusicProvider      = "beatoven" | "lyria" | "stability";
export type SFXProvider        = "elevenlabs";
export type AnyProvider        = MusicProvider | SFXProvider;
export type MusicStyle         = "ambient" | "action" | "puzzle" | "horror" | "platformer";
export type MusicMood          = "tense" | "calm" | "epic" | "mysterious" | "cheerful";
export type GenerationDuration = 15 | 30 | 60;

export interface GenerationRequest {
  prompt: string;
  provider: MusicProvider;
  style: MusicStyle;
  mood: MusicMood;
  duration: GenerationDuration;
}

export interface SFXRequest {
  prompt: string;
  provider: SFXProvider;
  durationSeconds?: number; // 0.5 – 22, default 5
}

// ── SSE EVENTS ───────────────────────────────────────────────────────────────

export type SseEventType = "status" | "error" | "ping";

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
  verb: "published" | "liked" | "followed";
  objectType: "track" | "user";
  objectId: string;
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
