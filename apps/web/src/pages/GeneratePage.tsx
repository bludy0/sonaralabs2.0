// frontend/src/pages/GeneratePage.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { AxiosError } from "axios";
import { useGenerationStore, GenerationItem } from "../store/useGenerationStore";
import { useAuthStore } from "../store/useAuthStore";
import { useGenerationSSE } from "../hooks/useGenerationSSE";
import AudioEditor from "../components/AudioEditor";
import type { MusicProvider, MusicStyle, MusicMood, GenerationDuration, SseStatusEvent } from "@sonaralabs/types";

// ── Credit cost table ─────────────────────────────────────────────────────────

const CREDIT_COST: Record<string, Record<number, number>> = {
  beatoven:  { 15: 3, 30: 5, 60: 8 },
  lyria:     { 15: 2, 30: 3, 60: 5 },
  stability: { 15: 2, 30: 3, 60: 5 },
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STYLES: MusicStyle[]         = ["ambient", "action", "puzzle", "horror", "platformer"];
const MOODS:  MusicMood[]          = ["tense", "calm", "epic", "mysterious", "cheerful"];
const DURATIONS: GenerationDuration[] = [15, 30, 60];
const PROVIDERS: MusicProvider[]   = ["beatoven", "lyria"];

const MAX_IMAGE_BYTES  = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type Tab = "prompt" | "image";

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: GenerationItem["status"] }) {
  const colorMap: Record<GenerationItem["status"], string> = {
    pending:    "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    processing: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    done:       "bg-green-500/20 text-green-300 border-green-500/40",
    failed:     "bg-red-500/20 text-red-300 border-red-500/40",
  };
  return (
    <span
      data-testid="generation-status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorMap[status]}`}
    >
      {status === "processing" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
      )}
      {status}
    </span>
  );
}

// ── Generation card ───────────────────────────────────────────────────────────

interface GenerationCardProps {
  item: GenerationItem;
  onOpenEditor: (url: string) => void;
  onRetry: (id: string) => void;
}

