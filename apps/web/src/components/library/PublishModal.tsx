import { useState } from "react";
import { api } from "../../lib/api";
import { stripTags } from "../../lib/sanitize";
import type { LibraryItem } from "./LibraryTypes";

const GENRES     = ["ambient", "action", "puzzle", "horror", "platformer"];
const MOODS      = ["tense", "calm", "epic", "mysterious", "cheerful"];
const GAME_TYPES = ["rpg", "fps", "platformer", "strategy", "horror", "indie", "casual"];

interface PublishForm {
  title: string;
  genreTags: string[];
  moodTags: string[];
  gameTypeTags: string[];
  isLoop: boolean;
  bpm: string;
}

interface PublishModalProps {
  item: LibraryItem;
  onClose: () => void;
  onPublished: () => void;
}

export function PublishModal({ item, onClose, onPublished }: PublishModalProps) {
  const defaultTitle = item.originalName ?? (item.prompt?.slice(0, 80) ?? "Untitled");
  const [form, setForm] = useState<PublishForm>({
    title: defaultTitle,
    genreTags: [],
    moodTags: [],
    gameTypeTags: [],
    isLoop: false,
    bpm: "",
  });
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(key: "genreTags" | "moodTags" | "gameTypeTags", tag: string) {
    setForm(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(tag) ? arr.filter(t => t !== tag) : [...arr, tag] };
    });
  }

  async function handleSubmit() {
    const cleanTitle = stripTags(form.title.trim())
    if (!cleanTitle) { setError("Title is required"); return; }
    if (!item.audioUrl) { setError("No audio URL"); return; }
    setPublishing(true);
    setError(null);
    try {
      await api.post("/api/social/tracks", {
        title: cleanTitle,
        audioUrl: item.audioUrl,
        durationSec: item.duration ? Math.round(item.duration) : 0,
        bpm: form.bpm ? parseInt(form.bpm) : undefined,
        genreTags: form.genreTags,
        moodTags: form.moodTags,
        gameTypeTags: form.gameTypeTags,
        isLoop: form.isLoop,
        generationId: item._type === "generation" ? item._id : undefined,
        uploadId:     item._type === "upload"     ? item._id : undefined,
      });
      onPublished();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-lg space-y-5 shadow-2xl"
        style={{ background: "#131313" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-2xl font-bold uppercase"
            style={{ color: "#ffffff", letterSpacing: "-0.01em" }}
          >
            Publish to Community
          </h2>
          <button
            onClick={onClose}
            className="text-xl transition-colors"
            style={{ color: "#484848" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#ffffff")}
            onMouseLeave={e => (e.currentTarget.style.color = "#484848")}
          >
            ✕
          </button>
        </div>

        <div>
          <label className="block text-[10px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: "#484848" }}>
            Title
          </label>
          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            maxLength={120}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: "#1f2937", color: "#ffffff", border: "none" }}
            onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 1px #ffdd73")}
            onBlur={e => (e.currentTarget.style.boxShadow = "none")}
          />
        </div>

        {[
          { key: "genreTags" as const, label: "Genre",     tags: GENRES },
          { key: "moodTags"  as const, label: "Mood",      tags: MOODS },
          { key: "gameTypeTags" as const, label: "Game Type", tags: GAME_TYPES },
        ].map(({ key, label, tags }) => (
          <div key={key}>
            <label className="block text-[10px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: "#484848" }}>
              {label}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <button
                  key={t}
                  onClick={() => toggleTag(key, t)}
                  className="text-xs px-2.5 py-1 rounded-full transition-colors capitalize font-bold"
                  style={
                    form[key].includes(t)
                      ? { background: "#ffdd73", color: "#624e00" }
                      : { background: "#1f2937", color: "#ababab" }
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-4">
          <div>
            <label className="block text-[10px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: "#484848" }}>
              BPM (optional)
            </label>
            <input
              type="number" min={40} max={300}
              value={form.bpm}
              onChange={e => setForm(p => ({ ...p, bpm: e.target.value }))}
              placeholder="120"
              className="w-24 rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: "#1f2937", color: "#ffffff", border: "none" }}
              onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 1px #ffdd73")}
              onBlur={e => (e.currentTarget.style.boxShadow = "none")}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={form.isLoop}
              onChange={e => setForm(p => ({ ...p, isLoop: e.target.checked }))}
              className="w-4 h-4"
              style={{ accentColor: "#ffdd73" }}
            />
            <span className="text-sm" style={{ color: "#ababab" }}>This is a loop</span>
          </label>
        </div>

        {error && <p className="text-sm" style={{ color: "#ff7351" }}>{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSubmit}
            disabled={publishing}
            className="flex-1 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
            style={{ background: "#ffdd73", color: "#624e00", boxShadow: "0px 0px 20px rgba(250,204,21,0.3)" }}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "#1f2937", color: "#ababab" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
