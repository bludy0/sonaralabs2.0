import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Tema değişkenleri ─────────────────────────────────────────────────────────
export interface ThemeVars {
  "--bg-page":    string; "--bg-card":    string; "--bg-mid":     string;
  "--bg-input":   string; "--bg-border":  string; "--bg-bright":  string;
  "--text-1":     string; "--text-2":     string; "--text-3":     string;
  "--accent":     string; "--accent-on":  string; "--accent-dim": string;
  "--success":    string; "--error":      string; "--teal":       string;
  "--daw-deep":         string; "--daw-base":        string;
  "--daw-raised":       string; "--daw-subtle":      string;
  "--daw-hover":        string; "--daw-selected":    string;
  "--daw-border":       string; "--daw-border-dim":  string;
  "--daw-accent":       string; "--daw-accent-bright":string;
  "--daw-accent-dim":   string; "--daw-accent-on":   string;
  "--daw-success":      string; "--daw-success-dim": string;
  "--daw-warning":      string; "--daw-warning-dim": string;
  "--daw-error":        string; "--daw-error-cont":  string;
  "--daw-text1":        string; "--daw-text2":       string; "--daw-text3": string;
  "--daw-playhead":     string;
  "--daw-loop-bg":      string; "--daw-loop-border": string;
}

export interface Theme {
  id:       string;
  name:     string;
  emoji:    string;
  isLight?: boolean;  // açık tema işaretçisi (scrollbar vb. için)
  isCustom?:boolean;
  vars:     ThemeVars;
}

