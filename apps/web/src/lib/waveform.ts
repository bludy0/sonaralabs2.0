/** Deterministic, varied fallback waveform bars (0–1 normalized).
 *  Produces a more musical-looking shape (intro → build → drop → outro)
 *  from any string seed, so tracks without stored waveformData still look
 *  distinct from each other.
 */
export function fallbackWaveformBars(seed: string, count = 28): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };

  const bars: number[] = [];
  const sections = [
    { len: Math.max(1, Math.floor(count * 0.2)), min: 0.12, max: 0.42 },
    { len: Math.max(1, Math.floor(count * 0.35)), min: 0.28, max: 0.68 },
    { len: Math.max(1, Math.floor(count * 0.25)), min: 0.5, max: 0.95 },
    { len: Math.max(1, count - Math.floor(count * 0.8)), min: 0.18, max: 0.48 },
  ];

  for (const s of sections) {
    for (let i = 0; i < s.len; i++) {
      const base = s.min + rand() * (s.max - s.min);
      // occasional sparse/silence bars for realism
      const sparse = rand() > 0.9 ? 0.08 + rand() * 0.12 : 1;
      bars.push(Math.min(0.98, base * sparse));
    }
  }

  return bars.slice(0, count);
}

/** Pick a stable-but-varied waveform color pair from a seed.
 *  Always returns CSS variable names so it stays theme-aware.
 */
export function waveformColorFromSeed(seed: string): { bar: string; progress: string } {
  const palettes = [
    { bar: "var(--text-3)", progress: "var(--accent)" },
    { bar: "var(--teal)", progress: "var(--accent)" },
    { bar: "var(--text-3)", progress: "var(--teal)" },
    { bar: "var(--accent-dim)", progress: "var(--accent)" },
    { bar: "var(--text-2)", progress: "var(--accent)" },
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palettes[h % palettes.length];
}
