/**
 * Web app tasarım tokenları — tüm değerler CSS değişkenine bağlıdır.
 * ThemeProvider :root'taki değişkenleri değiştirerek tüm renkleri günceller.
 */
export const C = {
  // Yüzeyler
  pageBg:   "var(--bg-page)",
  cardBg:   "var(--bg-card)",
  midBg:    "var(--bg-mid)",
  inputBg:  "var(--bg-input)",
  border:   "var(--bg-border)",
  brightBg: "var(--bg-bright)",

  // Alias'lar — bazı componentler eski isimleri kullanıyor
  bgBase:   "var(--bg-card)",
  bgSubtle: "var(--bg-mid)",
  bgHover:  "var(--bg-bright)",

  // Metin
  text1: "var(--text-1)",
  text2: "var(--text-2)",
  text3: "var(--text-3)",

  // Vurgu
  accent:       "var(--accent)",
  accentBright: "var(--accent)",
  accentOn:     "var(--accent-on)",
  accentDark:   "var(--accent-dim)",

  // Durum
  success: "var(--success)",
  warning: "var(--teal)",   // teal = uyarı tonunda yeterli, ayrı var eklenene kadar
  error:   "var(--error)",
  teal:    "var(--teal)",
} as const;

export type ThemeToken = keyof typeof C;
