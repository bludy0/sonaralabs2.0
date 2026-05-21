import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import {
  useThemeStore, PRESET_THEMES,
  UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP, UI_SCALE_DEFAULT,
  type Theme, type ThemeVars,
} from "../store/useThemeStore";
import { useI18nStore, LANGUAGES, useT } from "../store/useI18nStore";
import { api } from "../lib/api";
import { C } from "../theme";

// ── Renk token grupları ───────────────────────────────────────────────────────
const COLOR_GROUPS: { label: string; keys: (keyof ThemeVars)[] }[] = [
  { label: "Web · Backgrounds", keys: ["--bg-page","--bg-card","--bg-input","--bg-border","--bg-mid","--bg-bright"] },
  { label: "Web · Text",        keys: ["--text-1","--text-2","--text-3"] },
  { label: "Web · Accent",      keys: ["--accent","--accent-on","--accent-dim","--success","--error","--teal"] },
  { label: "DAW · Surfaces",    keys: ["--daw-deep","--daw-base","--daw-subtle","--daw-hover","--daw-selected","--daw-border"] },
  { label: "DAW · Accent",      keys: ["--daw-accent","--daw-accent-bright","--daw-accent-dim","--daw-accent-on"] },
  { label: "DAW · Status / Text", keys: ["--daw-success","--daw-warning","--daw-error","--daw-text1","--daw-text2","--daw-text3","--daw-playhead"] },
];

const THEME_EMOJIS = ["🎨","🌈","✨","🎯","🔥","💎","🌟","🎵","🎸","🌙","🌞","🍀"];

