import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import type { GenerationItem } from "../../store/useGenerationStore";
import { useT } from "../../store/useI18nStore";
import { toast } from "../../lib/toast";
import MiniWaveformPlayer from "./MiniWaveformPlayer";

// İndirilebilir dosya formatları (kaynak WAV → FFmpeg ile dönüştürülür)
const DOWNLOAD_FORMATS = ["wav", "mp3", "ogg", "flac"] as const;
type DownloadFormat = typeof DOWNLOAD_FORMATS[number];

// ── Estimated processing durations (seconds) by provider + track length ───────
const ESTIMATED_DURATION: Record<string, Record<number, number>> = {
  beatoven:  { 15: 35,  30: 55,  60: 95  },
  lyria:     { 15: 25,  30: 40,  60: 70  },
  sonauto:   { 15: 95,  30: 95,  60: 95  },
};
const SFX_ESTIMATED = 12;

function getEstimated(item: GenerationItem): number {
  if (item.type === "sfx") return SFX_ESTIMATED;
  const dur = item.duration ?? 30;
  return ESTIMATED_DURATION[item.provider]?.[dur] ?? 60;
}

// ── Time format helpers ───────────────────────────────────────────────────────
function fmtTime(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

/** Her zaman m:ss biçimi (oynatıcı zaman göstergesi için). */
function fmtClock(secs: number): string {
  if (!isFinite(secs) || secs < 0) secs = 0;
  const s = Math.floor(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── Pipeline step indicators ──────────────────────────────────────────────────
type PipelineStatus = "pending" | "processing" | "done" | "failed";

function PipelineSteps({ status, t }: { status: PipelineStatus; t: ReturnType<typeof useT> }) {
  const PIPELINE_STEPS = [
    { key: "pending",    label: t.generate.pipelineQueued   },
    { key: "processing", label: t.generate.pipelineAiWork   },
    { key: "done",       label: t.generate.pipelineComplete },
  ] as const;

  const activeIdx =
    status === "pending"    ? 0 :
    status === "processing" ? 1 :
    status === "done"       ? 2 : -1; // failed → no step highlighted

  return (
    <div className="flex items-center gap-0" style={{ marginBottom: 6 }}>
      {PIPELINE_STEPS.map((step, i) => {
        const isPast   = i < activeIdx;
        const isCurrent = i === activeIdx;
        const isFailed  = status === "failed";

        const color =
          isFailed && i <= 1 ? "var(--error)" :
          isPast              ? "var(--success)" :
          isCurrent           ? "var(--accent)" :
                                "var(--text-3)";

        const bgColor =
          isFailed && i <= 1 ? "color-mix(in srgb, var(--error) 12%, transparent)" :
          isPast              ? "color-mix(in srgb, var(--success) 10%, transparent)" :
          isCurrent           ? "color-mix(in srgb, var(--accent) 12%, transparent)" :
                                "var(--bg-input)";

        return (
          <div key={step.key} className="flex items-center">
            {/* Step box */}
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded"
              style={{ background: bgColor, border: `1px solid ${isCurrent || isPast ? color : "transparent"}`, transition: "all 0.3s" }}
            >
              {/* Icon */}
              <span style={{ fontSize: 9, color, lineHeight: 1 }}>
                {isFailed && i <= 1 ? "✕" :
                 isPast             ? "✓" :
                 isCurrent          ? "▶" : "○"}
              </span>
              <span
                className="text-[8px] font-bold tracking-[0.12em] uppercase"
                style={{ color }}
              >
                {step.label}
              </span>
              {/* Pulsing dot for current active step */}
              {isCurrent && !isFailed && (
                <span
                  className="h-1 w-1 rounded-full animate-pulse"
                  style={{ background: color, flexShrink: 0 }}
                />
              )}
            </div>
            {/* Connector line */}
            {i < PIPELINE_STEPS.length - 1 && (
              <div
                className="w-4 h-px mx-0.5"
                style={{
                  background: isPast
                    ? "var(--success)"
                    : "color-mix(in srgb, var(--text-3) 30%, transparent)",
                  transition: "background 0.4s",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Progress bar (time-based) ─────────────────────────────────────────────────
function ProgressBar({
  item, elapsed, estimated, t,
}: {
  item: GenerationItem;
  elapsed: number;
  estimated: number;
  t: ReturnType<typeof useT>;
}) {
  const pct =
    item.status === "pending"    ? null :               // indeterminate for queued
    item.status === "done"       ? 100 :
    item.status === "failed"     ? null :
    Math.min(90, (elapsed / estimated) * 100);          // cap at 90% until SSE "done"

  const remaining = estimated - elapsed;
  const etaLabel  = remaining > 2 ? `~${fmtTime(remaining)}` : t.generate.finalizing;

  return (
    <div className="space-y-1.5">
      {/* Bar */}
      <div
        className="h-0.5 rounded-full overflow-hidden"
        style={{ background: "var(--bg-input)" }}
      >
        {pct === null ? (
          /* indeterminate — pending */
          <div
            className="h-full rounded-full"
            style={{
              background: item.status === "failed"
                ? "var(--error)"
                : "var(--accent)",
              width: "30%",
              animation: "indeterminate-slide 1.5s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            className="h-full rounded-full"
            style={{
              background: pct >= 100 ? "var(--success)" : "var(--accent)",
              width: `${pct}%`,
              transition: "width 1s linear, background 0.4s",
              boxShadow: pct < 100 ? `0 0 8px color-mix(in srgb, var(--accent) 50%, transparent)` : "none",
            }}
          />
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          {item.status === "pending"    ? t.generate.waitingInQueue         :
           item.status === "processing" ? t.generate.aiSynthesis            :
           item.status === "done"       ? t.generate.generationComplete     :
                                          t.generate.generationFailedStatus }
        </span>
        <div className="flex items-center gap-2">
          {/* Elapsed timer */}
          {(item.status === "pending" || item.status === "processing") && (
            <span className="text-[9px] font-mono" style={{ color: "var(--text-3)" }}>
              {fmtTime(elapsed)}
            </span>
          )}
          {/* ETA — only during processing */}
          {item.status === "processing" && remaining > 0 && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                color: "var(--accent)",
              }}
            >
              {etaLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Keyframes injected once ───────────────────────────────────────────────────
let keyframesInjected = false;
function ensureKeyframes() {
  if (keyframesInjected || typeof document === "undefined") return;
  keyframesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes indeterminate-slide {
      0%   { transform: translateX(-100%) scaleX(1); }
      50%  { transform: translateX(120%) scaleX(2.5); }
      100% { transform: translateX(250%) scaleX(1); }
    }
  `;
  document.head.appendChild(style);
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, t }: { status: GenerationItem["status"]; t: ReturnType<typeof useT> }) {
  const configs: Record<GenerationItem["status"], { label: string; bg: string; color: string }> = {
    pending:    { label: t.generate.statusQueued,     bg: "color-mix(in srgb, var(--accent) 10%, transparent)",  color: "var(--accent)" },
    processing: { label: t.generate.statusProcessing, bg: "color-mix(in srgb, var(--accent) 15%, transparent)",  color: "var(--accent)" },
    done:       { label: t.generate.statusSuccess,    bg: "color-mix(in srgb, var(--success) 10%, transparent)", color: "var(--success)" },
    failed:     { label: t.generate.statusFailed,     bg: "color-mix(in srgb, var(--error) 10%, transparent)",   color: "var(--error)" },
  };
  const cfg = configs[status];
  return (
    <span
      data-testid="generation-status"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-[0.15em] uppercase"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {status === "processing" && (
        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
      )}
      {cfg.label}
    </span>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
export interface GenerationCardProps {
  item: GenerationItem;
  onOpenEditor: (url: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenInStudio: (item: GenerationItem) => void;
}

export function GenerationCard({ item, onOpenEditor, onRetry, onRemove, onOpenInStudio }: GenerationCardProps) {
  ensureKeyframes();
  const t = useT();

  const [retrying,    setRetrying]    = useState(false);
  const [removing,    setRemoving]    = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlFormat,    setDlFormat]    = useState<DownloadFormat>("wav");

  // Cached analysis result (BPM / waveform). Once computed, optionally persisted to backend.
  const [analyzed, setAnalyzed] = useState<{ bpm: number; waveformData: number[]; duration: number } | null>(
    item.bpm && item.waveformData ? { bpm: item.bpm, waveformData: item.waveformData, duration: item.duration ?? 0 } : null
  );

  // Track elapsed seconds since creation (anchor = createdAt)
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 1000)
  );

  useEffect(() => {
    if (item.status !== "pending" && item.status !== "processing") return;
    const base = new Date(item.createdAt).getTime();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - base) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [item.status, item.createdAt]);

  const estimated = getEstimated(item);
  const isActive  = item.status === "pending" || item.status === "processing";
  const isSFX     = item.type === "sfx";

  // Pending: add a rough "pending overhead" estimate (~10s BullMQ pickup)
  // so the ETA during processing is relative to actual AI work time
  const processingElapsed = Math.max(0, elapsed - 8);

  async function handleDownload() {
    if (!item.audioUrl) return;
    setDownloading(true);
    try {
      let blob: Blob;
      if (dlFormat === "wav") {
        // Kaynak zaten WAV → doğrudan indir (sunucu/ffmpeg gerekmez)
        blob = await (await fetch(item.audioUrl)).blob();
      } else {
        const { data } = await api.post(
          "/api/generate/export",
          { audioUrl: item.audioUrl, format: dlFormat },
          { responseType: "blob" }
        );
        blob = new Blob([data]);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sonaralabs-${item._id}.${dlFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast(t.generate.downloadFailed, "error");
    } finally {
      setDownloading(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try { await onRetry(item._id); }
    finally { setRetrying(false); }
  }

  async function handleRemove() {
    setRemoving(true);
    try { await onRemove(item._id); }
    finally { setRemoving(false); }
  }

  async function handleAnalysisResult(info: { duration: number; bpm: number; waveformData: number[] }) {
    if (!info.bpm || analyzed) return;
    setAnalyzed(info);
      // Persist to backend so other views (library, publish) can reuse it.
    try {
      await api.patch(`/api/generate/${item._id}/analysis`, {
        bpm: info.bpm,
        waveformData: info.waveformData,
        duration: info.duration,
      });
    } catch {
      // Non-fatal: analysis still works locally even if backend save fails.
    }
  }

  const borderColor =
    item.status === "done"       ? "color-mix(in srgb, var(--success) 30%, transparent)" :
    item.status === "processing" ? "color-mix(in srgb, var(--accent) 30%, transparent)"  :
    item.status === "failed"     ? "color-mix(in srgb, var(--error) 30%, transparent)"   :
                                   "var(--bg-border)";

  return (
    <article
      className="relative rounded-lg overflow-hidden space-y-3 p-4"
      style={{ background: "var(--bg-card)", borderLeft: `2px solid ${borderColor}` }}
    >
      {/* Corner label */}
      <div
        className="absolute top-3 right-3 text-[8px] font-semibold tracking-[0.2em] uppercase"
        style={{ color: "var(--text-3)" }}
      >
        {isSFX ? "SFX_ENGINE" : "AI_MODEL_v2.0"}
      </div>

      {/* Prompt */}
      <p className="text-[12px] leading-relaxed pr-20 line-clamp-2" style={{ color: "var(--text-2)" }}>
        {item.prompt}
      </p>

      {/* Metadata chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.status} t={t} />
        {isSFX ? (
          <span
            className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded"
            style={{ background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" }}
          >
            SFX
          </span>
        ) : (
          <>
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded capitalize"
              style={{ background: "var(--bg-input)", color: "var(--text-3)" }}
            >
              {item.provider}
            </span>
            {item.style && (
              <span
                className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded capitalize"
                style={{ background: "var(--bg-input)", color: "var(--text-3)" }}
              >
                {item.style}
              </span>
            )}
          </>
        )}
        {item.duration != null && (
          <span
            className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "var(--bg-input)", color: "var(--text-3)" }}
          >
            {item.duration}s
          </span>
        )}
        {analyzed?.bpm ? (
          <span
            className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "var(--bg-input)", color: "var(--text-3)" }}
          >
            {analyzed.bpm} BPM
          </span>
        ) : item.bpm ? (
          <span
            className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "var(--bg-input)", color: "var(--text-3)" }}
          >
            {item.bpm} BPM
          </span>
        ) : null}
        {!isSFX && item.isLoop && (
          <span
            className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>repeat</span>
            Loop
          </span>
        )}
        <span
          className="text-[9px] font-semibold px-2 py-0.5 rounded"
          style={{ background: "var(--bg-input)", color: "var(--accent)" }}
        >
          {item.creditCost} cr
        </span>
        {item.isImageGeneration && (
          <span
            className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "color-mix(in srgb, var(--purple, #a78bfa) 10%, transparent)", color: "var(--purple, #a78bfa)" }}
          >
            from img
          </span>
        )}
      </div>

      {/* ── Active job: pipeline steps + progress ─────────────────────────── */}
      {isActive && (
        <div
          className="rounded-lg p-3 space-y-2.5"
          style={{ background: "var(--bg-mid)", border: "1px solid var(--bg-border)" }}
        >
          {/* Pipeline steps */}
          <PipelineSteps status={item.status} t={t} />

          {/* Progress bar + ETA */}
          <ProgressBar
            item={item}
            elapsed={item.status === "processing" ? processingElapsed : elapsed}
            estimated={estimated}
            t={t}
          />

          {/* Estimated total time hint */}
          <p className="text-[8px] tracking-wider uppercase" style={{ color: "var(--text-3)" }}>
            {isSFX
              ? `Est. ~${fmtTime(estimated)} · ElevenLabs SFX`
              : `Est. ~${fmtTime(estimated)} · ${item.provider} · ${item.duration ?? 30}s track`}
          </p>
        </div>
      )}

      {/* ── Failed: pipeline steps + error ───────────────────────────────── */}
      {item.status === "failed" && (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{ background: "var(--bg-mid)", border: "1px solid color-mix(in srgb, var(--error) 20%, transparent)" }}
        >
          <PipelineSteps status="failed" t={t} />
          {item.failReason && (
            <p
              className="text-[10px] rounded px-2 py-1.5 leading-relaxed"
              style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}
            >
              {item.failReason}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              disabled={retrying || removing}
              className="flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40"
              style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
            >
              {retrying ? t.generate.retrying : `↺ ${t.generate.retryBtn}`}
            </button>
            <button
              onClick={handleRemove}
              disabled={removing || retrying}
              title={t.generate.remove}
              className="rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40 flex items-center gap-1"
              style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}
              onMouseEnter={e => !removing && ((e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--error) 18%, transparent)")}
              onMouseLeave={e =>              ((e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--error) 8%, transparent)")}
            >
              {removing ? "…" : `✕ ${t.generate.remove}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Done: waveform + action buttons ──────────────────────────────── */}
      {item.status === "done" && item.audioUrl && (
        <>
          {/* Waveform player — real waveform, play/pause, scrub, duration */}
          <MiniWaveformPlayer
            audioUrl={item.audioUrl}
            onReady={handleAnalysisResult}
          />

          {/* İkincil aksiyonlar — Editor / DAW */}
          <div className="flex gap-2">
            <button
              onClick={() => onOpenEditor(item.audioUrl!)}
              className="flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-100 flex items-center justify-center gap-1"
              style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-border)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-input)")}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>tune</span>
              {t.generate.openEditor}
            </button>
            <button
              onClick={() => onOpenInStudio(item)}
              title="Open in DAW Studio"
              className="flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-100 flex items-center justify-center gap-1"
              style={{ background: "var(--bg-input)", color: "var(--accent)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-border)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-input)")}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>piano</span>
              DAW
            </button>
          </div>

          {/* İndirme — format seçici + indir butonu */}
          <div className="flex gap-2">
            <select
              value={dlFormat}
              onChange={e => setDlFormat(e.target.value as DownloadFormat)}
              aria-label={t.generate.downloadFormat}
              className="rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer"
              style={{ background: "var(--bg-input)", color: "var(--text-2)", border: "none" }}
            >
              {DOWNLOAD_FORMATS.map(f => (
                <option key={f} value={f}>{f.toUpperCase()}</option>
              ))}
            </select>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-100 flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-on)" }}
              onMouseEnter={e => !downloading && ((e.currentTarget as HTMLButtonElement).style.opacity = "0.9")}
              onMouseLeave={e =>                ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
              {downloading ? `${t.generate.downloading}…` : `${t.generate.downloadBtn} ${dlFormat.toUpperCase()}`}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
