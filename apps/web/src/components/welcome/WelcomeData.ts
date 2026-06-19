// ── Static data ───────────────────────────────────────────────────────────────
export const BARS = [
  38,72,55,90,44,82,61,95,33,78,50,88,40,70,58,
  92,36,66,80,48,85,42,75,60,94,35,68,53,87,45,
  79,57,63,91,47,77,52,86,39,74,59,93,34,69,81,
  46,76,65,89,
];

export const FEATURES = [
  {
    icon: "✦",
    title: "Text to Music",
    desc: "Write a prompt like \"tense boss fight, heavy drums\". Get a game-ready loop in under 60 seconds. No music theory needed.",
  },
  {
    icon: "◈",
    title: "Screenshot to Music",
    desc: "Drop any game screenshot. Gemini Vision reads the atmosphere and color palette, then generates matching music automatically.",
  },
  {
    icon: "◉",
    title: "Sound Effects",
    desc: "Generate any SFX from one sentence. Footsteps, explosions, UI clicks, ambient noise — powered by ElevenLabs.",
  },
  {
    icon: "⬡",
    title: "Browser Studio",
    desc: "Fine-tune in your browser. Reverb, EQ, delay, loop points, BPM — everything WaveSurfer, zero installs.",
  },
  {
    icon: "↻",
    title: "Seamless Loops",
    desc: "Every track is engineered for perfect looping. Adjust BPM with pitch-preserving playback. Export for Unity, Unreal, or any engine.",
  },
  {
    icon: "⊞",
    title: "Cloud Library",
    desc: "All generations and uploads in one organized space. Favorite tracks, create collections, share publicly or keep private.",
  },
];

export const STEPS = [
  {
    n: "01",
    title: "Describe or Drop",
    desc: "Type your scene or drag a game screenshot. Our AI understands mood, genre, tempo and context.",
  },
  {
    n: "02",
    title: "AI Composes",
    desc: "Beatoven or Sonauto generates your track while you work. Queue multiple generations at once.",
  },
  {
    n: "03",
    title: "Export & Ship",
    desc: "Download WAV or OGG, or open in Studio for final tweaks. Loop points, BPM, effects — all in browser.",
  },
];

export const PROVIDERS = [
  { name: "Beatoven",   desc: "Music generation", col: "#7C3AED" },
  { name: "Sonauto",    desc: "Music generation", col: "#0EA5E9" },
  { name: "ElevenLabs", desc: "Sound effects",    col: "#F59E0B" },
  { name: "Gemini",     desc: "Vision + AI mix",  col: "#10B981" },
];

export const MOCK_PROMPTS = [
  "Dark ambient dungeon crawl, ominous strings, distant drums...",
  "Epic boss battle, orchestral, intense percussion, rising tension...",
  "Peaceful village morning, flute melody, birds chirping, warm...",
  "Cyberpunk city chase, electronic, fast bass, synth leads...",
];
