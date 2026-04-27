import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatDuration, timeAgo } from "../lib/format";

interface PublicTrack {
  id: string;
  userId: string;
  username: string;
  title: string;
  audioUrl: string;
  durationSec: number;
  bpm?: number;
  genreTags: string[];
  moodTags: string[];
  gameTypeTags: string[];
  likeCount: number;
  isLoop: boolean;
  createdAt: string;
}

const GENRES = ["ambient", "action", "puzzle", "horror", "platformer"];
const MOODS  = ["tense", "calm", "epic", "mysterious", "cheerful"];
const FILTER_CHIPS = ["Popular", ...GENRES.slice(0, 4)];


/** Seeded pseudo-random waveform bar heights (deterministic per track ID) */
function waveformBars(seed: string, count = 28): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    const base = (h % 60) + 20; // 20–80%
    const peak = i % 4 === 0 ? Math.min(base + 20, 95) : base;
    return peak;
  });
}

export default function ExplorePage() {
  const [tracks, setTracks]         = useState<PublicTrack[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [genre, setGenre]           = useState("");
  const [mood, setMood]             = useState("");
  const [search, setSearch]         = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeChip, setActiveChip] = useState("Popular");
  const [likedIds, setLikedIds]     = useState<Set<string>>(new Set());
  const [playing, setPlaying]       = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<PublicTrack | null>(null);
  const [copiedId, setCopiedId]     = useState<string | null>(null);
  const [toast, setToast]           = useState<string | null>(null);
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const autoPlayRef = useRef<string | null>(null);
  const cardRefs    = useRef<Record<string, HTMLElement | null>>({});
  const [searchParams, setSearchParams] = useSearchParams();

  // ?play=<trackId> parametresini yakala
  useEffect(() => {
    const playId = searchParams.get("play");
    if (playId) autoPlayRef.current = playId;
  }, []);

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(search), 400);
  }, [search]);

  const fetchTracks = useCallback(async (nextPage: number, append = false) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: nextPage, limit: 20 };
      if (genre)      params.genre = genre;
      if (mood)       params.mood  = mood;
      if (debouncedQ) params.q     = debouncedQ;
      const { data } = await api.get("/api/social/tracks", { params });
      const incoming = data.data?.items ?? [];
      setTracks(prev => append ? [...prev, ...incoming] : incoming);
      setTotal(data.data?.total ?? 0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [genre, mood, debouncedQ]);

  useEffect(() => {
    setPage(1);
    setTracks([]);
    fetchTracks(1, false);
  }, [fetchTracks]);

  // Track'ler yüklendikten sonra ?play= varsa otomatik çal + scroll
  useEffect(() => {
    const targetId = autoPlayRef.current;
    if (!targetId || tracks.length === 0) return;
    const target = tracks.find(t => t.id === targetId);
    if (!target) return;
    autoPlayRef.current = null;
    // URL'den play parametresini temizle (history'i kirletmesin)
    setSearchParams(prev => { prev.delete("play"); return prev; }, { replace: true });
    // Scroll to card
    setTimeout(() => {
      cardRefs.current[targetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    // Kısa gecikme sonrası otomatik çal
    setTimeout(() => handlePlay(target), 400);
  }, [tracks]);

  function handlePlay(track: PublicTrack) {
    if (playing === track.id) {
      audioRef.current?.pause();
      setPlaying(null);
      setNowPlaying(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    const audio = new Audio(track.audioUrl);
    audio.play().catch(() => {});
    audio.onended = () => { setPlaying(null); setNowPlaying(null); };
    audioRef.current = audio;
    setPlaying(track.id);
    setNowPlaying(track);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleShare(track: PublicTrack) {
    const url = `${window.location.origin}/explore?play=${track.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(track.id);
      showToast("Link kopyalandı!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API yoksa fallback: prompt ile göster
      window.prompt("Bu linki kopyala:", url);
    }
  }

  async function handleLike(track: PublicTrack) {
    try {
      const { data } = await api.post(`/api/social/tracks/${track.id}/like`);
      const liked: boolean = data.data?.liked ?? false;
      const likeCount: number = data.data?.likeCount ?? track.likeCount;
      setLikedIds(prev => {
        const next = new Set(prev);
        liked ? next.add(track.id) : next.delete(track.id);
        return next;
      });
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, likeCount } : t));
    } catch { /* auth required */ }
  }

  function handleChipClick(chip: string) {
    setActiveChip(chip);
    if (chip === "Popular") {
      setGenre("");
    } else {
      setGenre(chip.toLowerCase());
    }
  }

  const hasMore = tracks.length < total;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <div className="px-8 pt-10 pb-8">
        {/* System label */}
        <p className="text-[10px] font-semibold tracking-[0.25em] uppercase mb-3" style={{ color: "var(--text-2)" }}>
          SONARALABS / DISCOVERY_ENGINE
        </p>
        <h1
          className="text-[2.8rem] font-bold leading-none tracking-tight uppercase mb-6"
          style={{ letterSpacing: "-0.02em", color: "var(--text-1)" }}
        >
          Explore
        </h1>

        {/* Search bar — terminal style */}
        <div className="flex gap-3 items-center max-w-2xl mb-6">
          <div
            className="flex-1 flex items-center gap-3 rounded-lg px-4 py-3"
            style={{ background: "var(--bg-input)" }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: "var(--text-2)" }}>search</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tracks, artists, genres…"
              className="flex-1 bg-transparent text-sm outline-none placeholder-[#484848]"
              style={{ color: "var(--text-1)" }}
            />
          </div>
          <select
            value={mood}
            onChange={e => setMood(e.target.value)}
            className="rounded-lg px-3 py-3 text-xs font-medium uppercase tracking-wider outline-none"
            style={{ background: "var(--bg-input)", color: "var(--text-2)", border: "none" }}
          >
            <option value="">All moods</option>
            {MOODS.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
          </select>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-100"
              style={
                activeChip === chip
                  ? { background: "var(--accent)", color: "var(--accent-on)" }
                  : { background: "var(--bg-input)", color: "var(--text-2)" }
              }
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* ── TRACK GRID ────────────────────────────────────────────────────────── */}
      <div className="flex-1 px-8 pb-28">
        {loading && tracks.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-xs tracking-widest uppercase" style={{ color: "var(--text-3)" }}>
              Loading stream…
            </p>
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-xs tracking-widest uppercase" style={{ color: "var(--text-3)" }}>
              No tracks found.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map(track => (
              <TrackCard
                key={track.id}
                track={track}
                isPlaying={playing === track.id}
                isLiked={likedIds.has(track.id)}
                isCopied={copiedId === track.id}
                onPlay={handlePlay}
                onLike={handleLike}
                onShare={handleShare}
                cardRef={el => { cardRefs.current[track.id] = el; }}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="text-center mt-8">
            <button
              onClick={() => { const next = page + 1; setPage(next); fetchTracks(next, true); }}
              disabled={loading}
              className="px-6 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-widest transition-all duration-100 disabled:opacity-40"
              style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
            >
              {loading ? "Loading…" : `Load more (${tracks.length}/${total})`}
            </button>
          </div>
        )}
      </div>

      {/* ── TOAST ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider z-50 pointer-events-none"
          style={{
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
            color: "var(--accent)",
            border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
            backdropFilter: "blur(12px)",
          }}
        >
          {toast}
        </div>
      )}

      {/* ── GLOBAL PLAYBACK BAR ───────────────────────────────────────────────── */}
      {nowPlaying && (
        <div
          className="fixed bottom-0 left-[220px] right-0 h-[72px] flex items-center gap-5 px-8"
          style={{
            background: "color-mix(in srgb, var(--bg-page) 85%, transparent)",
            backdropFilter: "blur(20px)",
            borderTop: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
          }}
        >
          {/* Play/pause */}
          <button
            onClick={() => handlePlay(nowPlaying)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-100"
            style={{
              background: "var(--accent)",
              color: "var(--accent-on)",
              boxShadow: "0px 0px 16px color-mix(in srgb, var(--accent) 35%, transparent)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {playing === nowPlaying.id ? "pause" : "play_arrow"}
            </span>
          </button>

          {/* Track info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{nowPlaying.title}</p>
            <p className="text-[11px] truncate" style={{ color: "var(--text-2)" }}>@{nowPlaying.username}</p>
          </div>

          {/* Waveform visualization */}
          <div className="hidden md:flex items-center gap-[2px] h-8">
            {waveformBars(nowPlaying.id, 32).map((h, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full transition-all duration-75"
                style={{
                  height: `${playing === nowPlaying.id ? h : h * 0.5}%`,
                  background: playing === nowPlaying.id ? "var(--accent)" : "var(--text-3)",
                  opacity: playing === nowPlaying.id ? 1 : 0.6,
                }}
              />
            ))}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 shrink-0">
            {nowPlaying.bpm && (
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                {nowPlaying.bpm} BPM
              </span>
            )}
            {nowPlaying.durationSec > 0 && (
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                {formatDuration(nowPlaying.durationSec)}
              </span>
            )}
          </div>

          {/* Share from playback bar */}
          <button
            onClick={() => handleShare(nowPlaying)}
            className="material-symbols-outlined transition-colors duration-100"
            style={{ fontSize: 18, color: copiedId === nowPlaying.id ? "var(--accent)" : "var(--text-3)" }}
            title="Share track"
          >
            {copiedId === nowPlaying.id ? "check" : "share"}
          </button>

          {/* Close */}
          <button
            onClick={() => { audioRef.current?.pause(); setPlaying(null); setNowPlaying(null); }}
            className="material-symbols-outlined transition-colors duration-100"
            style={{ fontSize: 18, color: "var(--text-3)" }}
          >
            close
          </button>
        </div>
      )}
    </div>
  );
}

// ── Track Card ────────────────────────────────────────────────────────────────

interface TrackCardProps {
  track: PublicTrack;
  isPlaying: boolean;
  isLiked: boolean;
  isCopied: boolean;
  onPlay: (t: PublicTrack) => void;
  onLike: (t: PublicTrack) => void;
  onShare: (t: PublicTrack) => void;
  cardRef: (el: HTMLElement | null) => void;
}

function TrackCard({ track, isPlaying, isLiked, isCopied, onPlay, onLike, onShare, cardRef }: TrackCardProps) {
  const bars = waveformBars(track.id, 32);

  return (
    <article
      ref={cardRef}
      className="rounded-lg overflow-hidden group cursor-default transition-all duration-150"
      style={{
        background: "var(--bg-input)",
        outline: isPlaying ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" : "none",
      }}
    >
      {/* Thumbnail zone */}
      <div
        className="relative h-36 flex items-center justify-center overflow-hidden"
        style={{ background: "var(--bg-card)" }}
      >
        {/* Waveform visualization */}
        <div className="flex items-center gap-[2px] h-16 px-4 w-full">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-full transition-all duration-100"
              style={{
                height: `${isPlaying ? h : Math.max(h * 0.6, 12)}%`,
                background: isPlaying ? "var(--accent)" : "var(--bg-bright)",
              }}
            />
          ))}
        </div>

        {/* Play overlay */}
        <button
          onClick={() => onPlay(track)}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{
              background: "var(--accent)",
              color: "var(--accent-on)",
              boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 40%, transparent)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {isPlaying ? "pause" : "play_arrow"}
            </span>
          </div>
        </button>

        {/* AI model badge — top right */}
        <div
          className="absolute top-2 right-2 px-2 py-0.5 rounded text-[9px] font-semibold tracking-widest uppercase"
          style={{ background: "rgba(0,0,0,0.7)", color: "var(--text-2)" }}
        >
          AI_GEN
        </div>

        {/* Loop badge */}
        {track.isLoop && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-semibold tracking-widest uppercase"
            style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
          >
            Loop
          </div>
        )}

        {/* Currently playing indicator */}
        {isPlaying && (
          <div
            className="absolute bottom-0 left-0 right-0 h-0.5"
            style={{ background: "var(--accent)" }}
          />
        )}
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Title + username */}
        <div>
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{track.title}</p>
          <Link
            to={`/profile/${track.username}`}
            className="text-[11px] transition-colors duration-100"
            style={{ color: "var(--text-2)" }}
          >
            @{track.username}
          </Link>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {[...track.genreTags, ...track.moodTags].slice(0, 3).map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider capitalize"
              style={{ background: "var(--bg-card)", color: "var(--text-3)" }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Meta + actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {track.durationSec > 0 && <span>{formatDuration(track.durationSec)}</span>}
            {track.bpm && <span>{track.bpm} BPM</span>}
            <span>{timeAgo(track.createdAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Share */}
            <button
              onClick={() => onShare(track)}
              className="flex items-center gap-1 text-[11px] transition-colors duration-100"
              style={{ color: isCopied ? "var(--accent)" : "var(--text-3)" }}
              title="Share track"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {isCopied ? "check" : "share"}
              </span>
            </button>
            {/* Like */}
            <button
              onClick={() => onLike(track)}
              className="flex items-center gap-1 text-[11px] transition-colors duration-100"
              style={{ color: isLiked ? "var(--error)" : "var(--text-3)" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: `"FILL" ${isLiked ? 1 : 0}` }}>
                favorite
              </span>
              {track.likeCount}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
