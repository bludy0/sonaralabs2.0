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
   * Geçerli tag listesi: test edilmiş değerler — geçersiz tag 422 verir.
   * Tag explorer: https://sonauto.ai/tag-explorer
   */
  styleTags: {
    ambient:    ["ambient", "atmospheric", "electronic", "synth"],
    action:     ["action", "energetic", "aggressive", "intense"],
    puzzle:     ["calm", "lo-fi", "peaceful", "relaxing"],
    horror:     ["dark", "horror", "cinematic", "dramatic"],
    platformer: ["chiptune", "retro", "game", "fun"],
  } as Record<string, string[]>,
  /**
   * mood → Sonauto tags eşlemesi.
   */
  moodTags: {
    calm:       ["peaceful", "relaxing", "calm"],
    tense:      ["tension", "suspenseful", "dramatic"],
    epic:       ["epic", "cinematic", "powerful", "orchestral"],
    mysterious: ["mysterious", "ethereal", "dark"],
    cheerful:   ["happy", "uplifting", "fun"],
  } as Record<string, string[]>,
  /** Sonauto birden fazla variant üretebilir; hangisini kullanacağımız */
  variantIndex:      0,
  pollIntervalMs:    4_000,
  pollTimeoutBuffer: 15_000,
  /** Sonauto URL'leri 7 gün sonra silinir — MinIO'ya kopyalıyoruz */
  downloadAndStore:  true,
} as const;

export const STABLEAUDIO_CONFIG = {
  /**
   * Stable Audio — resmi HuggingFace Space (stabilityai/stable-audio-3, ZeroGPU).
   * Gradio /call API: POST → event_id, GET SSE stream → WAV dosya URL'i.
   * ÜCRETSİZ: ZeroGPU günlük kotası kullanılır; sadece geçerli bir HF token gerekir
   * (HUGGINGFACE_API_KEY). Kart/satın alma yok.
   */
  spaceUrl:    "https://stabilityai-stable-audio-3.hf.space",
  fn:          "infer",
  /** /infer imzası: [variant, prompt, duration, steps, cfg_scale, sampler, seed] */
  variant:     "small-music" as const, // hızlı; ZeroGPU kotasını korur
  steps:       8,
  cfgScale:    1.0,
  sampler:     "pingpong" as const,
  /** Space model max 380s; biz site seçenekleriyle (15/30/60) sınırlıyız. */
  maxDuration: 60 as const,
  outputFormat: "wav" as const,
  contentType:  "audio/wav",
  /** Tek istek timeout (ms) — ZeroGPU kuyruğu + üretim. */
  timeoutMs:   180_000,
  /** Her prompt'a eklenen oyun-müziği çerçevesi (Stable Audio bunlara iyi yanıt verir). */
  promptSuffix: "video game soundtrack, instrumental, professionally produced, high quality stereo audio",
  /** Loop AÇIK → kusursuz döngü vurgusu. */
  loopSuffix:    "seamless loop, designed to loop perfectly, consistent energy throughout, no intro, no outro, no fade in or fade out",
  /** Loop KAPALI → doğal giriş/bitişli tek seferlik parça. */
  oneShotSuffix: "with a clear intro and a natural ending",
} as const;

/**
 * Oyun-müziği için style (tür) → zengin Stable Audio betimlemesi.
 * Yeni bir tür eklemek: MusicStyle'a ekle + buraya bir satır.
 */
export const STYLE_PROMPTS: Record<string, string> = {
  ambient:    "ambient atmospheric soundscape, evolving synth pads, spacious reverb",
  action:     "high-energy action music, driving percussion, fast tempo, intense",
  adventure:  "adventurous orchestral score, sweeping heroic melodies, sense of exploration",
  puzzle:     "playful minimal puzzle music, light plucks, curious and relaxed",
  horror:     "dark horror ambience, dissonant strings, eerie drones, unsettling tension",
  platformer: "upbeat platformer tune, bouncy rhythm, catchy chiptune-pop melody",
  orchestral: "epic orchestral, cinematic strings, brass and timpani, choir",
  chiptune:   "8-bit chiptune, retro arcade NES style, square and pulse waves",
  synthwave:  "retro synthwave, analog synths, neon 80s outrun, gated drums",
  fantasy:    "fantasy RPG soundtrack, Celtic flutes and harps, magical orchestral",
  boss:       "intense boss battle theme, aggressive orchestral, war drums and choir, epic",
  racing:     "fast-paced electronic racing music, energetic driving beat, adrenaline",
  scifi:      "futuristic sci-fi score, pulsing synths, cosmic atmosphere, deep bass",
  lofi:       "lo-fi chill beats, mellow keys, vinyl crackle, relaxed groove",
  medieval:   "medieval folk, lute, fiddle and tin whistle, tavern atmosphere",
  cyberpunk:  "dark cyberpunk, gritty industrial synths, dystopian neon city",
  western:    "spaghetti western, twangy guitar, whistling, desert frontier",
  jrpg:       "emotional JRPG theme, lush orchestral and piano, nostalgic melody",
};

/** Oyun-müziği için mood → zengin Stable Audio betimlemesi. */
export const MOOD_PROMPTS: Record<string, string> = {
  tense:       "tense, suspenseful, building dread",
  calm:        "calm, peaceful, gentle and soothing",
  epic:        "epic, grand, powerful and cinematic",
  mysterious:  "mysterious, enigmatic, ethereal",
  cheerful:    "cheerful, happy, bright and upbeat",
  heroic:      "heroic, triumphant, uplifting and bold",
  melancholic: "melancholic, emotional, bittersweet and reflective",
  dark:        "dark, ominous, brooding and foreboding",
  energetic:   "energetic, driving, high tempo and lively",
  dreamy:      "dreamy, floating, soft and atmospheric",
  playful:     "playful, whimsical, fun and quirky",
  triumphant:  "triumphant, victorious, soaring and majestic",
};

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