function GenerationCard({ item, onOpenEditor, onRetry }: GenerationCardProps) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      await onRetry(item._id);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <article className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 hover:border-white/20 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-white/90 line-clamp-2 flex-1 leading-relaxed">
          {item.prompt}
        </p>
        <StatusBadge status={item.status} />
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
        <span className="capitalize rounded bg-white/5 px-2 py-0.5">{item.provider}</span>
        <span className="capitalize rounded bg-white/5 px-2 py-0.5">{item.style}</span>
        <span className="capitalize rounded bg-white/5 px-2 py-0.5">{item.mood}</span>
        <span className="rounded bg-white/5 px-2 py-0.5">{item.duration}s</span>
        <span className="rounded bg-white/5 px-2 py-0.5">{item.creditCost} cr</span>
        {item.isImageGeneration && (
          <span className="rounded bg-purple-500/20 text-purple-300 px-2 py-0.5">from image</span>
        )}
      </div>

      {/* Actions */}
      {item.status === "done" && item.audioUrl && (
        <button
          onClick={() => onOpenEditor(item.audioUrl!)}
          className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 transition-colors"
        >
          Open in Editor
        </button>
      )}

      {item.status === "failed" && (
        <div className="space-y-2">
          {item.failReason && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
              {item.failReason}
            </p>
          )}
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full rounded-lg border border-white/20 hover:border-white/40 text-white/70 hover:text-white text-sm font-medium py-2 transition-colors disabled:opacity-50"
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}
    </article>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  // Stores
  const { items, isGenerating, generate, analyzeImage, retry, handleSSEEvent, fetchHistory } =
    useGenerationStore();
  const { user, updateCredit } = useAuthStore();

  // Tab
  const [tab, setTab] = useState<Tab>("prompt");

  // Shared form state
  const [prompt, setPrompt]     = useState("");
  const [style, setStyle]       = useState<MusicStyle>("ambient");
  const [mood, setMood]         = useState<MusicMood>("calm");
  const [duration, setDuration] = useState<GenerationDuration>(30);
  const [provider, setProvider] = useState<MusicProvider>("lyria");

  // Image tab state
  const [imageFile, setImageFile]             = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing]         = useState(false);
  const [imageError, setImageError]           = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editor modal
  const [editorUrl, setEditorUrl] = useState<string | null>(null);

  // Form error
  const [formError, setFormError] = useState<string | null>(null);

  // Computed credit cost
  const creditCost = CREDIT_COST[provider][duration];

  // SSE
  const onSSEStatus = useCallback(
    (event: SseStatusEvent) => handleSSEEvent(event),
    [handleSSEEvent]
  );
  useGenerationSSE({ onStatus: onSSEStatus });

  // Fetch history on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Image handling ──────────────────────────────────────────────────────────

  function processFile(file: File) {
    setImageError(null);

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError("Only PNG, JPG and WEBP images are allowed.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Image must be smaller than 10 MB.");
      return;
    }

    setImageFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImagePreviewUrl(objectUrl);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // dataUrl format: "data:<mime>;base64,<data>"
      const base64 = dataUrl.split(",")[1];
      setIsAnalyzing(true);
      try {
        const generatedPrompt = await analyzeImage(base64, file.type);
        setPrompt(generatedPrompt);
      } catch {
        setImageError("Image analysis failed. You can still type a prompt manually.");
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function clearImage() {
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Generate submit ─────────────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!prompt.trim()) {
      setFormError("Please enter a prompt.");
      return;
    }

    try {
      await generate({ prompt: prompt.trim(), provider, style, mood, duration });
      updateCredit(-creditCost);
      setPrompt("");
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      const msg =
        axiosErr.response?.data?.error ??
        (axiosErr.message || "Generation failed. Please try again.");
      setFormError(msg);
    }
  }

  // ── Retry handler ───────────────────────────────────────────────────────────

  async function handleRetry(generationId: string) {
    const item = items.find((i) => i._id === generationId);
    if (!item) return;
    try {
      await retry(generationId);
      const retryCost = Math.ceil(CREDIT_COST[item.provider][item.duration] / 2);
      updateCredit(-retryCost);
    } catch {
      // Card stays in failed state — no additional error handling needed
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Generate Music</h1>
            <p className="text-sm text-white/50 mt-1">
              Create AI-powered game music loops in seconds.
            </p>
          </div>
          {user && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">
              <span className="text-white/50">Credits: </span>
              <span className="font-semibold text-indigo-300">{user.creditBalance}</span>
            </div>
          )}
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-6">

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-white/5 p-1 w-fit">
            {(["prompt", "image"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-indigo-600 text-white shadow"
                    : "text-white/50 hover:text-white"
                }`}
              >
                From {t === "prompt" ? "Prompt" : "Image"}
              </button>
            ))}
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">

            {/* Image upload zone — only visible in image tab */}
            {tab === "image" && (
              <div className="space-y-3">
                {!imageFile ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer transition-colors h-40 text-center px-4"
                    role="button"
                    aria-label="Upload game screenshot"
                  >
                    <svg
                      className="w-8 h-8 text-white/30 mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-sm text-white/50">
                      Drag & drop or{" "}
                      <span className="text-indigo-400 underline">browse</span>
                    </p>
                    <p className="text-xs text-white/30 mt-1">PNG, JPG, WEBP — max 10 MB</p>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    <img
                      src={imagePreviewUrl!}
                      alt="Screenshot preview"
                      className="w-full h-40 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      className="absolute top-2 right-2 rounded-full bg-black/60 text-white/70 hover:text-white w-7 h-7 flex items-center justify-center text-sm transition-colors"
                      aria-label="Remove image"
                    >
                      &times;
                    </button>
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-sm text-white animate-pulse">
                          Analyzing image...
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {imageError && (
                  <p className="text-sm text-red-400 bg-red-500/10 rounded px-3 py-2">
                    {imageError}
                  </p>
                )}
              </div>
            )}

            {/* Prompt textarea */}
            <div className="space-y-1.5">
              <label
                className="text-sm text-white/60"
                htmlFor="prompt-input"
              >
                {tab === "image" ? "Generated prompt (editable)" : "Prompt"}
              </label>
              <textarea
                id="prompt-input"
                data-testid="prompt-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  tab === "prompt"
                    ? "e.g. A tense 8-bit dungeon theme with heavy drums..."
                    : isAnalyzing
                    ? "Analyzing image..."
                    : "Upload an image to auto-generate a prompt, or type one manually."
                }
                rows={3}
                className="w-full rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 px-4 py-3 text-sm text-white placeholder-white/30 resize-none outline-none transition-colors"
              />
            </div>

            {/* Selects row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label
                  className="text-xs text-white/50 uppercase tracking-wide"
                  htmlFor="style-select"
                >
                  Style
                </label>
                <select
                  id="style-select"
                  data-testid="style-select"
                  value={style}
                  onChange={(e) => setStyle(e.target.value as MusicStyle)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-indigo-500 px-3 py-2 text-sm text-white outline-none"
                >
                  {STYLES.map((s) => (
                    <option key={s} value={s} className="bg-[#1a1a2e] capitalize">
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-xs text-white/50 uppercase tracking-wide"
                  htmlFor="mood-select"
                >
                  Mood
                </label>
                <select
                  id="mood-select"
                  data-testid="mood-select"
                  value={mood}
                  onChange={(e) => setMood(e.target.value as MusicMood)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-indigo-500 px-3 py-2 text-sm text-white outline-none"
                >
                  {MOODS.map((m) => (
                    <option key={m} value={m} className="bg-[#1a1a2e] capitalize">
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-xs text-white/50 uppercase tracking-wide"
                  htmlFor="duration-select"
                >
                  Duration
                </label>
                <select
                  id="duration-select"
                  data-testid="duration-select"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) as GenerationDuration)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-indigo-500 px-3 py-2 text-sm text-white outline-none"
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d} className="bg-[#1a1a2e]">
                      {d}s
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-xs text-white/50 uppercase tracking-wide"
                  htmlFor="provider-select"
                >
                  Provider
                </label>
                <select
                  id="provider-select"
                  data-testid="provider-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as MusicProvider)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-indigo-500 px-3 py-2 text-sm text-white outline-none"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p} className="bg-[#1a1a2e] capitalize">
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Form error */}
            {formError && (
              <p className="text-sm text-red-400 bg-red-500/10 rounded px-3 py-2">
                {formError}
              </p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              data-testid="generate-btn"
              disabled={isGenerating || isAnalyzing}
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-normal">
                    {creditCost} credits
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Generation history */}
        {items.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white/80">History</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <GenerationCard
                  key={item._id}
                  item={item}
                  onOpenEditor={setEditorUrl}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          </section>
        ) : (
          <div className="text-center py-16 text-white/30 text-sm">
            No generations yet. Create your first music loop above.
          </div>
        )}
      </div>

      {/* Audio editor modal */}
      {editorUrl && (
        <AudioEditor audioUrl={editorUrl} onClose={() => setEditorUrl(null)} />
      )}
    </div>
  );
}