// ── Hazır temalar ─────────────────────────────────────────────────────────────
export const PRESET_THEMES: Theme[] = [
  // ── KARANLIK TEMALAR ──────────────────────────────────────────────────────
  {
    id: "cyber-yellow", name: "Cyber Yellow", emoji: "⚡",
    vars: {
      "--bg-page":"#0e0e0e","--bg-card":"#131313","--bg-mid":"#191919",
      "--bg-input":"#1f2937","--bg-border":"#262626","--bg-bright":"#2c2c2c",
      "--text-1":"#ffffff","--text-2":"#ababab","--text-3":"#484848",
      "--accent":"#ffdc73","--accent-on":"#624e00","--accent-dim":"#2a2100",
      "--success":"#6ec96e","--error":"#ff7351","--teal":"#64c8b4",
      "--daw-deep":"#0e0e0c","--daw-base":"#14140f","--daw-raised":"#1c1b14",
      "--daw-subtle":"#221f14","--daw-hover":"#2a2818","--daw-selected":"#33301f",
      "--daw-border":"#3d3a28","--daw-border-dim":"#1c1b14",
      "--daw-accent":"#e8c840","--daw-accent-bright":"#ffe870",
      "--daw-accent-dim":"#3d3300","--daw-accent-on":"#1a1600",
      "--daw-success":"#2ae500","--daw-success-dim":"#0f6d00",
      "--daw-warning":"#ff9a00","--daw-warning-dim":"#7d3d00",
      "--daw-error":"#ff4a4a","--daw-error-cont":"#5c0000",
      "--daw-text1":"#f2f0e0","--daw-text2":"#c0bc98","--daw-text3":"#807a60",
      "--daw-playhead":"#ff9a00",
      "--daw-loop-bg":"rgba(232,200,64,0.06)","--daw-loop-border":"#e8c840",
    },
  },
  {
    id: "deep-cyan", name: "Deep Cyan", emoji: "🌊",
    vars: {
      "--bg-page":"#0e0e10","--bg-card":"#131315","--bg-mid":"#181719",
      "--bg-input":"#201f21","--bg-border":"#2e3b3c","--bg-bright":"#2a2a2c",
      "--text-1":"#e5e1e4","--text-2":"#b9cacb","--text-3":"#849495",
      "--accent":"#00dbe9","--accent-on":"#002022","--accent-dim":"#003d42",
      "--success":"#2ae500","--error":"#ffb4ab","--teal":"#7df4ff",
      "--daw-deep":"#0e0e10","--daw-base":"#131315","--daw-raised":"#1b1b1d",
      "--daw-subtle":"#201f21","--daw-hover":"#2a2a2c","--daw-selected":"#353437",
      "--daw-border":"#3b494b","--daw-border-dim":"#1b1b1d",
      "--daw-accent":"#00dbe9","--daw-accent-bright":"#7df4ff",
      "--daw-accent-dim":"#004f54","--daw-accent-on":"#002022",
      "--daw-success":"#2ae500","--daw-success-dim":"#0f6d00",
      "--daw-warning":"#ffba20","--daw-warning-dim":"#7d5800",
      "--daw-error":"#ffb4ab","--daw-error-cont":"#93000a",
      "--daw-text1":"#e5e1e4","--daw-text2":"#b9cacb","--daw-text3":"#849495",
      "--daw-playhead":"#ffb4ab",
      "--daw-loop-bg":"rgba(0,219,233,0.06)","--daw-loop-border":"#00dbe9",
    },
  },
  {
    id: "crimson-night", name: "Crimson Night", emoji: "🔴",
    vars: {
      "--bg-page":"#0f0a0c","--bg-card":"#150d0f","--bg-mid":"#1a1012",
      "--bg-input":"#221418","--bg-border":"#2e1a1e","--bg-bright":"#361e22",
      "--text-1":"#f8e8ea","--text-2":"#c9a8ae","--text-3":"#7a5860",
      "--accent":"#ff4a6a","--accent-on":"#ffffff","--accent-dim":"#3d0012",
      "--success":"#6ec96e","--error":"#ffa09a","--teal":"#ff8fab",
      "--daw-deep":"#0f0a0c","--daw-base":"#150d0f","--daw-raised":"#1e1316",
      "--daw-subtle":"#251619","--daw-hover":"#2e1b1f","--daw-selected":"#391f24",
      "--daw-border":"#4a2d32","--daw-border-dim":"#1e1316",
      "--daw-accent":"#ff4a6a","--daw-accent-bright":"#ff8fab",
      "--daw-accent-dim":"#3d0012","--daw-accent-on":"#ffffff",
      "--daw-success":"#2ae500","--daw-success-dim":"#0f6d00",
      "--daw-warning":"#ffba20","--daw-warning-dim":"#7d5800",
      "--daw-error":"#ff8080","--daw-error-cont":"#4a0000",
      "--daw-text1":"#f0e0e4","--daw-text2":"#c8a0a8","--daw-text3":"#886070",
      "--daw-playhead":"#ff4a6a",
      "--daw-loop-bg":"rgba(255,74,106,0.06)","--daw-loop-border":"#ff4a6a",
    },
  },
  {
    id: "forest-dark", name: "Forest Dark", emoji: "🌿",
    vars: {
      "--bg-page":"#090f09","--bg-card":"#0e140e","--bg-mid":"#121a12",
      "--bg-input":"#172017","--bg-border":"#1e3020","--bg-bright":"#233828",
      "--text-1":"#e0f0e0","--text-2":"#a8c4a8","--text-3":"#5a7a5a",
      "--accent":"#2ae500","--accent-on":"#002200","--accent-dim":"#0f3d00",
      "--success":"#7df07d","--error":"#ff7351","--teal":"#64e0b4",
      "--daw-deep":"#090f09","--daw-base":"#0e140e","--daw-raised":"#141e14",
      "--daw-subtle":"#192419","--daw-hover":"#1e2e1e","--daw-selected":"#243824",
      "--daw-border":"#2e4830","--daw-border-dim":"#141e14",
      "--daw-accent":"#2ae500","--daw-accent-bright":"#7df07d",
      "--daw-accent-dim":"#0f3d00","--daw-accent-on":"#002200",
      "--daw-success":"#7df07d","--daw-success-dim":"#1a6d00",
      "--daw-warning":"#ffd020","--daw-warning-dim":"#7d5800",
      "--daw-error":"#ff6060","--daw-error-cont":"#3d0000",
      "--daw-text1":"#dff0df","--daw-text2":"#a0c4a0","--daw-text3":"#607860",
      "--daw-playhead":"#2ae500",
      "--daw-loop-bg":"rgba(42,229,0,0.06)","--daw-loop-border":"#2ae500",
    },
  },
  {
    id: "violet-storm", name: "Violet Storm", emoji: "💜",
    vars: {
      "--bg-page":"#0d0910","--bg-card":"#120e15","--bg-mid":"#17121c",
      "--bg-input":"#1c1524","--bg-border":"#281d35","--bg-bright":"#30253f",
      "--text-1":"#f0e8f5","--text-2":"#c0a8d0","--text-3":"#6a5880",
      "--accent":"#c678dd","--accent-on":"#ffffff","--accent-dim":"#2d1040",
      "--success":"#6ec96e","--error":"#ff7351","--teal":"#a78bdd",
      "--daw-deep":"#0d0910","--daw-base":"#120e15","--daw-raised":"#191420",
      "--daw-subtle":"#1e1828","--daw-hover":"#261d30","--daw-selected":"#2e2438",
      "--daw-border":"#3d2d50","--daw-border-dim":"#191420",
      "--daw-accent":"#c678dd","--daw-accent-bright":"#e0a8f0",
      "--daw-accent-dim":"#2d1040","--daw-accent-on":"#ffffff",
      "--daw-success":"#2ae500","--daw-success-dim":"#0f6d00",
      "--daw-warning":"#ffba20","--daw-warning-dim":"#7d5800",
      "--daw-error":"#ff8080","--daw-error-cont":"#4a0010",
      "--daw-text1":"#ece0f4","--daw-text2":"#baa8c8","--daw-text3":"#807090",
      "--daw-playhead":"#c678dd",
      "--daw-loop-bg":"rgba(198,120,221,0.06)","--daw-loop-border":"#c678dd",
    },
  },

  // ── AÇIK TEMALAR ─────────────────────────────────────────────────────────
  {
    id: "solar-white", name: "Solar White", emoji: "☀️", isLight: true,
    vars: {
      "--bg-page":"#f4f2ed","--bg-card":"#ffffff","--bg-mid":"#ede9e2",
      "--bg-input":"#e4dfd6","--bg-border":"#ccc7bd","--bg-bright":"#bfb9ae",
      "--text-1":"#1a1714","--text-2":"#4a4640","--text-3":"#8a857e",
      "--accent":"#d4880a","--accent-on":"#ffffff","--accent-dim":"#fef3dc",
      "--success":"#267a1e","--error":"#c43000","--teal":"#1a7a6a",
      "--daw-deep":"#e4dfd6","--daw-base":"#ede9e2","--daw-raised":"#f4f2ed",
      "--daw-subtle":"#f9f7f4","--daw-hover":"#ffffff","--daw-selected":"#fffef8",
      "--daw-border":"#ccc7bd","--daw-border-dim":"#ddd9d2",
      "--daw-accent":"#d4880a","--daw-accent-bright":"#f0a020",
      "--daw-accent-dim":"#fef3dc","--daw-accent-on":"#5a3500",
      "--daw-success":"#267a1e","--daw-success-dim":"#d4f0d0",
      "--daw-warning":"#c46000","--daw-warning-dim":"#feecd0",
      "--daw-error":"#c43000","--daw-error-cont":"#fde8e4",
      "--daw-text1":"#1a1714","--daw-text2":"#4a4640","--daw-text3":"#8a857e",
      "--daw-playhead":"#c43000",
      "--daw-loop-bg":"rgba(212,136,10,0.08)","--daw-loop-border":"#d4880a",
    },
  },
  {
    id: "arctic-breeze", name: "Arctic Breeze", emoji: "🧊", isLight: true,
    vars: {
      "--bg-page":"#eef2f7","--bg-card":"#ffffff","--bg-mid":"#e4ecf4",
      "--bg-input":"#d8e4ef","--bg-border":"#c0ceda","--bg-bright":"#b4c4d2",
      "--text-1":"#0e1c2a","--text-2":"#3a526a","--text-3":"#6a8090",
      "--accent":"#0072c6","--accent-on":"#ffffff","--accent-dim":"#d0e8f8",
      "--success":"#1e7a3a","--error":"#c42800","--teal":"#0098b0",
      "--daw-deep":"#d8e4ef","--daw-base":"#e4ecf4","--daw-raised":"#eef2f7",
      "--daw-subtle":"#f4f7fa","--daw-hover":"#ffffff","--daw-selected":"#f0f8ff",
      "--daw-border":"#c0ceda","--daw-border-dim":"#d4dfe9",
      "--daw-accent":"#0072c6","--daw-accent-bright":"#1a90e0",
      "--daw-accent-dim":"#d0e8f8","--daw-accent-on":"#ffffff",
      "--daw-success":"#1e7a3a","--daw-success-dim":"#ccf0dc",
      "--daw-warning":"#c46000","--daw-warning-dim":"#feecd0",
      "--daw-error":"#c42800","--daw-error-cont":"#fde4e0",
      "--daw-text1":"#0e1c2a","--daw-text2":"#3a526a","--daw-text3":"#6a8090",
      "--daw-playhead":"#c42800",
      "--daw-loop-bg":"rgba(0,114,198,0.07)","--daw-loop-border":"#0072c6",
    },
  },
  {
    id: "rose-quartz", name: "Rose Quartz", emoji: "🌸", isLight: true,
    vars: {
      "--bg-page":"#faf2f4","--bg-card":"#ffffff","--bg-mid":"#f4e8ec",
      "--bg-input":"#ecdde3","--bg-border":"#d8c4cc","--bg-bright":"#ccb4be",
      "--text-1":"#2a1018","--text-2":"#624050","--text-3":"#9a7080",
      "--accent":"#c0306a","--accent-on":"#ffffff","--accent-dim":"#fce4ee",
      "--success":"#2a7a40","--error":"#b02020","--teal":"#c060a0",
      "--daw-deep":"#ecd8de","--daw-base":"#f4e8ec","--daw-raised":"#faf2f4",
      "--daw-subtle":"#fdf7f8","--daw-hover":"#ffffff","--daw-selected":"#fff5f8",
      "--daw-border":"#d8c4cc","--daw-border-dim":"#e8d8de",
      "--daw-accent":"#c0306a","--daw-accent-bright":"#e04888",
      "--daw-accent-dim":"#fce4ee","--daw-accent-on":"#ffffff",
      "--daw-success":"#2a7a40","--daw-success-dim":"#ccf0dc",
      "--daw-warning":"#b05000","--daw-warning-dim":"#feecd0",
      "--daw-error":"#b02020","--daw-error-cont":"#fde4e0",
      "--daw-text1":"#2a1018","--daw-text2":"#624050","--daw-text3":"#9a7080",
      "--daw-playhead":"#b02020",
      "--daw-loop-bg":"rgba(192,48,106,0.07)","--daw-loop-border":"#c0306a",
    },
  },
];

