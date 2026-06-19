import { useState } from "react";
import type { Theme } from "../../store/useThemeStore";
import { C } from "../../theme";

// ── Tema kartı ────────────────────────────────────────────────────────────────
export function ThemeCard({
  theme, active, onSelect, onEdit, onDelete,
}: {
  theme: Theme; active: boolean;
  onSelect: () => void;
  onEdit?:  () => void;
  onDelete?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const accentColor = theme.vars["--accent"];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        onClick={onSelect}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
          padding: "10px 14px", borderRadius: 10, minWidth: 88,
          background: active ? `${accentColor}20` : C.cardBg,
          border: `2px solid ${active ? accentColor : C.border}`,
          cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
        }}
      >
        {/* Renk önizleme noktaları */}
        <div style={{ display: "flex", gap: 3 }}>
          {(["--accent", "--bg-card", "--bg-input"] as const).map(v => (
            <div key={v} style={{
              width: 12, height: 12, borderRadius: "50%",
              background: theme.vars[v],
              border: `1.5px solid ${theme.vars["--bg-border"]}`,
            }} />
          ))}
        </div>
        <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", color: active ? accentColor : C.text2 }}>
          {theme.emoji} {theme.name}
        </span>
        {theme.isLight && (
          <span style={{ fontSize: 8, color: C.text3, letterSpacing: "0.05em" }}>LIGHT</span>
        )}
        {active && <span style={{ fontSize: 9, color: accentColor }}>✓</span>}
      </button>

      {/* Düzenle / Sil butonları (sadece custom temalar) */}
      {theme.isCustom && hovered && (
        <div style={{
          position: "absolute", top: 4, right: 4,
          display: "flex", gap: 2,
        }}>
          {onEdit && (
            <button onClick={e => { e.stopPropagation(); onEdit(); }}
              style={{
                width: 18, height: 18, borderRadius: 4, fontSize: 10,
                background: C.inputBg, border: `1px solid ${C.border}`,
                color: C.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >✏️</button>
          )}
          {onDelete && (
            <button onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{
                width: 18, height: 18, borderRadius: 4, fontSize: 10,
                background: C.inputBg, border: `1px solid ${C.border}`,
                color: C.error, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          )}
        </div>
      )}
    </div>
  );
}
