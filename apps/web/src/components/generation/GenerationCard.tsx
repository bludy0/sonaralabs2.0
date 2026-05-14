import { useState } from "react";
import { api } from "../../lib/api";
import type { GenerationItem } from "../../store/useGenerationStore";
import { waveformBars } from "../../lib/format";

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

export interface GenerationCardProps {
  item: GenerationItem;
  onOpenEditor: (url: string) => void;
  onRetry: (id: string) => void;
  onOpenInStudio: (item: GenerationItem) => void;
}

export function GenerationCard({ item, onOpenEditor, onRetry, onOpenInStudio }: GenerationCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const isSFX = item.type === "sfx";
  const bars = waveformBars(item._id, 22);

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
    } catch {
      /* silent */
    } finally {
      setExporting(false);
    }
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
      <div className="absolute top-3 right-3 text-[8px] font-semibold tracking-[0.2em] uppercase" style={{ color: "var(--text-3)" }}>
        {isSFX ? "SFX_ENGINE" : "AI_MODEL_v2.0"}
      </div>

      <p className="text-[12px] leading-relaxed pr-20 line-clamp-2" style={{ color: "var(--text-2)" }}>
        {item.prompt}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.status} />
        {isSFX ? (
          <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded"
            style={{ background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" }}>
            SFX
          </span>
        ) : (
          <>
            <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded capitalize"
              style={{ background: "var(--bg-input)", color: "var(--text-3)" }}>
              {item.provider}
            </span>
            {item.style && (
              <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded capitalize"
                style={{ background: "var(--bg-input)", color: "var(--text-3)" }}>
                {item.style}
              </span>
            )}
          </>
        )}
        {item.duration != null && (
          <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "var(--bg-input)", color: "var(--text-3)" }}>
            {item.duration}s
          </span>
        )}
        <span className="text-[9px] font-semibold px-2 py-0.5 rounded"
          style={{ background: "var(--bg-input)", color: "var(--accent)" }}>
          {item.creditCost} cr
        </span>
        {item.isImageGeneration && (
          <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "color-mix(in srgb, var(--purple, #a78bfa) 10%, transparent)", color: "var(--purple, #a78bfa)" }}>
            from img
          </span>
        )}
      </div>

      {item.status === "processing" && (
        <div className="space-y-1">
          <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "var(--bg-input)" }}>
            <div className="h-full rounded-full animate-pulse" style={{ background: "var(--accent)", width: "60%" }} />
          </div>
          <p className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
            AI synthesis in progress…
          </p>
        </div>
      )}

      {item.status === "done" && item.audioUrl && (
        <>
          <div className="flex items-center gap-[2px] h-8">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-full" style={{ height: `${h}%`, background: "var(--accent)" }} />
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
                (e.currentTarget as HTMLButtonElement).style.background  = "var(--accent)";
                (e.currentTarget as HTMLButtonElement).style.color       = "var(--accent-on)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow   = "0px 0px 12px color-mix(in srgb, var(--accent) 30%, transparent)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background  = "var(--bg-input)";
                (e.currentTarget as HTMLButtonElement).style.color       = "var(--accent)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow   = "none";
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

      {item.status === "failed" && (
        <div className="space-y-2">
          {item.failReason && (
            <p className="text-[10px] rounded px-2 py-1.5 leading-relaxed"
              style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}>
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
    </article>
  );
}
