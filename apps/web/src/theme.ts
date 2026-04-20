export const C = {
  // Backgrounds
  pageBg:   "#0e0e0e",
  cardBg:   "#131313",
  inputBg:  "#1f2937",
  border:   "#262626",

  // Text
  textPrimary: "#ffffff",
  textMuted:   "#ababab",
  textDim:     "#484848",

  // Accent (yellow)
  accent:     "#ffdd73",
  accentDark: "#624e00",

  // Status
  success: "#6ec96e",
  error:   "#ff7351",
  teal:    "#64c8b4",
} as const;

export type ThemeColor = typeof C[keyof typeof C];
