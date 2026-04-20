import { useState } from "react";
import { api } from "../../lib/api";
import type { GenerationItem } from "../../store/useGenerationStore";

function waveformBars(seed: string, count = 22): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: count }, () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return (h % 55) + 20;
  });
}

function StatusBadge({ status }: { status: GenerationItem["status"] }) {
  const configs: Record<GenerationItem["status"], { label: string; bg: string; color: string }> = {
    pending:    { label: "QUEUED",     bg: "rgba(255,221,115,0.1)",  color: "#ffdd73" },
    processing: { label: "PROCESSING", bg: "rgba(255,221,115,0.15)", color: "#ffdd73" },
    done:       { label: "SUCCESS",    bg: "rgba(100,200,100,0.1)",  color: "#6ec96e" },
    failed:     { label: "FAILED",     bg: "rgba(255,115,81,0.1)",   color: "#ff7351" },
  };
  const cfg = configs[status];
  return (
    <span
      data-testid="generation-status"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-[0.15em] uppercase"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {status === "processing" && (
        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#ffdd73" }} />
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
    item.status === "done"       ? "rgba(110,201,110,0.3)" :
    item.status === "processing" ? "rgba(255,221,115,0.3)" :
    item.status === "failed"     ? "rgba(255,115,81,0.3)"  :
                                   "rgba(72,72,72,0.5)";

  return (
    <article
      className="relative rounded-lg overflow-hidden space-y-3 p-4"
      style={{ background: "#131313", borderLeft: `2px solid ${borderColor}` }}
    >
      <div className="absolute top-3 right-3 text-[8px] font-semibold tracking-[0.2em] uppercase" style={{ color: "#484848" }}>
        {isSFX ? "SFX_ENGINE" : "AI_MODEL_v2.0"}
      </div>

      <p className="text-[12px] leading-relaxed pr-20 line-clamp-2" style={{ color: "#ababab" }}>
        {item.prompt}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.status} />
        {isSFX ? (
          <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded"
            style={{ background: "rgba(100,200,180,0.1)", color: "#64c8b4" }}>
            SFX
          </span>
        ) : (
          <>
            <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded capitalize"
              style={{ background: "#1f2937", color: "#484848" }}>
              {item.provider}
            </span>
            {item.style && (
              <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded capitalize"
                style={{ background: "#1f2937", color: "#484848" }}>
                {item.style}
              </span>
            )}
          </>
        )}
        {item.duration != null && (
          <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "#1f2937", color: "#484848" }}>
            {item.duration}s
          </span>
        )}
        <span className="text-[9px] font-semibold px-2 py-0.5 rounded"
          style={{ background: "#1f2937", color: "#ffdd73" }}>
          {item.creditCost} cr
        </span>
        {item.isImageGeneration && (
          <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "rgba(150,100,255,0.1)", color: "#a78bfa" }}>
            from img
          </span>
        )}
      </div>

      {item.status === "processing" && (
        <div className="space-y-1">
          <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "#1f2937" }}>
            <div className="h-full rounded-full animate-pulse" style={{ background: "#ffdd73", width: "60%" }} />
          </div>
          <p className="text-[9px] uppercase tracking-widest" style={{ color: "#484848" }}>
            AI synthesis in progress…
          </p>
        </div>
      )}

      {item.status === "done" && item.audioUrl && (
        <>
          <div className="flex items-center gap-[2px] h-8">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-full" style={{ height: `${h}%`, background: "#d4a800" }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onOpenEditor(item.audioUrl!)}
              className="flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100"
              style={{ background: "#1f2937", color: "#ababab" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#262626")}
              onMouseLeave={e => (e.currentTarget.style.background = "#1f2937")}
            >
              Open Editor
            </button>
            <button
              onClick={() => onOpenInStudio(item)}
              title="Open in DAW Studio"
              className="rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100 flex items-center gap-1"
              style={{ background: "#1f2937", color: "#ffdd73" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background  = "#ffdd73";
                (e.currentTarget as HTMLButtonElement).style.color       = "#624e00";
                (e.currentTarget as HTMLButtonElement).style.boxShadow   = "0px 0px 12px rgba(250,204,21,0.3)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background  = "#1f2937";
                (e.currentTarget as HTMLButtonElement).style.color       = "#ffdd73";
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
              style={{ background: "#1f2937", color: "#ababab" }}
              onMouseEnter={e => !exporting && ((e.currentTarget as HTMLButtonElement).style.background = "#262626")}
              onMouseLeave={e =>              ((e.currentTarget as HTMLButtonElement).style.background = "#1f2937")}
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
              style={{ background: "rgba(255,115,81,0.08)", color: "#ff7351" }}>
              {item.failReason}
            </p>
          )}
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40"
            style={{ background: "#1f2937", color: "#ababab" }}
          >
            {retrying ? "Retrying…" : "↺ Retry"}
          </button>
        </div>
      )}
    </article>
  );
}
