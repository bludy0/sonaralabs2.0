import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import type { GenerationItem } from "../../store/useGenerationStore";
import { waveformBars } from "../../lib/format";

// ── Estimated processing durations (seconds) by provider + track length ───────
const ESTIMATED_DURATION: Record<string, Record<number, number>> = {
  beatoven: { 15: 35, 30: 55, 60: 95 },
  lyria:    { 15: 25, 30: 40, 60: 70 },
  sonauto:  { 15: 95, 30: 95, 60: 95 },
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

// ── Pipeline step indicators ──────────────────────────────────────────────────
type PipelineStatus = "pending" | "processing" | "done" | "failed";

const PIPELINE_STEPS = [
  { key: "pending",    label: "QUEUED"   },
  { key: "processing", label: "AI WORK"  },
  { key: "done",       label: "COMPLETE" },
] as const;

function PipelineSteps({ status }: { status: PipelineStatus }) {
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
  item, elapsed, estimated,
}: {
  item: GenerationItem;
  elapsed: number;
  estimated: number;
}) {
  const pct =
    item.status === "pending"    ? null :               // indeterminate for queued
    item.status === "done"       ? 100 :
    item.status === "failed"     ? null :
    Math.min(90, (elapsed / estimated) * 100);          // cap at 90% until SSE "done"

  const remaining = estimated - elapsed;
  const etaLabel  = remaining > 2 ? `~${fmtTime(remaining)}` : "Finalizing…";

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
          {item.status === "pending"    ? "Waiting in queue…"         :
           item.status === "processing" ? "AI synthesis in progress…" :
           item.status === "done"       ? "Generation complete"        :
                                          "Generation failed"}
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
function StatusBadge({ status }: { status: GenerationItem["status"] }) {
  const configs: Record<GenerationItem["status"], { label: string; bg: string; color: string }> = {
    pending:    { label: "QUEUED",     bg: "color-mix(in srgb, var(--accent) 10%, transparent)",  color: "var(--accent)" },
    processing: { label: "PROCESSING", bg: "color-mix(in srgb, var(--accent) 15%, transparent)",  color: "var(--accent)" },
    done:       { label: "SUCCESS",    bg: "color-mix(in srgb, var(--success) 10%, transparent)", color: "var(--success)" },
    failed:     { label: "FAILED",     bg: "color-mix(in srgb, var(--error) 10%, transparent)",   color: "var(--error)" },
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
  onOpenInStudio: (item: GenerationItem) => void;
}

export function GenerationCard({ item, onOpenEditor, onRetry, onOpenInStudio }: GenerationCardProps) {
  ensureKeyframes();

  const [retrying, setRetrying] = useState(false);
  const [exporting, setExporting] = useState(false);

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
  const bars      = waveformBars(item._id, 22);

  // Pending: add a rough "pending overhead" estimate (~10s BullMQ pickup)
  // so the ETA during processing is relative to actual AI work time
  const processingElapsed = Math.max(0, elapsed - 8);

  async function handleExportOgg() {
    if (!item.audioUrl) return;
    setExporting(true);
    try {
      const { data } = await api.post(
        "/api/generate/export/ogg",
        { audioUrl: item.audioUrl },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([data], { type: "audio/ogg" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item._id}.ogg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    finally  { setExporting(false); }
  }

  async function handleRetry() {
    setRetrying(true);
    try { await onRetry(item._id); }
    finally { setRetrying(false); }
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
        <StatusBadge status={item.status} />
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
          <PipelineSteps status={item.status} />

          {/* Progress bar + ETA */}
          <ProgressBar
            item={item}
            elapsed={item.status === "processing" ? processingElapsed : elapsed}
            estimated={estimated}
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
          <PipelineSteps status="failed" />
          {item.failReason && (
            <p
              className="text-[10px] rounded px-2 py-1.5 leading-relaxed"
              style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}
            >
              {item.failReason}
            </p>
          )}
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40"
            style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
          >
            {retrying ? "Retrying…" : "↺ Retry"}
          </button>
        </div>
      )}

      {/* ── Done: waveform + action buttons ──────────────────────────────── */}
      {item.status === "done" && item.audioUrl && (
        <>
          <div className="flex items-center gap-[2px] h-8">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-full"
                style={{ height: `${h}%`, background: "var(--accent)" }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onOpenEditor(item.audioUrl!)}
              className="flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100"
              style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-border)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-input)")}
            >
              Open Editor
            </button>
            <button
              onClick={() => onOpenInStudio(item)}
              title="Open in DAW Studio"
              className="rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100 flex items-center gap-1"
              style={{ background: "var(--bg-input)", color: "var(--accent)" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)";
                (e.currentTarget as HTMLButtonElement).style.color      = "var(--accent-on)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow  = "0px 0px 12px color-mix(in srgb, var(--accent) 30%, transparent)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-input)";
                (e.currentTarget as HTMLButtonElement).style.color      = "var(--accent)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow  = "none";
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>piano</span>
              DAW
            </button>
            <button
              onClick={handleExportOgg}
              disabled={exporting}
              title="Export as OGG"
              className="rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100 flex items-center gap-1 disabled:opacity-40"
              style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
              onMouseEnter={e => !exporting && ((e.currentTarget as HTMLButtonElement).style.background = "var(--bg-border)")}
              onMouseLeave={e =>              ((e.currentTarget as HTMLButtonElement).style.background = "var(--bg-input)")}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
              {exporting ? "…" : "OGG"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
