import { useState, useEffect, useRef, useCallback } from "react";
import { AxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { useGenerationStore } from "../store/useGenerationStore";
import { useAuthStore } from "../store/useAuthStore";
import { useGenerationSSE } from "../hooks/useGenerationSSE";
import AudioEditor from "../components/AudioEditor";
import { api } from "../lib/api";
import { stripTags } from "../lib/sanitize";
import type { MusicProvider, MusicStyle, MusicMood, GenerationDuration, SseStatusEvent } from "@sonaralabs/types";
import { MUSIC_CREDIT_COST as CREDIT_COST } from "@sonaralabs/types";
import { GenerationCard } from "../components/generation/GenerationCard";
import { SelectField } from "../components/SelectField";
import type { GenerationItem } from "../store/useGenerationStore";
import { useT } from "../store/useI18nStore";

// ── Constants ─────────────────────────────────────────────────────────────────

const STYLES: MusicStyle[]            = ["ambient", "action", "puzzle", "horror", "platformer"];
const MOODS:  MusicMood[]             = ["tense", "calm", "epic", "mysterious", "cheerful"];
const DURATIONS: GenerationDuration[] = [15, 30, 60];

interface Capabilities { music: { beatoven: boolean; sonauto: boolean }; }
const ALL_PROVIDERS: { value: MusicProvider; label: string; badge?: string }[] = [
  { value: "beatoven", label: "Beatoven" },
  { value: "sonauto",  label: "Sonauto"  },
];

const MAX_IMAGE_BYTES     = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type Mode = "music" | "sfx";
type Tab  = "prompt" | "image";

// ── Waveform bars helper ──────────────────────────────────────────────────────


export default function GeneratePage() {
  const navigate = useNavigate();
  const t = useT();
  const { items, isGenerating, generate, generateSFX, analyzeImage, retry, removeItem, handleSSEEvent, fetchHistory } =
    useGenerationStore();
  const { user, updateCredit } = useAuthStore();

  const [mode, setMode] = useState<Mode>("music");
  const [tab, setTab]   = useState<Tab>("prompt");

  const [prompt, setPrompt]     = useState("");
  const [style, setStyle]       = useState<MusicStyle>("ambient");
  const [mood, setMood]         = useState<MusicMood>("calm");
  const [duration, setDuration] = useState<GenerationDuration>(30);
  const [provider, setProvider] = useState<MusicProvider>("beatoven");

  const [sfxPrompt, setSfxPrompt]     = useState("");
  const [sfxDuration, setSfxDuration] = useState<number | "">("");

  const [imageFile, setImageFile]           = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing]       = useState(false);
  const [imageError, setImageError]         = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editorUrl,     setEditorUrl]     = useState<string | null>(null);
  const [formError,     setFormError]     = useState<string | null>(null);
  const [capabilities,  setCapabilities]  = useState<Capabilities | null>(null);

  const availableProviders = capabilities
    ? ALL_PROVIDERS.filter(p => capabilities.music[p.value as keyof typeof capabilities.music])
    : ALL_PROVIDERS;

  const creditCost = CREDIT_COST[provider]?.[duration] ?? 0;

  const onSSEStatus = useCallback((event: SseStatusEvent) => handleSSEEvent(event), [handleSSEEvent]);
  useGenerationSSE({ onStatus: onSSEStatus });
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    api.get("/api/generate/capabilities")
      .then(r => setCapabilities(r.data.data ?? r.data))
      .catch(() => {}); // hata olursa tüm provider'lar gösterilir
  }, []);

  // Eğer seçili provider artık mevcut değilse birinciye geç
  useEffect(() => {
    if (availableProviders.length && !availableProviders.find(p => p.value === provider)) {
      setProvider(availableProviders[0].value);
    }
  }, [availableProviders, provider]);

  // ── Image handling ─────────────────────────────────────────────────────────

  function processFile(file: File) {
    setImageError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError(t.generate.imageOnly);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(t.generate.imageSize);
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      setIsAnalyzing(true);
      try {
        const generatedPrompt = await analyzeImage(base64, file.type);
        setPrompt(generatedPrompt);
      } catch {
        setImageError(t.generate.imageAnalysisFailed);
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Submit handlers ────────────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const cleanPrompt = stripTags(prompt.trim())
    if (!cleanPrompt) { setFormError(t.generate.enterPrompt); return; }
    try {
      await generate({ prompt: cleanPrompt, provider, style, mood, duration });
      updateCredit(-creditCost);
      setPrompt("");
    } catch (err) {
      const msg = (err as AxiosError<{ error?: string }>).response?.data?.error
        ?? (err as Error).message ?? t.generate.generationFailed;
      setFormError(msg);
    }
  }

  async function handleGenerateSFX(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const cleanSfxPrompt = stripTags(sfxPrompt.trim())
    if (!cleanSfxPrompt) { setFormError(t.generate.sfxEnterPrompt); return; }
    const durSec = sfxDuration !== "" ? Number(sfxDuration) : undefined;
    if (durSec !== undefined && (durSec < 0.5 || durSec > 22)) {
      setFormError(t.generate.sfxDurationRange);
      return;
    }
    try {
      await generateSFX({ prompt: cleanSfxPrompt, durationSeconds: durSec });
      updateCredit(-1);
      setSfxPrompt("");
      setSfxDuration("");
    } catch (err) {
      const msg = (err as AxiosError<{ error?: string }>).response?.data?.error
        ?? (err as Error).message ?? t.generate.sfxFailed;
      setFormError(msg);
    }
  }

  async function handleRetry(generationId: string) {
    const item = items.find(i => i._id === generationId);
    if (!item) return;
    try {
      await retry(generationId);
      const retryCost = item.type === "sfx"
        ? 1
        : Math.ceil((CREDIT_COST[item.provider as MusicProvider]?.[item.duration ?? 30] ?? 5) / 2);
      updateCredit(-retryCost);
    } catch { /* card stays in failed state */ }
  }

  function handleOpenInStudio(item: GenerationItem) {
    if (!item.audioUrl) return;
    const name = item.prompt.slice(0, 40);
    sessionStorage.setItem("studio:preload", JSON.stringify([{ name, audioUrl: item.audioUrl }]));
    navigate("/studio");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>

      {/* ── LEFT PANEL — Form ──────────────────────────────────────────────── */}
      <div
        className="w-[450px] shrink-0 flex flex-col border-r overflow-y-auto"
        style={{ borderColor: "var(--bg-input)", background: "var(--bg-page)" }}
      >
        {/* Panel header */}
        <div className="px-7 pt-8 pb-6">
          <p className="text-[10px] font-semibold tracking-[0.25em] uppercase mb-1" style={{ color: "var(--text-2)" }} lang="en">
            SONARALABS / STUDIO
          </p>
          <h1
            className="text-2xl font-bold uppercase leading-none"
            style={{ letterSpacing: "-0.01em", color: "var(--text-1)" }}
            lang="en"
          >
            Initialize<br />Generation_
          </h1>
          {user && (
            <div className="mt-3 flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-2)" }} lang="en">
                {user.creditBalance} credits available
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-7 h-px mb-6" style={{ background: "var(--bg-input)" }} />

        <div className="px-7 flex-1 space-y-6">

          {/* Mode tabs — Music / SFX */}
          <div
            className="flex rounded-lg p-1"
            style={{ background: "var(--bg-card)" }}
          >
            {(["music", "sfx"] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setFormError(null); }}
                className="flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all duration-100"
                style={
                  mode === m
                    ? { background: "var(--accent)", color: "var(--accent-on)" }
                    : { background: "transparent", color: "var(--text-3)" }
                }
              >
                {m === "music" ? t.generate.tabMusic : t.generate.tabSfxMode}
              </button>
            ))}
          </div>

          {/* ── MUSIC FORM ── */}
          {mode === "music" && (
            <>
              {/* Sub-tabs: prompt / image */}
              <div className="flex gap-4 border-b" style={{ borderColor: "var(--bg-input)" }}>
                {(["prompt", "image"] as Tab[]).map(tabVal => (
                  <button
                    key={tabVal}
                    type="button"
                    onClick={() => setTab(tabVal)}
                    className="pb-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all duration-100"
                    style={{
                      color: tab === tabVal ? "var(--accent)" : "var(--text-3)",
                      borderBottom: tab === tabVal ? "2px solid var(--accent)" : "2px solid transparent",
                      marginBottom: -1,
                    }}
                  >
                    {tabVal === "prompt" ? t.generate.tabPrompt : t.generate.tabImage}
                  </button>
                ))}
              </div>

              <form onSubmit={handleGenerate} className="space-y-5">

                {/* Image upload zone */}
                {tab === "image" && (
                  <div className="space-y-3">
                    {!imageFile ? (
                      <div
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
                        onDragOver={e => e.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed h-36 cursor-pointer transition-all duration-100 text-center px-4"
                        style={{ borderColor: "var(--text-3)", background: "var(--bg-card)" }}
                        role="button"
                        aria-label={t.generate.imageUploadLabel}
                      >
                        <span className="material-symbols-outlined mb-2" style={{ fontSize: 28, color: "var(--text-3)" }}>
                          image
                        </span>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          Drag & drop or <span style={{ color: "var(--accent)" }}>browse</span>
                        </p>
                        <p className="text-[10px] mt-1" style={{ color: "var(--text-3)" }}>PNG, JPG, WEBP — max 10 MB</p>
                      </div>
                    ) : (
                      <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: "var(--bg-input)" }}>
                        <img src={imagePreviewUrl!} alt="Screenshot preview" className="w-full h-36 object-cover" />
                        <button
                          type="button"
                          onClick={clearImage}
                          className="absolute top-2 right-2 rounded-full w-7 h-7 flex items-center justify-center text-sm transition-all duration-100"
                          style={{ background: "rgba(0,0,0,0.7)", color: "var(--text-2)" }}
                        >
                          &times;
                        </button>
                        {isAnalyzing && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
                            <span className="text-xs tracking-widest uppercase animate-pulse" style={{ color: "var(--accent)" }}>
                              {t.generate.promptAnalyzing}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                      className="hidden"
                    />
                    {imageError && (
                      <p className="text-[11px] rounded px-3 py-2" style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}>
                        {imageError}
                      </p>
                    )}
                  </div>
                )}

                {/* Prompt textarea */}
                <div className="space-y-1.5">
                  <label
                    className="block text-[9px] font-bold tracking-[0.2em] uppercase"
                    style={{ color: "var(--text-3)" }}
                    htmlFor="prompt-input"
                  >
                    {tab === "image" ? t.generate.promptLabelImage : t.generate.promptLabel}
                  </label>
                  <textarea
                    id="prompt-input"
                    data-testid="prompt-input"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder={
                      tab === "prompt"
                        ? t.generate.promptHint
                        : isAnalyzing
                        ? t.generate.promptAnalyzing
                        : t.generate.promptHintImage
                    }
                    rows={4}
                    className="w-full rounded-lg px-4 py-3 text-sm resize-none outline-none transition-all duration-100"
                    style={{
                      background: "var(--bg-card)",
                      color: "var(--text-1)",
                      border: "1px solid var(--bg-border)",
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onBlur={e => (e.currentTarget.style.borderColor = "var(--bg-input)")}
                  />
                </div>

                {/* Parameter selects — 2×2 grid */}
                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    id="style-select"
                    label={t.generate.style}
                    value={style}
                    onChange={v => setStyle(v as MusicStyle)}
                    options={STYLES.map(s => ({ value: s, label: s }))}
                  />
                  <SelectField
                    id="mood-select"
                    label={t.generate.mood}
                    value={mood}
                    onChange={v => setMood(v as MusicMood)}
                    options={MOODS.map(m => ({ value: m, label: m }))}
                  />
                  <SelectField
                    id="duration-select"
                    label={t.generate.duration}
                    value={String(duration)}
                    onChange={v => setDuration(Number(v) as GenerationDuration)}
                    options={DURATIONS.map(d => ({ value: String(d), label: `${d}s` }))}
                  />
                  <SelectField
                    id="provider-select"
                    label={t.generate.provider}
                    value={provider}
                    onChange={v => setProvider(v as MusicProvider)}
                    options={availableProviders.map(p => ({ value: p.value, label: p.label }))}
                  />
                </div>

                {provider === "sonauto" && (
                  <p
                    className="text-[10px] rounded px-3 py-2 leading-relaxed"
                    style={{ background: "color-mix(in srgb, var(--accent) 6%, transparent)", color: "var(--text-3)" }}
                  >
                    {t.generate.sonautoNote}
                  </p>
                )}

                {formError && (
                  <p className="text-[11px] rounded px-3 py-2" style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}>
                    {formError}
                  </p>
                )}

                {/* Generate button */}
                <button
                  type="submit"
                  data-testid="generate-btn"
                  disabled={isGenerating || isAnalyzing}
                  className="w-full rounded-lg py-3.5 text-sm font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-on)",
                    boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)",
                  }}
                  onMouseEnter={e => !isGenerating && !isAnalyzing && ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 28px color-mix(in srgb, var(--accent) 50%, transparent)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)")}
                >
                  {isGenerating ? (
                    <>
                      <span
                        className="h-4 w-4 rounded-full border-2 animate-spin"
                        style={{ borderColor: "color-mix(in srgb, var(--accent-on) 30%, transparent)", borderTopColor: "var(--accent-on)" }}
                      />
                      {t.generate.generating}
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>graphic_eq</span>
                      {t.generate.generateBtn}
                      <span
                        className="rounded px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: "color-mix(in srgb, var(--accent-on) 20%, transparent)" }}
                      >
                        {creditCost} cr
                      </span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* ── SFX FORM ── */}
          {mode === "sfx" && (
            <div className="space-y-5">
              {/* Coming Soon banner */}
              <div
                className="rounded-lg px-4 py-5 flex flex-col items-center gap-3 text-center"
                style={{ background: "var(--bg-card)", border: "1px dashed var(--bg-border)" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 32, color: "var(--text-3)" }}
                >
                  surround_sound
                </span>
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-2)" }}>
                    {t.generate.sfxComingSoon}
                  </p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-3)" }}>
                    {t.generate.sfxComingSoonDesc}
                  </p>
                </div>
                <span
                  className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest"
                  style={{ background: "var(--bg-input)", color: "var(--text-3)" }}
                >
                  {t.common.noResults}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Padding at the bottom */}
        <div className="h-8" />
      </div>

      {/* ── RIGHT PANEL — Queue ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Queue header */}
        <div className="px-7 pt-8 pb-6 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.25em] uppercase mb-1" style={{ color: "var(--text-2)" }} lang="en">
                REALTIME
              </p>
              <h2
                className="text-xl font-bold uppercase"
                style={{ letterSpacing: "-0.01em", color: "var(--text-1)" }}
                lang="en"
              >
                Active Stream_Queue
              </h2>
            </div>
            {/* Queue count indicator */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: "var(--bg-card)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: items.some(i => i.status === "processing") ? "var(--accent)" : "var(--text-3)" }}
              />
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-2)" }} lang="en">
                {items.length} {t.generate.queueJobs}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-7 h-px shrink-0" style={{ background: "var(--bg-input)" }} />

        {/* Generation cards list */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--bg-border)" }}>
                graphic_eq
              </span>
              <p className="text-[11px] uppercase tracking-widest text-center" style={{ color: "var(--text-3)" }}>
                {t.generate.noHistory}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <GenerationCard
                  key={item._id}
                  item={item}
                  onOpenEditor={setEditorUrl}
                  onRetry={handleRetry}
                  onRemove={removeItem}
                  onOpenInStudio={handleOpenInStudio}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editorUrl && <AudioEditor audioUrl={editorUrl} onClose={() => setEditorUrl(null)} />}
    </div>
  );
}
