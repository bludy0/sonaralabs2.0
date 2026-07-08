import { useState, useEffect, useRef, useCallback } from "react";
import { AxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { useGenerationStore } from "../store/useGenerationStore";
import { useAuthStore } from "../store/useAuthStore";
import { useGenerationSSE } from "../hooks/useGenerationSSE";
import AudioEditor from "../components/AudioEditor";
import { api } from "../lib/api";
import { stripTags } from "../lib/sanitize";
import type { MusicProvider, MusicStyle, MusicMood, GenerationDuration, MusicKey, MusicScale, TimeSignature, SseStatusEvent } from "@sonaralabs/types";
import { MUSIC_CREDIT_COST as CREDIT_COST } from "@sonaralabs/types";
import { GenerationCard } from "../components/generation/GenerationCard";
import { SelectField } from "../components/SelectField";
import type { GenerationItem } from "../store/useGenerationStore";
import { useT } from "../store/useI18nStore";
import { toast } from "../lib/toast";

// ── Constants ─────────────────────────────────────────────────────────────────

// Tür (genre) seçenekleri — oyun müziğine yönelik. value = MusicStyle slug.
const STYLES: { value: MusicStyle; label: string }[] = [
  { value: "ambient",    label: "Ambient" },
  { value: "action",     label: "Action" },
  { value: "adventure",  label: "Adventure" },
  { value: "puzzle",     label: "Puzzle" },
  { value: "horror",     label: "Horror" },
  { value: "platformer", label: "Platformer" },
  { value: "orchestral", label: "Orchestral" },
  { value: "chiptune",   label: "Chiptune (8-bit)" },
  { value: "synthwave",  label: "Synthwave" },
  { value: "fantasy",    label: "Fantasy / RPG" },
  { value: "boss",       label: "Boss Battle" },
  { value: "racing",     label: "Racing" },
  { value: "scifi",      label: "Sci-Fi" },
  { value: "lofi",       label: "Lo-Fi" },
  { value: "medieval",   label: "Medieval" },
  { value: "cyberpunk",  label: "Cyberpunk" },
  { value: "western",    label: "Western" },
  { value: "jrpg",       label: "JRPG" },
];
const MOODS: { value: MusicMood; label: string }[] = [
  { value: "tense",       label: "Tense" },
  { value: "calm",        label: "Calm" },
  { value: "epic",        label: "Epic" },
  { value: "mysterious",  label: "Mysterious" },
  { value: "cheerful",    label: "Cheerful" },
  { value: "heroic",      label: "Heroic" },
  { value: "melancholic", label: "Melancholic" },
  { value: "dark",        label: "Dark" },
  { value: "energetic",   label: "Energetic" },
  { value: "dreamy",      label: "Dreamy" },
  { value: "playful",     label: "Playful" },
  { value: "triumphant",  label: "Triumphant" },
];
const DURATIONS: GenerationDuration[] = [15, 30, 60];

const KEYS: { value: MusicKey; label: string }[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
].map(k => ({ value: k as MusicKey, label: k }));

const SCALES: { value: MusicScale; label: string }[] = [
  { value: "Major",       label: "Major" },
  { value: "Minor",       label: "Minor" },
  { value: "Dorian",      label: "Dorian" },
  { value: "Phrygian",    label: "Phrygian" },
  { value: "Lydian",      label: "Lydian" },
  { value: "Mixolydian",  label: "Mixolydian" },
];

const TIME_SIGNATURES: { value: string; label: string; sig: TimeSignature }[] = [
  { value: "3/4", label: "3/4", sig: [3, 4] },
  { value: "4/4", label: "4/4", sig: [4, 4] },
  { value: "6/8", label: "6/8", sig: [6, 8] },
];

interface Capabilities { music: { beatoven: boolean; sonauto: boolean; stableaudio?: boolean; lyria?: boolean }; }
// closed: API'si şu an kullanılamıyor (örn. geçersiz key) → "Geçici olarak kapalı".
// Geçerli key gelince ilgili satırdan `closed: true` kaldır.
const ALL_PROVIDERS: { value: MusicProvider; label: string; comingSoon?: boolean; closed?: boolean }[] = [
  { value: "stableaudio", label: "Stable Audio" },
  { value: "beatoven",    label: "Beatoven", closed: true },
  { value: "sonauto",     label: "Sonauto",  closed: true },
  { value: "lyria",       label: "Lyria",    comingSoon: true },
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
  const [loop, setLoop]         = useState(true);   // kusursuz döngü (oyun loop'u) — varsayılan açık
  const [provider, setProvider] = useState<MusicProvider>("stableaudio");
  const [bpm, setBpm]           = useState<number>(120);
  const [key, setKey]           = useState<MusicKey>("C");
  const [scale, setScale]       = useState<MusicScale>("Minor");
  const [timeSignature, setTimeSignature] = useState<TimeSignature>([4, 4]);
  const [intensity, setIntensity] = useState<number>(0.5);

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
  const [advancedOpen,  setAdvancedOpen]  = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("generate-advanced-open");
    return saved ? saved === "true" : true;
  });

  // Provider durumu: ok = seçilebilir | closed = geçici kapalı | soon = yakında.
  // Tüm provider'lar listede görünür; kullanılamayanlar disabled + etiketli olur.
  type ProviderStatus = "ok" | "closed" | "soon";
  const providerStatus = (p: typeof ALL_PROVIDERS[number]): ProviderStatus => {
    if (p.comingSoon) return "soon";
    if (p.closed)     return "closed";
    if (capabilities && !capabilities.music[p.value as keyof typeof capabilities.music]) return "closed";
    return "ok";
  };

  const creditCost = CREDIT_COST[provider]?.[duration] ?? 0;

  const onSSEStatus = useCallback((event: SseStatusEvent) => handleSSEEvent(event), [handleSSEEvent]);
  useGenerationSSE({ onStatus: onSSEStatus });
  useEffect(() => {
    fetchHistory().catch(() => toast(t.generate.generationFailed, "error"));
  }, [fetchHistory]);

  // ── Polling fallback ───────────────────────────────────────────────────────
  // SSE birincil kanal; ama bir event kaçarsa (servis yeniden başlatma, ağ
  // kesintisi, çoklu sekme) kart "kuyrukta" durumunda takılı kalabilir.
  // Aktif (pending/processing) iş olduğu sürece geçmişi periyodik çekerek
  // terminal duruma (done/failed) geçişi garanti altına alıyoruz.
  const hasActiveJob = items.some(i => i.status === "pending" || i.status === "processing");
  useEffect(() => {
    if (!hasActiveJob) return;
    const id = setInterval(() => { fetchHistory().catch(() => {}); }, 6000);
    return () => clearInterval(id);
  }, [hasActiveJob, fetchHistory]);

  useEffect(() => {
    api.get("/api/generate/capabilities")
      .then(r => setCapabilities(r.data.data ?? r.data))
      .catch(() => {}); // hata olursa tüm provider'lar gösterilir
  }, []);

  useEffect(() => {
    localStorage.setItem("generate-advanced-open", String(advancedOpen));
  }, [advancedOpen]);

  // Seçili provider kullanılamıyorsa (kapalı/yakında) ilk kullanılabilir olana geç
  useEffect(() => {
    const current = ALL_PROVIDERS.find(p => p.value === provider);
    if (!current || providerStatus(current) !== "ok") {
      const first = ALL_PROVIDERS.find(p => providerStatus(p) === "ok");
      if (first) setProvider(first.value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities, provider]);

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
      await generate({
        prompt: cleanPrompt, provider, style, mood, duration, loop,
        bpm, key, scale, timeSignature, intensity,
      });
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
    } catch (err) {
      const msg = (err as AxiosError<{ error?: string }>).response?.data?.error
        ?? (err as Error).message;
      toast(msg || t.generate.generationFailed, "error");
    }
  }

  async function handleOpenInStudio(item: GenerationItem) {
    if (!item.audioUrl) return;
    const name = item.prompt.slice(0, 40);
    try {
      const { data } = await api.post("/api/library/projects", {
        name,
        tracks: [],
        bpm: item.bpm ?? 120,
        loopEnabled: item.isLoop ?? false,
        loopStart: 0,
        loopEnd: item.duration ?? 8,
      });
      const projectId = data.data?._id ?? data.data?.id;
      sessionStorage.setItem("studio:preload", JSON.stringify([{ name, audioUrl: item.audioUrl, projectId }]));
      navigate(`/studio?projectId=${projectId}`);
    } catch {
      // Fallback: open without project
      sessionStorage.setItem("studio:preload", JSON.stringify([{ name, audioUrl: item.audioUrl }]));
      navigate("/studio");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col md:flex-row h-full min-h-screen" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>

      {/* ── LEFT PANEL — Form ──────────────────────────────────────────────── */}
      <div
        className="w-full md:w-[450px] shrink-0 flex flex-col border-b md:border-b-0 md:border-r overflow-y-auto"
        style={{ borderColor: "var(--bg-input)", background: "var(--bg-page)" }}
      >
        {/* Panel header */}
        <div className="px-5 md:px-7 pt-8 pb-6">
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
        <div className="mx-5 md:mx-7 h-px mb-6" style={{ background: "var(--bg-input)" }} />

        <div className="px-5 md:px-7 flex-1 space-y-6">

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
                    options={STYLES.map(s => ({ value: s.value, label: s.label }))}
                  />
                  <SelectField
                    id="mood-select"
                    label={t.generate.mood}
                    value={mood}
                    onChange={v => setMood(v as MusicMood)}
                    options={MOODS.map(m => ({ value: m.value, label: m.label }))}
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
                    options={ALL_PROVIDERS.map(p => {
                      const st = providerStatus(p);
                      const suffix = st === "soon"   ? ` (${t.generate.providerComingSoon})`
                                   : st === "closed" ? ` (${t.generate.providerClosed})`
                                   : "";
                      return { value: p.value, label: `${p.label}${suffix}`, disabled: st !== "ok" };
                    })}
                  />
                </div>

                {/* Advanced parameters — BPM / Key / Scale / Time Signature / Intensity */}
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors"
                    style={{ background: "var(--bg-input)" }}
                    aria-expanded={advancedOpen}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                      {t.generate.advancedParams}
                    </span>
                    <span
                      className="material-symbols-outlined transition-transform duration-200"
                      style={{ fontSize: 18, color: "var(--text-3)", transform: advancedOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      expand_more
                    </span>
                  </button>

                  {advancedOpen && (
                    <div className="p-3 space-y-4" style={{ background: "var(--bg-card)" }}>
                      <div className="grid grid-cols-2 gap-3">
                        {/* BPM */}
                        <div className="space-y-1.5">
                          <label
                            htmlFor="bpm-input"
                            className="block text-[9px] font-bold tracking-[0.2em] uppercase"
                            style={{ color: "var(--text-3)" }}
                          >
                            BPM
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              id="bpm-input"
                              type="number"
                              min={40}
                              max={300}
                              value={bpm}
                              onChange={e => {
                                const v = Number(e.target.value);
                                if (!isNaN(v)) setBpm(Math.max(40, Math.min(300, v)));
                              }}
                              className="w-full rounded-lg px-3 py-2.5 text-xs font-medium outline-none transition-all duration-100"
                              style={{ background: "var(--bg-input)", color: "var(--text-1)", border: "none" }}
                              onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 1px var(--accent)")}
                              onBlur={e => (e.currentTarget.style.boxShadow = "none")}
                            />
                          </div>
                          <div className="flex gap-1.5">
                            {[90, 120, 128, 140].map(preset => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setBpm(preset)}
                                className="text-[10px] px-2 py-1 rounded transition-colors min-w-[36px]"
                                style={{
                                  background: bpm === preset ? "var(--accent)" : "var(--bg-input)",
                                  color: bpm === preset ? "var(--accent-on)" : "var(--text-3)",
                                }}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>

                        <SelectField
                          id="key-select"
                          label="Key"
                          value={key}
                          onChange={v => setKey(v as MusicKey)}
                          options={KEYS.map(k => ({ value: k.value, label: k.label }))}
                        />

                        <SelectField
                          id="scale-select"
                          label="Scale"
                          value={scale}
                          onChange={v => setScale(v as MusicScale)}
                          options={SCALES.map(s => ({ value: s.value, label: s.label }))}
                        />

                        <SelectField
                          id="time-signature-select"
                          label="Time Signature"
                          value={`${timeSignature[0]}/${timeSignature[1]}`}
                          onChange={v => {
                            const found = TIME_SIGNATURES.find(t => t.value === v);
                            if (found) setTimeSignature(found.sig);
                          }}
                          options={TIME_SIGNATURES.map(t => ({ value: t.value, label: t.label }))}
                        />
                      </div>

                      {/* Intensity slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="intensity-slider"
                            className="block text-[9px] font-bold tracking-[0.2em] uppercase"
                            style={{ color: "var(--text-3)" }}
                          >
                            Intensity
                          </label>
                          <span className="text-[9px] font-mono" style={{ color: "var(--text-2)" }}>
                            {Math.round(intensity * 100)}%
                          </span>
                        </div>
                        <input
                          id="intensity-slider"
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={intensity}
                          onChange={e => setIntensity(Number(e.target.value))}
                          className="w-full accent-current"
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <div className="flex justify-between text-[10px]" style={{ color: "var(--text-3)" }}>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>waves</span>
                            Calm
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>equalizer</span>
                            Balanced
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>bolt</span>
                            Intense
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Loop toggle — kusursuz döngü üretimi (oyun loop'u) */}
                <button
                  type="button"
                  onClick={() => setLoop(v => !v)}
                  aria-pressed={loop}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--bg-border)" }}
                >
                  <span className="flex items-center gap-2 text-left">
                    <span className="material-symbols-outlined" style={{ fontSize: 17, color: loop ? "var(--accent)" : "var(--text-3)" }}>repeat</span>
                    <span>
                      <span className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                        {t.generate.loop}
                      </span>
                      <span className="block text-[9px] tracking-wide" style={{ color: "var(--text-3)" }}>
                        {loop ? t.generate.loopOn : t.generate.loopOff}
                      </span>
                    </span>
                  </span>
                  <span
                    className="relative inline-block shrink-0 rounded-full transition-colors"
                    style={{ width: 38, height: 21, background: loop ? "var(--accent)" : "color-mix(in srgb, var(--text-3) 30%, transparent)" }}
                  >
                    <span
                      className="absolute rounded-full"
                      style={{ width: 15, height: 15, top: 3, left: loop ? 20 : 3, background: "#fff", transition: "left 0.15s ease" }}
                    />
                  </span>
                </button>

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
            <form onSubmit={handleGenerateSFX} className="space-y-5">
              {/* Prompt textarea */}
              <div className="space-y-1.5">
                <label
                  className="block text-[9px] font-bold tracking-[0.2em] uppercase"
                  style={{ color: "var(--text-3)" }}
                  htmlFor="sfx-prompt-input"
                >
                  {t.generate.sfxPromptLabel ?? "SFX Prompt"}
                </label>
                <textarea
                  id="sfx-prompt-input"
                  data-testid="sfx-prompt-input"
                  value={sfxPrompt}
                  onChange={e => setSfxPrompt(e.target.value)}
                  placeholder={t.generate.sfxPromptHint ?? "e.g. sword clang, explosion, magical chime"}
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

              {/* Duration */}
              <div className="space-y-1.5">
                <label
                  className="block text-[9px] font-bold tracking-[0.2em] uppercase"
                  style={{ color: "var(--text-3)" }}
                  htmlFor="sfx-duration-input"
                >
                  {t.generate.sfxDurationLabel ?? "Duration (seconds, optional)"}
                </label>
                <input
                  id="sfx-duration-input"
                  type="number"
                  min={0.5}
                  max={22}
                  step={0.5}
                  value={sfxDuration}
                  onChange={e => {
                    const v = e.target.value === "" ? "" : Number(e.target.value);
                    setSfxDuration(v);
                  }}
                  placeholder="Auto"
                  className="w-full rounded-lg px-3 py-2.5 text-xs font-medium outline-none transition-all duration-100"
                  style={{ background: "var(--bg-input)", color: "var(--text-1)", border: "none" }}
                  onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 1px var(--accent)")}
                  onBlur={e => (e.currentTarget.style.boxShadow = "none")}
                />
                <p className="text-[9px]" style={{ color: "var(--text-3)" }}>
                  {t.generate.sfxDurationHint ?? "Leave empty for automatic length. Max 22s."}
                </p>
              </div>

              {formError && (
                <p className="text-[11px] rounded px-3 py-2" style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}>
                  {formError}
                </p>
              )}

              <button
                type="submit"
                data-testid="sfx-generate-btn"
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
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>surround_sound</span>
                    {t.generate.sfxGenerateBtn ?? "Generate SFX"}
                    <span
                      className="rounded px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: "color-mix(in srgb, var(--accent-on) 20%, transparent)" }}
                    >
                      1 cr
                    </span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Padding at the bottom */}
        <div className="h-8" />
      </div>

      {/* ── RIGHT PANEL — Queue ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:overflow-hidden">

        {/* Queue header */}
        <div className="px-5 md:px-7 pt-8 pb-6 shrink-0">
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
        <div className="mx-5 md:mx-7 h-px shrink-0" style={{ background: "var(--bg-input)" }} />

        {/* Generation cards list */}
        <div className="flex-1 md:overflow-y-auto px-5 md:px-7 py-6">
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
