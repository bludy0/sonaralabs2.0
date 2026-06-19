import { useState } from "react";
import { useThemeStore, type Theme, type ThemeVars } from "../../store/useThemeStore";
import { useT } from "../../store/useI18nStore";
import { C } from "../../theme";
import { THEME_EMOJIS } from "./themeConstants";

// ── Renk token grupları ───────────────────────────────────────────────────────
const COLOR_GROUPS: { label: string; keys: (keyof ThemeVars)[] }[] = [
  { label: "Web · Backgrounds", keys: ["--bg-page","--bg-card","--bg-input","--bg-border","--bg-mid","--bg-bright"] },
  { label: "Web · Text",        keys: ["--text-1","--text-2","--text-3"] },
  { label: "Web · Accent",      keys: ["--accent","--accent-on","--accent-dim","--success","--error","--teal"] },
  { label: "DAW · Surfaces",    keys: ["--daw-deep","--daw-base","--daw-subtle","--daw-hover","--daw-selected","--daw-border"] },
  { label: "DAW · Accent",      keys: ["--daw-accent","--daw-accent-bright","--daw-accent-dim","--daw-accent-on"] },
  { label: "DAW · Status / Text", keys: ["--daw-success","--daw-warning","--daw-error","--daw-text1","--daw-text2","--daw-text3","--daw-playhead"] },
];

// ── Custom tema editörü ───────────────────────────────────────────────────────
export function CustomThemeEditor({
  theme, onClose,
}: { theme: Theme; onClose: () => void }) {
  const { updateTheme, renameTheme, setTheme, themeId } = useThemeStore();
  const t = useT();
  const [name,       setName]    = useState(theme.name);
  const [emoji,      setEmoji]   = useState(theme.emoji);
  const [showEmoji,  setShowEmoji] = useState(false);

  const isActive = themeId === theme.id;

  function saveLabel() {
    renameTheme(theme.id, name || "Custom Theme", emoji);
    if (!isActive) setTheme(theme.id);
    onClose();
  }

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 12,
      overflow: "hidden", marginTop: 8,
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    }}>
      {/* Başlık */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: C.inputBg, borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Emoji seçici */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowEmoji(v => !v)}
            style={{
              fontSize: 20, border: "none",
              cursor: "pointer", padding: "2px 6px", borderRadius: 6,
              background: C.cardBg,
            }}
          >
            {emoji}
          </button>
          {showEmoji && (
            <div style={{
              position: "absolute", top: "110%", left: 0, zIndex: 99,
              background: C.cardBg, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: 8,
              display: "flex", flexWrap: "wrap", gap: 4, width: 180,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}>
              {THEME_EMOJIS.map(e => (
                <button key={e} onClick={() => { setEmoji(e); setShowEmoji(false); }}
                  style={{
                    fontSize: 18, background: emoji === e ? C.inputBg : "none",
                    border: "none", cursor: "pointer", padding: 4, borderRadius: 4,
                  }}>{e}</button>
              ))}
            </div>
          )}
        </div>

        {/* İsim */}
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t.settings.themeName}
          style={{
            flex: 1, background: C.cardBg, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "5px 8px", fontSize: 13,
            fontWeight: 600, color: C.text1, outline: "none",
          }}
        />

        {/* Uygula & Kapat */}
        <button
          onClick={saveLabel}
          style={{
            padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: C.accent, color: C.accentOn, border: "none", cursor: "pointer",
          }}
        >
          {isActive ? t.common.save : t.settings.themeApply}
        </button>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: C.text3,
            cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px",
          }}
        >×</button>
      </div>

      {/* Renk token'ları */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        maxHeight: 440, overflowY: "auto",
      }}>
        {COLOR_GROUPS.map(group => (
          <div key={group.label} style={{
            padding: "10px 14px",
            borderRight: `1px solid ${C.border}`,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <p style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: C.text3, marginBottom: 8,
            }}>
              {group.label}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {group.keys.map(key => {
                const val = theme.vars[key] ?? "";
                const isHex = val.startsWith("#");
                return (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                    {/* Renk önizleme + picker */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 4,
                        background: isHex ? val : "repeating-linear-gradient(45deg,#888 0,#888 2px,transparent 0,transparent 50%)",
                        backgroundSize: "4px 4px",
                        border: `1.5px solid ${C.border}`,
                      }} />
                      {isHex && (
                        <input type="color" value={val}
                          onChange={e => updateTheme(theme.id, key, e.target.value)}
                          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                        />
                      )}
                    </div>
                    {/* Token adı (kısa) */}
                    <span style={{ fontSize: 9, color: C.text2, flex: 1, fontFamily: "monospace" }}>
                      {key.replace(/^--(?:daw-)?/, "")}
                    </span>
                    {/* Hex input */}
                    {isHex && (
                      <input type="text" value={val}
                        onChange={e => updateTheme(theme.id, key, e.target.value)}
                        style={{
                          width: 68, background: C.cardBg, border: `1px solid ${C.border}`,
                          borderRadius: 4, padding: "2px 4px", fontSize: 9,
                          color: C.text1, fontFamily: "monospace", outline: "none",
                        }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
