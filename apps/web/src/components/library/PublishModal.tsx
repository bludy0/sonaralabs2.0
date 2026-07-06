import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { stripTags } from "../../lib/sanitize";
import { analyzeAudio } from "@sonaralabs/daw-studio";
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

  // Prefill from item metadata when available.
  const initialGenreTags = item.style && GENRES.includes(item.style) ? [item.style] : [];
  const initialMoodTags = item.mood && MOODS.includes(item.mood) ? [item.mood] : [];
  const initialBpm = item.bpm ? String(item.bpm) : "";

  const [form, setForm] = useState<PublishForm>({
    title: defaultTitle,
    genreTags: initialGenreTags,
    moodTags: initialMoodTags,
    gameTypeTags: [],
    isLoop: item.isLoop ?? false,
    bpm: initialBpm,
  });
  const [waveformData, setWaveformData] = useState<number[] | undefined>(item.waveformData);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute waveform data on mount if not already available.
  useEffect(() => {
    if (waveformData || !item.audioUrl) return;
    let cancelled = false;
    setAnalyzing(true);
    analyzeAudio(item.audioUrl)
      .then(({ waveformData: data }) => {
        if (!cancelled) setWaveformData(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });
    return () => { cancelled = true; };
  }, [item.audioUrl, waveformData]);

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
    let bpmValue: number | undefined;
    if (form.bpm !== "") {
      const parsed = parseInt(form.bpm, 10);
      if (isNaN(parsed) || parsed < 40 || parsed > 300) {
        setError("BPM must be a number between 40 and 300.");
        return;
      }
      bpmValue = parsed;
    }
    setPublishing(true);
    setError(null);
    try {
      await api.post("/api/social/tracks", {
        title: cleanTitle,
        audioUrl: item.audioUrl,
        durationSec: item.duration ? Math.round(item.duration) : 0,
        bpm: bpmValue,
        genreTags: form.genreTags,
        moodTags: form.moodTags,
        gameTypeTags: form.gameTypeTags,
        isLoop: form.isLoop,
        waveformData,
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
        style={{ background: "var(--bg-card)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            lang="en"
            className="text-2xl font-bold uppercase"
            style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}
          >
            Publish to Community
          </h2>
          <button
            onClick={onClose}
            className="text-xl transition-colors"
            style={{ color: "var(--text-3)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            ✕
          </button>
        </div>

        <div>
          <label lang="en" className="block text-[10px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: "var(--text-3)" }}>
            Title
          </label>
          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            maxLength={120}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: "var(--bg-input)", color: "var(--text-1)", border: "none" }}
            onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 1px var(--accent)")}
            onBlur={e => (e.currentTarget.style.boxShadow = "none")}
          />
        </div>

        {[
          { key: "genreTags" as const, label: "Genre",     tags: GENRES },
          { key: "moodTags"  as const, label: "Mood",      tags: MOODS },
          { key: "gameTypeTags" as const, label: "Game Type", tags: GAME_TYPES },
        ].map(({ key, label, tags }) => (
          <div key={key}>
            <label className="block text-[10px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: "var(--text-3)" }}>
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
                      ? { background: "var(--accent)", color: "var(--accent-on)" }
                      : { background: "var(--bg-input)", color: "var(--text-2)" }
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
            <label lang="en" className="block text-[10px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: "var(--text-3)" }}>
              BPM (optional)
            </label>
            <input
              type="number" min={40} max={300}
              value={form.bpm}
              onChange={e => setForm(p => ({ ...p, bpm: e.target.value }))}
              placeholder="120"
              className="w-24 rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-input)", color: "var(--text-1)", border: "none" }}
              onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 1px var(--accent)")}
              onBlur={e => (e.currentTarget.style.boxShadow = "none")}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={form.isLoop}
              onChange={e => setForm(p => ({ ...p, isLoop: e.target.checked }))}
              className="w-4 h-4"
              style={{ accentColor: "var(--accent)" }}
            />
            <span className="text-sm" style={{ color: "var(--text-2)" }}>This is a loop</span>
          </label>
        </div>

        {error && <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSubmit}
            disabled={publishing || analyzing}
            className="flex-1 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-on)", boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)" }}
          >
            {analyzing ? "Analyzing…" : publishing ? "Publishing…" : "Publish"}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