// ── Yardımcı: boş custom tema varsayılanı ────────────────────────────────────
export function makeDefaultCustomVars(baseId = "deep-cyan"): ThemeVars {
  return { ...(PRESET_THEMES.find(t => t.id === baseId) ?? PRESET_THEMES[1]).vars };
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface ThemeState {
  themeId:       string;
  customThemes:  Theme[];
  setTheme:      (id: string) => void;
  createTheme:   (name: string, emoji: string, baseId: string) => string;
  updateTheme:   (id: string, key: keyof ThemeVars, value: string) => void;
  renameTheme:   (id: string, name: string, emoji: string) => void;
  deleteTheme:   (id: string) => void;
  getTheme:      () => Theme;
}

let _idCounter = Date.now();

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeId:      "cyber-yellow",
      customThemes: [],

      setTheme: (id) => {
        set({ themeId: id });
        const theme = get().getTheme();
        applyTheme(theme.vars);
      },

      createTheme: (name, emoji, baseId) => {
        const id   = `custom-${++_idCounter}`;
        const base = PRESET_THEMES.find(t => t.id === baseId) ?? PRESET_THEMES[0];
        const newTheme: Theme = {
          id, name, emoji, isCustom: true,
          vars: { ...base.vars },
        };
        set(s => ({ customThemes: [...s.customThemes, newTheme], themeId: id }));
        applyTheme(newTheme.vars);
        return id;
      },

      updateTheme: (id, key, value) => {
        set(s => {
          const themes = s.customThemes.map(t =>
            t.id === id ? { ...t, vars: { ...t.vars, [key]: value } } : t
          );
          if (s.themeId === id) {
            const updated = themes.find(t => t.id === id);
            if (updated) applyTheme(updated.vars);
          }
          return { customThemes: themes };
        });
      },

      renameTheme: (id, name, emoji) => {
        set(s => ({
          customThemes: s.customThemes.map(t =>
            t.id === id ? { ...t, name, emoji } : t
          ),
        }));
      },

      deleteTheme: (id) => {
        set(s => {
          const next = s.customThemes.filter(t => t.id !== id);
          const nextId = s.themeId === id
            ? (next[next.length - 1]?.id ?? "cyber-yellow")
            : s.themeId;
          if (nextId !== s.themeId) {
            const fallback = PRESET_THEMES.find(t => t.id === nextId)
                          ?? next.find(t => t.id === nextId)
                          ?? PRESET_THEMES[0];
            applyTheme(fallback.vars);
          }
          return { customThemes: next, themeId: nextId };
        });
      },

      getTheme: () => {
        const { themeId, customThemes } = get();
        return (
          PRESET_THEMES.find(t => t.id === themeId) ??
          customThemes.find(t => t.id === themeId) ??
          PRESET_THEMES[0]
        );
      },
    }),
    {
      name: "sonaralabs-theme",
      partialize: (s) => ({ themeId: s.themeId, customThemes: s.customThemes }),
    }
  )
);

/** CSS değişkenlerini :root'a enjekte eder */
export function applyTheme(vars: ThemeVars) {
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v as string));
  // Açık tema ise scrollbar renklerini de güncelle
  root.setAttribute("data-theme-light",
    vars["--bg-page"] > "#888" ? "true" : "false"
  );
}
