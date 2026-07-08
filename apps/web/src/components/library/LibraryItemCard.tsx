import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { formatDate, formatDuration } from "../../lib/format";
import { useT } from "../../store/useI18nStore";
import type { Collection, LibraryItem } from "./LibraryTypes";
import MiniWaveformPlayer from "../generation/MiniWaveformPlayer";

const STATUS_COLOR: Record<string, string> = {
  done:       "var(--success)",
  failed:     "var(--error)",
  processing: "var(--accent)",
  pending:    "var(--text-3)",
};

interface LibraryItemCardProps {
  item:                 LibraryItem;
  collections:          Collection[];
  inActiveCollection:   boolean;
  addingToCol:          boolean;
  onFavoriteToggle:     (item: LibraryItem) => void;
  onDelete:             (item: LibraryItem) => void;
  onOpenInStudio:       (item: LibraryItem) => void;
  onPublish?:           () => void;
  onAddToCollection:    (item: LibraryItem, colId: string) => void;
  onRemoveFromCollection?: (refId: string) => void;
}

export function LibraryItemCard({
  item, collections, inActiveCollection, addingToCol,
  onFavoriteToggle, onDelete, onOpenInStudio, onPublish,
  onAddToCollection, onRemoveFromCollection,
}: LibraryItemCardProps) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const [waveformVisible, setWaveformVisible] = useState(false);

  // Close action menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Lazy-load waveform only when the card enters the viewport
  useEffect(() => {
    if (!item.audioUrl || waveformVisible) return;
    const el = waveformRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setWaveformVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.audioUrl, waveformVisible]);

  const label =
    item.originalName ??
    (item.prompt ? item.prompt.slice(0, 60) + (item.prompt.length > 60 ? "…" : "") : "Untitled");

  // Which collections already contain this item
  const itemColIds = new Set(
    collections.filter(c => c.items.some(i => i.refId === item._id)).map(c => c._id)
  );

  return (
    <li
      className="rounded-lg px-4 py-3 transition-colors cursor-default"
      style={{
        background: hovered ? "var(--bg-input)" : "var(--bg-card)",
        borderLeft: inActiveCollection ? "2px solid var(--accent)" : "2px solid transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
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
              lang="en"
              className="text-[9px] font-bold tracking-[0.15em] uppercase"
              style={{ color: STATUS_COLOR[item.status] ?? "var(--text-3)" }}
            >
              {item.status}
            </span>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 mt-3">
        {/* Preview waveform */}
        {item.audioUrl && (
          <div className="flex-1 min-w-0" ref={waveformRef}>
            {waveformVisible ? (
              <MiniWaveformPlayer
                audioUrl={item.audioUrl}
                onReady={async (info) => {
                  if (!info.bpm) return;
                  const endpoint = item._type === "generation"
                    ? `/api/generate/${item._id}/analysis`
                    : `/api/upload/${item._id}/analysis`;
                  try {
                    await api.patch(endpoint, {
                      bpm: info.bpm,
                      waveformData: info.waveformData,
                      duration: info.duration,
                    });
                  } catch {
                    // Non-fatal
                  }
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setWaveformVisible(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-[10px] font-bold uppercase tracking-wider transition-colors"
                style={{ background: "var(--bg-mid)", color: "var(--text-3)" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>graphic_eq</span>
                {t.library.preview}
              </button>
            )}
          </div>
        )}

        {/* Primary actions */}
        {onPublish && (
          <button
            onClick={onPublish}
            className="shrink-0 rounded-lg p-2 transition-colors"
            title={t.library.publish}
            style={{ color: "var(--text-3)", background: "var(--bg-mid)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--success)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            <span className="material-symbols-outlined text-[18px]">publish</span>
          </button>
        )}

        {item.audioUrl && (
          <button
            onClick={() => onOpenInStudio(item)}
            className="shrink-0 rounded-lg p-2 transition-colors"
            title={t.library.addToStudio}
            style={{ color: "var(--text-3)", background: "var(--bg-mid)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            <span className="material-symbols-outlined text-[18px]">piano</span>
          </button>
        )}

        {/* More actions dropdown */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="shrink-0 rounded-lg p-2 transition-colors"
            title={t.library.moreActions}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{ color: "var(--text-3)", background: "var(--bg-mid)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            <span className="material-symbols-outlined text-[18px]">more_vert</span>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 rounded-lg py-1 z-50 shadow-lg min-w-[200px]"
              style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}
              role="menu"
            >
              {/* Collection management */}
              {inActiveCollection && onRemoveFromCollection ? (
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onRemoveFromCollection(item._id); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                  style={{ color: "var(--text-1)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-input)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16, color: "var(--error)" }}>
                    folder_off
                  </span>
                  {t.library.removeFromCollection}
                </button>
              ) : (
                <>
                  <p
                    className="text-[9px] font-bold tracking-[0.2em] uppercase px-3 pt-1.5 pb-1"
                    style={{ color: "var(--text-3)" }}
                  >
                    {t.library.addToCollection}
                  </p>
                  {collections.length === 0 ? (
                    <p className="px-3 py-1.5 text-[11px] italic" style={{ color: "var(--text-3)" }}>
                      No collections
                    </p>
                  ) : (
                    collections.map(col => {
                      const alreadyIn = itemColIds.has(col._id);
                      return (
                        <button
                          key={col._id}
                          role="menuitem"
                          disabled={alreadyIn || addingToCol}
                          onClick={() => { setMenuOpen(false); onAddToCollection(item, col._id); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors disabled:opacity-50"
                          style={{ color: alreadyIn ? "var(--accent)" : "var(--text-1)" }}
                          onMouseEnter={e => { if (!alreadyIn) e.currentTarget.style.background = "var(--bg-input)"; }}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14, color: alreadyIn ? "var(--accent)" : "var(--text-3)" }}>
                            {alreadyIn ? "check" : "folder"}
                          </span>
                          <span className="flex-1 truncate">{col.name}</span>
                          <span className="text-[10px] shrink-0" style={{ color: "var(--text-3)" }}>
                            {col.items?.length ?? 0}
                          </span>
                        </button>
                      );
                    })
                  )}
                  <div className="my-1 h-px" style={{ background: "var(--bg-border)" }} />
                </>
              )}

              {/* Favorite toggle */}
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onFavoriteToggle(item); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                style={{ color: item.isFavorited ? "var(--error)" : "var(--text-1)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-input)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>
                  {item.isFavorited ? "favorite" : "favorite_border"}
                </span>
                {item.isFavorited ? t.library.unfavorite : t.library.favorite}
              </button>

              {/* Delete */}
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onDelete(item); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                style={{ color: "var(--error)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "color-mix(in srgb, var(--error) 8%, transparent)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>delete</span>
                {t.library.delete}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