// ── Custom tema editörü ───────────────────────────────────────────────────────
function CustomThemeEditor({
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

// ── Bölüm başlığı ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.2em",
        textTransform: "uppercase", color: C.text3,
        marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
      }}>{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, color: C.text1 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Tema kartı ────────────────────────────────────────────────────────────────
function ThemeCard({
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

// ── Yeni tema oluştur modalı ──────────────────────────────────────────────────
function CreateThemeModal({ onClose }: { onClose: () => void }) {
  const { createTheme } = useThemeStore();
  const t = useT();
  const [name,    setName]    = useState("");
  const [emoji,   setEmoji]   = useState("🎨");
  const [baseId,  setBaseId]  = useState(PRESET_THEMES[0].id);
  const [showEmoji, setShowEmoji] = useState(false);

  function handleCreate() {
    if (!name.trim()) return;
    createTheme(name.trim(), emoji, baseId);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.cardBg, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "24px", width: 360,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text1, marginBottom: 18 }}>
          {t.settings.newTheme}
        </h3>

        {/* İsim + Emoji */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {/* Emoji seçici */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowEmoji(v => !v)} style={{
              fontSize: 22, background: C.inputBg, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 10px", cursor: "pointer",
            }}>{emoji}</button>
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
                    style={{ fontSize: 18, background: emoji === e ? C.inputBg : "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 4 }}
                  >{e}</button>
                ))}
              </div>
            )}
          </div>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder={t.settings.themeName}
            autoFocus
            style={{
              flex: 1, background: C.inputBg, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 12px", fontSize: 14,
              fontWeight: 600, color: C.text1, outline: "none",
            }}
          />
        </div>

        {/* Temel preset */}
        <p style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>{t.settings.startFromPreset}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          {PRESET_THEMES.map(t => (
            <button key={t.id} onClick={() => setBaseId(t.id)}
              style={{
                padding: "5px 10px", borderRadius: 7, fontSize: 11,
                background: baseId === t.id ? `${t.vars["--accent"]}20` : C.inputBg,
                color:      baseId === t.id ? t.vars["--accent"] : C.text2,
                border: `1.5px solid ${baseId === t.id ? t.vars["--accent"] : C.border}`,
                cursor: "pointer",
              }}
            >
              {t.emoji} {t.name}
            </button>
          ))}
        </div>

        {/* Butonlar */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 13,
            background: "none", color: C.text2,
            border: `1px solid ${C.border}`, cursor: "pointer",
          }}>{t.common.cancel}</button>
          <button onClick={handleCreate} style={{
            padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: C.accent, color: C.accentOn, border: "none", cursor: "pointer",
          }}>{t.settings.themeCreateEdit}</button>
        </div>
      </div>
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const t = useT();
  const { user, logout, logoutAll } = useAuthStore();
  const { themeId, setTheme, customThemes, deleteTheme, uiScale, setUiScale } = useThemeStore();
  const { lang, setLang } = useI18nStore();

  const [editingTheme,  setEditingTheme]  = useState<Theme | null>(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [passOld,       setPassOld]       = useState("");
  const [passNew,       setPassNew]       = useState("");
  const [passMsg,       setPassMsg]       = useState<string | null>(null);
  const [passSaving,    setPassSaving]    = useState(false);

  const darkPresets  = PRESET_THEMES.filter(t => !t.isLight);
  const lightPresets = PRESET_THEMES.filter(t => t.isLight);

  // Düzenlenecek temayı güncel store'dan al
  const editingThemeLive = editingTheme
    ? customThemes.find(t => t.id === editingTheme.id) ?? editingTheme
    : null;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passNew.trim() || !passOld.trim()) return;
    setPassSaving(true); setPassMsg(null);
    try {
      await api.patch("/api/users/me/password", { oldPassword: passOld, newPassword: passNew });
      setPassMsg(t.settings.saved);
      setPassOld(""); setPassNew("");
    } catch {
      setPassMsg(t.settings.changePasswordFailed);
    } finally {
      setPassSaving(false);
      setTimeout(() => setPassMsg(null), 3000);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: C.inputBg, border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12, color: C.text1, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 740, margin: "0 auto", padding: "32px 24px", color: C.text1 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 32 }}>{t.settings.title}</h1>

      {/* ── Görünüm ─────────────────────────────────────────────────────── */}
      <Section title={t.settings.appearance}>

        {/* Karanlık temalar */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 10, color: C.text3, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            {t.settings.darkThemes}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {darkPresets.map(theme => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={themeId === theme.id}
                onSelect={() => { setTheme(theme.id); setEditingTheme(null); }}
              />
            ))}
          </div>
        </div>

        {/* Açık temalar */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 10, color: C.text3, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            {t.settings.lightThemes}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {lightPresets.map(theme => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={themeId === theme.id}
                onSelect={() => { setTheme(theme.id); setEditingTheme(null); }}
              />
            ))}
          </div>
        </div>

        {/* Custom temalar */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 10 }}>
            <p style={{ fontSize: 10, color: C.text3, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {t.settings.customThemes}
            </p>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 11,
                background: `${C.accent}18`, color: C.accent,
                border: `1px solid ${C.accent}50`, cursor: "pointer",
              }}
            >
              {t.settings.newTheme}
            </button>
          </div>

          {customThemes.length === 0 ? (
            <p style={{ fontSize: 12, color: C.text3 }}>
              {t.settings.noCustomThemes}
            </p>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {customThemes.map(theme => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  active={themeId === theme.id}
                  onSelect={() => { setTheme(theme.id); setEditingTheme(null); }}
                  onEdit={() => setEditingTheme(theme)}
                  onDelete={() => {
                    if (window.confirm(`Delete "${theme.name}"?`)) deleteTheme(theme.id);
                  }}
                />
              ))}
            </div>
          )}

          {/* Editör */}
          {editingThemeLive && (
            <CustomThemeEditor
              theme={editingThemeLive}
              onClose={() => setEditingTheme(null)}
            />
          )}
        </div>

        {/* Arayüz Boyutu */}
        <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, color: C.text1 }}>{t.settings.uiScale}</p>
              <p style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{t.settings.uiScaleHint}</p>
            </div>
            {/* Mevcut değer göstergesi */}
            <div style={{
              minWidth: 52, textAlign: "center",
              padding: "4px 10px", borderRadius: 8,
              background: C.accent + "20",
              border: `1.5px solid ${C.accent}60`,
            }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
                {Math.round((uiScale ?? UI_SCALE_DEFAULT) * 100)}%
              </span>
            </div>
          </div>

          {/* Slider + −/+ butonları */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Azalt */}
            <button
              onClick={() => setUiScale((uiScale ?? UI_SCALE_DEFAULT) - UI_SCALE_STEP)}
              disabled={(uiScale ?? UI_SCALE_DEFAULT) <= UI_SCALE_MIN}
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: C.inputBg, border: `1px solid ${C.border}`,
                color: C.text2, cursor: "pointer", fontSize: 18, lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: (uiScale ?? UI_SCALE_DEFAULT) <= UI_SCALE_MIN ? 0.35 : 1,
              }}
            >−</button>

            {/* Range slider */}
            <div style={{ flex: 1, position: "relative" }}>
              <input
                type="range"
                min={Math.round(UI_SCALE_MIN * 100)}
                max={Math.round(UI_SCALE_MAX * 100)}
                step={Math.round(UI_SCALE_STEP * 100)}
                value={Math.round((uiScale ?? UI_SCALE_DEFAULT) * 100)}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  setUiScale(v / 100);
                  // Dolu kısım rengi için CSS değişkeni güncelle
                  const pct = ((v - Math.round(UI_SCALE_MIN * 100)) /
                    (Math.round(UI_SCALE_MAX * 100) - Math.round(UI_SCALE_MIN * 100))) * 100;
                  e.currentTarget.style.setProperty("--range-pct", String(Math.round(pct)));
                }}
                ref={el => {
                  // İlk render'da dolu kısmı doğru ayarla
                  if (el) {
                    const v = Math.round((uiScale ?? UI_SCALE_DEFAULT) * 100);
                    const pct = ((v - Math.round(UI_SCALE_MIN * 100)) /
                      (Math.round(UI_SCALE_MAX * 100) - Math.round(UI_SCALE_MIN * 100))) * 100;
                    el.style.setProperty("--range-pct", String(Math.round(pct)));
                  }
                }}
                style={{
                  width: "100%",
                  cursor: "pointer",
                }}
              />
              {/* Tick marks */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, padding: "0 1px" }}>
                {[70, 80, 90, 100, 110, 120, 130, 140].map(v => (
                  <span
                    key={v}
                    style={{
                      fontSize: 9, color: Math.round((uiScale ?? 1) * 100) === v ? C.accent : C.text3,
                      fontWeight: Math.round((uiScale ?? 1) * 100) === v ? 700 : 400,
                      cursor: "pointer", userSelect: "none",
                    }}
                    onClick={() => setUiScale(v / 100)}
                  >{v}%</span>
                ))}
              </div>
            </div>

            {/* Artır */}
            <button
              onClick={() => setUiScale((uiScale ?? UI_SCALE_DEFAULT) + UI_SCALE_STEP)}
              disabled={(uiScale ?? UI_SCALE_DEFAULT) >= UI_SCALE_MAX}
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: C.inputBg, border: `1px solid ${C.border}`,
                color: C.text2, cursor: "pointer", fontSize: 18, lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: (uiScale ?? UI_SCALE_DEFAULT) >= UI_SCALE_MAX ? 0.35 : 1,
              }}
            >+</button>
          </div>

          {/* Hızlı presetler */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {[
              { label: t.settings.scaleSmall,  pct: 85 },
              { label: t.settings.scaleNormal,  pct: 100 },
              { label: t.settings.scaleLarge,   pct: 115 },
              { label: t.settings.scaleXLarge,  pct: 130 },
            ].map(({ label, pct }) => {
              const active = Math.round((uiScale ?? UI_SCALE_DEFAULT) * 100) === pct;
              return (
                <button
                  key={pct}
                  onClick={() => setUiScale(pct / 100)}
                  style={{
                    padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: active ? 700 : 400,
                    background: active ? C.accent + "20" : C.inputBg,
                    color:      active ? C.accent : C.text3,
                    border: `1.5px solid ${active ? C.accent + "60" : C.border}`,
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >
                  {label} <span style={{ opacity: 0.65 }}>({pct}%)</span>
                </button>
              );
            })}
            {/* Sıfırla */}
            {Math.round((uiScale ?? UI_SCALE_DEFAULT) * 100) !== 100 && (
              <button
                onClick={() => setUiScale(UI_SCALE_DEFAULT)}
                style={{
                  padding: "5px 12px", borderRadius: 7, fontSize: 11,
                  background: "none", color: C.text3,
                  border: `1.5px solid ${C.border}`,
                  cursor: "pointer", marginLeft: "auto",
                }}
              >
                {t.settings.scaleReset}
              </button>
            )}
          </div>
        </div>

        {/* Dil seçici */}
        <Row label={t.settings.language}>
          <div style={{ display: "flex", gap: 6 }}>
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => setLang(l.code)}
                style={{
                  padding: "6px 14px", borderRadius: 8,
                  background: lang === l.code ? C.accent : C.inputBg,
                  color:      lang === l.code ? C.accentOn : C.text2,
                  border: `1px solid ${lang === l.code ? C.accent : C.border}`,
                  cursor: "pointer", fontSize: 12, fontWeight: lang === l.code ? 700 : 400,
                }}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* ── Hesap ───────────────────────────────────────────────────────── */}
      <Section title={t.settings.account}>
        <Row label={t.settings.email} sub={user?.email}>
          <span style={{ fontSize: 11, color: C.text3 }}>{user?.role}</span>
        </Row>
        <div style={{ paddingTop: 16 }}>
          <p style={{ fontSize: 12, color: C.text2, marginBottom: 10 }}>{t.settings.changePass}</p>
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="password" placeholder={t.settings.currentPassword} value={passOld}
              onChange={e => setPassOld(e.target.value)} style={inputStyle} autoComplete="current-password" />
            <input type="password" placeholder={t.settings.newPasswordPlaceholder} value={passNew}
              onChange={e => setPassNew(e.target.value)} style={inputStyle} autoComplete="new-password" />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="submit" disabled={passSaving} style={{
                padding: "8px 18px", borderRadius: 8, background: C.accent,
                color: C.accentOn, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                opacity: passSaving ? 0.6 : 1,
              }}>
                {passSaving ? t.settings.saving : t.common.save}
              </button>
              {passMsg && <span style={{ fontSize: 12, color: passMsg.includes("✓") ? C.success : C.error }}>{passMsg}</span>}
            </div>
          </form>
        </div>
      </Section>

      {/* ── Güvenlik ────────────────────────────────────────────────────── */}
      <Section title={t.settings.security}>
        <Row label={t.settings.logoutAll} sub={t.settings.logoutAllSub}>
          <button onClick={() => logoutAll()} style={{
            padding: "6px 14px", borderRadius: 8, background: C.inputBg,
            color: C.text2, border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 12,
          }}>
            {t.settings.logoutAll}
          </button>
        </Row>
      </Section>

      {/* ── Tehlikeli Bölge ─────────────────────────────────────────────── */}
      <Section title={t.settings.dangerZone}>
        <Row label={t.settings.deleteAccount} sub={t.settings.deleteAccountSub}>
          <button
            onClick={() => {
              if (window.confirm(t.settings.deleteAccountConfirm)) {
                api.delete("/api/users/me").then(() => logout()).catch(() => {});
              }
            }}
            style={{
              padding: "6px 14px", borderRadius: 8,
              background: `${C.error}18`, color: C.error,
              border: `1px solid ${C.error}50`, cursor: "pointer", fontSize: 12,
            }}
          >
            {t.settings.deleteAccount}
          </button>
        </Row>
      </Section>

      {/* Modal */}
      {showCreate && <CreateThemeModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
