import { useState } from "react";
import { formatDate, formatDuration } from "../../lib/format";
import type { LibraryItem } from "./LibraryTypes";

const STATUS_COLOR: Record<string, string> = {
  done:       "var(--success)",
  failed:     "var(--error)",
  processing: "var(--accent)",
  pending:    "var(--text-3)",
};

interface LibraryItemCardProps {
  item: LibraryItem;
  onFavoriteToggle: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  onOpenInStudio: (item: LibraryItem) => void;
  onPublish?: () => void;
}

export function LibraryItemCard({ item, onFavoriteToggle, onDelete, onOpenInStudio, onPublish }: LibraryItemCardProps) {
  const [hovered, setHovered] = useState(false);

  const label =
    item.originalName ??
    (item.prompt ? item.prompt.slice(0, 60) + (item.prompt.length > 60 ? "…" : "") : "Untitled");

  return (
    <li
      className="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors cursor-default"
      style={{ background: hovered ? "var(--bg-input)" : "var(--bg-card)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Type badge */}
      <span
        className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded shrink-0"
        style={
          item._type === "generation"
            ? { background: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)" }
            : { background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" }
        }
      >
        {item._type === "generation" ? "GEN" : "UP"}
      </span>

      {/* Name / prompt */}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: "var(--text-1)" }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{formatDate(item.createdAt)}</p>
      </div>

      {item.duration != null && (
        <span className="text-xs shrink-0 w-10 text-right" style={{ color: "var(--text-3)" }}>
          {formatDuration(item.duration)}
        </span>
      )}

      {item.status && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: STATUS_COLOR[item.status] ?? "var(--text-3)",
              ...(item.status === "processing" ? { animation: "pulse 1.5s infinite" } : {}),
            }}
          />
          <span
            className="text-[9px] font-bold tracking-[0.15em] uppercase"
            style={{ color: STATUS_COLOR[item.status] ?? "var(--text-3)" }}
          >
            {item.status}
          </span>
        </div>
      )}

      {onPublish && (
        <button
          onClick={onPublish}
          className="shrink-0 transition-colors"
          title="Publish to Community"
          style={{ color: "var(--text-3)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--success)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
        >
          <span className="material-symbols-outlined text-[18px]">publish</span>
        </button>
      )}

      {item.audioUrl && (
        <button
          onClick={() => onOpenInStudio(item)}
          className="shrink-0 transition-colors"
          title="Open in DAW Studio"
          style={{ color: "var(--text-3)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
        >
          <span className="material-symbols-outlined text-[18px]">piano</span>
        </button>
      )}

      <button
        onClick={() => onFavoriteToggle(item)}
        className="shrink-0 transition-colors"
        title={item.isFavorited ? "Remove from favorites" : "Add to favorites"}
        style={{ color: item.isFavorited ? "var(--error)" : "var(--text-3)" }}
        onMouseEnter={e => !item.isFavorited && (e.currentTarget.style.color = "var(--error)")}
        onMouseLeave={e => !item.isFavorited && (e.currentTarget.style.color = "var(--text-3)")}
      >
        <span className="material-symbols-outlined text-[18px]">favorite</span>
      </button>

      <button
        onClick={() => onDelete(item)}
        className="shrink-0 transition-colors"
        title="Delete"
        style={{ color: "var(--text-3)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "var(--error)")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
      >
        <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
    </li>
  );
}
