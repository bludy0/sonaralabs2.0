/**
 * DAW Studio tasarım tokenları — tüm değerler CSS değişkenine bağlıdır.
 * Web uygulamasındaki ThemeProvider :root'a --daw-* değişkenlerini enjekte
 * eder ve bu dosya her tema değişikliğinde otomatik güncellenir.
 */
export const C = {
  // Yüzeyler
  bgDeep:       'var(--daw-deep)',
  bgBase:       'var(--daw-base)',
  bgRaised:     'var(--daw-raised)',
  bgSubtle:     'var(--daw-subtle)',
  bgHover:      'var(--daw-hover)',
  bgSelected:   'var(--daw-selected)',

  // Kenarlıklar
  border:       'var(--daw-border)',
  borderDim:    'var(--daw-border-dim)',

  // Vurgu
  accent:       'var(--daw-accent)',
  accentBright: 'var(--daw-accent-bright)',
  accentDim:    'var(--daw-accent-dim)',
  onAccent:     'var(--daw-accent-on)',

  // Durum renkleri
  success:      'var(--daw-success)',
  successDim:   'var(--daw-success-dim)',
  warning:      'var(--daw-warning)',
  warningDim:   'var(--daw-warning-dim)',
  error:        'var(--daw-error)',
  errorContainer:'var(--daw-error-cont)',

  // Metin
  text1:        'var(--daw-text1)',
  text2:        'var(--daw-text2)',
  text3:        'var(--daw-text3)',

  // Oynatma görselleri
  playhead:     'var(--daw-playhead)',
  loopBg:       'var(--daw-loop-bg)',
  loopBorder:   'var(--daw-loop-border)',

  // Gölge & overlay — açık/koyu tema için farklı değerler (CSS cascade)
  shadowSm:     'var(--daw-shadow)',
  shadowLg:     'var(--daw-shadow-lg)',
  overlay:      'var(--daw-overlay)',

  // Piyano tuşları — açık temada siyah tuşlar koyu kalır
  pianoWhite:   'var(--daw-piano-white)',
  pianoBlack:   'var(--daw-piano-black)',
} as const

// ── Yardımcı: şeffaflık varyantı ──────────────────────────────────────────────
/**
 * CSS değişkeni veya hex renk için şeffaflık varyantı döndürür.
 *
 * - CSS var  → color-mix(in srgb, var(...) pct%, transparent)   (geçerli CSS)
 * - Hex renk → '#rrggbb' + 2 hex basamak alpha                   (8-digit hex)
 *
 * Kullanım: alpha(C.accent, 12)  ≈  eski hatalı `${C.accent}20` pattern'inin düzeltmesi
 */
export function alpha(color: string, pct: number): string {
  if (color.startsWith('var(')) {
    return `color-mix(in srgb, ${color} ${pct}%, transparent)`
  }
  // Hex renk (#rrggbb veya #rgb)
  const a = Math.round((pct / 100) * 255).toString(16).padStart(2, '0')
  return color + a
}

// Track renkleri — yüksek doygunluk, hızlı tanıma
export const TRACK_COLORS = [
  '#2ae500',   // neon green
  '#00dbe9',   // cyan
  '#ffba20',   // amber
  '#ff4a6a',   // hot pink/red
  '#c678dd',   // purple
  '#61afef',   // blue
  '#ff8c29',   // orange
  '#79ff5b',   // light green
] as const

export const DEFAULTS = {
  BPM:              120,
  VOLUME:           0.8,
  MASTER_VOLUME:    0.85,
  SAMPLE_RATE:      44100,
  PIXELS_PER_SECOND:80,
  MIN_ZOOM:         20,
  MAX_ZOOM:         400,
  SNAP_GRID:        0.25,
  MAX_TRACKS:       16,
} as const
