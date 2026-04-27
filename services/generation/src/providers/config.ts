/**
 * providers/config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tüm AI model ve provider ayarları burada.
 * Model değiştirmek, endpoint güncellemek veya parametre ayarlamak için
 * SADECE bu dosyayı düzenle — provider implementasyonlarına dokunma.
 */

// ── MUSIC ─────────────────────────────────────────────────────────────────────

export const BEATOVEN_CONFIG = {
  baseUrl:          "https://public-api.beatoven.ai/api/v1",
  outputFormat:     "ogg" as const,
  pollIntervalMs:   5_000,
  /** BullMQ timeout'undan bu kadar ms önce poll'u durdur */
  pollTimeoutBuffer: 15_000,
} as const;

export const SONAUTO_CONFIG = {
  baseUrl:           "https://api.sonauto.ai/v1",
  /** v2 = ~95s sabit süre, v3 = 2-4dk değişken. Game loop için v2 önerilir. */
  modelVersion:      "v2" as "v2" | "v3",
  outputFormat:      "mp3" as const,
  /**
   * style → Sonauto tags eşlemesi.
   * Geçerli tag listesi için: https://sonauto.ai/tag-explorer
   */
  styleTags: {
    ambient:    ["ambient", "atmospheric", "electronic"],
    action:     ["action", "energetic", "fast-paced", "aggressive"],
    puzzle:     ["calm", "minimalist", "subtle", "lo-fi"],
    horror:     ["dark", "eerie", "tense", "cinematic"],
    platformer: ["upbeat", "chiptune", "cheerful", "video-game"],
  } as Record<string, string[]>,
  /**
   * mood → Sonauto tags eşlemesi.
   */
  moodTags: {
    calm:       ["peaceful", "relaxing", "serene"],
    tense:      ["tense", "suspenseful", "dramatic"],
    epic:       ["epic", "cinematic", "powerful", "orchestral"],
    mysterious: ["mysterious", "ethereal", "mystical"],
    cheerful:   ["happy", "uplifting", "fun"],
  } as Record<string, string[]>,
  /** Sonauto birden fazla variant üretebilir; hangisini kullanacağımız */
  variantIndex:      0,
  pollIntervalMs:    4_000,
  pollTimeoutBuffer: 15_000,
  /** Sonauto URL'leri 7 gün sonra silinir — MinIO'ya kopyalıyoruz */
  downloadAndStore:  true,
} as const;

// ── SFX ──────────────────────────────────────────────────────────────────────

export const ELEVENLABS_CONFIG = {
  baseUrl:          "https://api.elevenlabs.io/v1",
  sfxEndpoint:      "/sound-generation",
  outputFormat:     "mp3" as const,
  /** 0–1: 1 = prompt'a tam uyan, 0 = yaratıcı çıkarım */
  promptInfluence:  0.3,
  /** Süre tahmini için varsayılan bitrate (kbps) */
  bitrateKbps:      128,
  /** API timeout (ms) */
  timeoutMs:        60_000,
} as const;

// ── IMAGE → PROMPT (Gemini Vision) ───────────────────────────────────────────

export const GEMINI_VISION_CONFIG = {
  /** Ücretsiz tier: 1500 istek/gün. Değiştirmek için buraya yaz. */
  model:   "gemini-2.0-flash",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  systemPrompt: `You are a game music director. Analyze this game screenshot.
Interpret the scene's atmosphere, color palette, genre, and emotional tone.
Return ONLY a music generation prompt (max 100 words, English).
No explanations, no labels — just the prompt.`,
} as const;

// ── MASTERING ASSISTANT (Gemini) ──────────────────────────────────────────────

export const GEMINI_MASTERING_CONFIG = {
  model:           "gemini-2.0-flash",
  baseUrl:         "https://generativelanguage.googleapis.com/v1beta",
  temperature:     0.3,
  maxOutputTokens: 1024,
} as const;

// ── MIDI GENERATION (Gemini) ──────────────────────────────────────────────────

export const GEMINI_MIDI_CONFIG = {
  model:           "gemini-2.0-flash",
  baseUrl:         "https://generativelanguage.googleapis.com/v1beta",
  temperature:     0.8,
  maxOutputTokens: 1024,
} as const;
