import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { stripTags } from "../lib/sanitize";
import { useAuthStore } from "../store/useAuthStore";
import { formatDuration, timeAgo } from "../lib/format";

interface UserProfile {
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  gameGenres: string[];
  isPublic: boolean;
  followerCount: number;
  followingCount: number;
  trackCount: number;
  createdAt: string;
}

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
  isLoop: boolean;
  likeCount: number;
  createdAt: string;
}


/** Deterministic waveform bars from seed string */
function waveformBars(seed: string, count = 20): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: count }, () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return (h % 60) + 20;
  });
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore(s => s.user);

  const [profile, setProfile]               = useState<UserProfile | null>(null);
  const [tracks, setTracks]                 = useState<PublicTrack[]>([]);
  const [following, setFollowing]           = useState(false);
  const [loadingFollow, setLoadingFollow]   = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [notFound, setNotFound]             = useState(false);

  // Edit mode (own profile)
  const [editing, setEditing]         = useState(false);
  const [editForm, setEditForm]       = useState({ displayName: "", bio: "" });
  const [saving, setSaving]           = useState(false);
  const [avatarFile, setAvatarFile]   = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Audio playback
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isOwnProfile = !!(profile && currentUser && profile.userId === currentUser.userId);

  // ── Fetch profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!username) return;
    setLoadingProfile(true);
    setNotFound(false);

    api.get(`/api/profile/${username}`)
      .then(({ data }) => {
        const p: UserProfile = data.data;
        setProfile(p);
        setEditForm({ displayName: p.displayName ?? "", bio: p.bio ?? "" });
        if (currentUser && currentUser.userId !== p.userId) {
          return api.get(`/api/social/follow/${p.userId}/status`)
            .then(({ data: fd }) => setFollowing(fd.data?.following ?? false))
            .catch(() => {});
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingProfile(false));
  }, [username, currentUser]);

  // ── Fetch tracks ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    api.get("/api/social/tracks", { params: { userId: profile.userId, limit: 30 } })
      .then(({ data }) => setTracks(data.data?.items ?? []))
      .catch(() => {});
  }, [profile]);

  // ── Follow / Unfollow ──────────────────────────────────────────────────────
  async function handleFollow() {
    if (!profile || !currentUser) { navigate("/login"); return; }
    setLoadingFollow(true);
    try {
      await api.post(`/api/social/follow/${profile.userId}`);
      setFollowing(prev => !prev);
      setProfile(prev => prev ? {
        ...prev,
        followerCount: prev.followerCount + (following ? -1 : 1),
      } : prev);
    } catch { /* ignore */ }
    finally { setLoadingFollow(false); }
  }

  // ── Avatar picker ──────────────────────────────────────────────────────────
  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  // ── Save profile ───────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try {
      if (avatarFile) {
        const fd = new FormData();
        fd.append("avatar", avatarFile);
        await api.post("/api/profile/me/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      const { data } = await api.put("/api/profile/me", {
        displayName: editForm.displayName ? stripTags(editForm.displayName) : null,
        bio: editForm.bio ? stripTags(editForm.bio) : null,
      });
      setProfile(data.data);
      setEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  // ── Audio playback ─────────────────────────────────────────────────────────
  function handlePlay(track: PublicTrack) {
    if (playing === track.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    const audio = new Audio(track.audioUrl);
    audio.play().catch(() => {});
    audio.onended = () => setPlaying(null);
    audioRef.current = audio;
    setPlaying(track.id);
  }

  // ── Open in DAW ────────────────────────────────────────────────────────────
  function handleOpenInStudio(track: PublicTrack) {
    sessionStorage.setItem("studio:preload", JSON.stringify([{ name: track.title, audioUrl: track.audioUrl }]));
    navigate("/studio");
  }

  // ── Loading / not-found states ─────────────────────────────────────────────
  if (loadingProfile) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0e0e0e" }}
      >
        <p className="text-[11px] tracking-widest uppercase" style={{ color: "#484848" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: "#0e0e0e" }}
      >
        <p className="text-lg font-bold uppercase tracking-wider" style={{ color: "#ababab" }}>
          User not found.
        </p>
        <Link
          to="/explore"
          className="text-xs uppercase tracking-widest transition-colors duration-100"
          style={{ color: "#ffdd73" }}
        >
          ← Back to Explore
        </Link>
      </div>
    );
  }

  const avatarDisplay = avatarPreview ?? profile.avatarUrl;

  return (
    <div className="min-h-screen" style={{ background: "#0e0e0e", color: "#ffffff" }}>

      {/* ── HERO BANNER ─────────────────────────────────────────────────────── */}
      <div
        className="relative h-52 overflow-hidden"
        style={{ background: "#131313" }}
      >
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(14,14,14,0) 0%, #0e0e0e 100%)" }}
        />
        {/* Decorative grid lines */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, #ffdd73 0px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #ffdd73 0px, transparent 1px, transparent 40px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* System label */}
        <p
          className="absolute top-4 right-6 text-[9px] font-semibold tracking-[0.25em] uppercase"
          style={{ color: "rgba(255,221,115,0.4)" }}
        >
          PROFILE_NODE_v2
        </p>
      </div>

      {/* ── PROFILE HEADER ──────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-8 -mt-16 relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 pb-8">

          {/* Large avatar */}
          <div className="relative group shrink-0">
            <div
              className="w-32 h-32 rounded-lg overflow-hidden border-4 relative"
              style={{ borderColor: "#0e0e0e", background: "#1f2937" }}
            >
              {avatarDisplay ? (
                <img src={avatarDisplay} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-5xl font-bold uppercase"
                  style={{ color: "#484848" }}
                >
                  {profile.username[0]?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>

            {/* Online indicator */}
            {isOwnProfile && (
              <div
                className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full border-2"
                style={{ background: "#ffdd73", borderColor: "#0e0e0e" }}
              />
            )}

            {/* Avatar change overlay (edit mode) */}
            {isOwnProfile && editing && (
              <>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 rounded-lg flex items-center justify-center text-[10px] font-semibold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "rgba(0,0,0,0.7)", color: "#ffdd73" }}
                >
                  Change
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0 pb-1">
            {/* Badge */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[9px] font-bold tracking-[0.2em] uppercase px-2 py-0.5 rounded"
                style={{ background: "rgba(255,221,115,0.15)", color: "#ffdd73" }}
              >
                VERIFIED_CORE
              </span>
              {profile.gameGenres.slice(0, 2).map(g => (
                <span
                  key={g}
                  className="text-[9px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded capitalize"
                  style={{ background: "#1f2937", color: "#ababab" }}
                >
                  {g}
                </span>
              ))}
            </div>

            {/* Display name */}
            {editing ? (
              <input
                value={editForm.displayName}
                onChange={e => setEditForm(p => ({ ...p, displayName: e.target.value }))}
                placeholder="Display name"
                maxLength={60}
                className="text-3xl font-bold uppercase tracking-tight bg-transparent border-b outline-none w-full pb-0.5 mb-1"
                style={{ borderColor: "#484848", color: "#ffffff" }}
              />
            ) : (
              <h1
                className="text-3xl font-bold uppercase leading-none tracking-tight truncate mb-1"
                style={{ letterSpacing: "-0.01em", color: "#ffffff" }}
              >
                {profile.displayName || profile.username}
              </h1>
            )}
            <p className="text-[12px] font-medium" style={{ color: "#ababab" }}>
              @{profile.username}
            </p>

            {/* Stats */}
            <div className="flex gap-6 mt-3">
              {[
                { value: profile.followerCount,  label: "Followers" },
                { value: profile.followingCount, label: "Following" },
                { value: profile.trackCount,      label: "Tracks" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p className="text-lg font-bold" style={{ color: "#ffffff" }}>{value}</p>
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: "#484848" }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 shrink-0 pb-1">
            {isOwnProfile ? (
              editing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-50"
                    style={{
                      background: "#ffdd73",
                      color: "#624e00",
                      boxShadow: saving ? "none" : "0px 0px 16px rgba(250,204,21,0.3)",
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setAvatarFile(null); setAvatarPreview(null); }}
                    className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-100"
                    style={{ background: "#1f2937", color: "#ababab" }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-100"
                  style={{ background: "#1f2937", color: "#ababab" }}
                >
                  Edit Profile
                </button>
              )
            ) : (
              <button
                onClick={handleFollow}
                disabled={loadingFollow}
                className="px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-50"
                style={
                  following
                    ? { background: "#1f2937", color: "#ababab" }
                    : {
                        background: "#ffdd73",
                        color: "#624e00",
                        boxShadow: "0px 0px 25px rgba(250,204,21,0.5)",
                      }
                }
              >
                {loadingFollow ? "…" : following ? "Following" : "Follow"}
              </button>
            )}
          </div>
        </div>

        {/* Bio */}
        <div className="pb-8 max-w-xl -mt-2">
          {editing ? (
            <textarea
              value={editForm.bio}
              onChange={e => setEditForm(p => ({ ...p, bio: e.target.value }))}
              placeholder="Write something about yourself…"
              rows={2}
              maxLength={300}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{
                background: "#1f2937",
                color: "#ffffff",
                border: "none",
              }}
            />
          ) : profile.bio ? (
            <p className="text-sm leading-relaxed" style={{ color: "#ababab" }}>{profile.bio}</p>
          ) : isOwnProfile ? (
            <p className="text-sm italic" style={{ color: "#484848" }}>
              No bio yet. Click Edit Profile to add one.
            </p>
          ) : null}
        </div>
      </div>

      {/* ── TRACKS SECTION ──────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-8 pb-12">
        {/* Section header */}
        <div className="flex items-center gap-3 mb-6">
          <span className="material-symbols-outlined text-[16px]" style={{ color: "#ffdd73" }}>queue_music</span>
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: "#ababab" }}>
            Published_Tracks
          </p>
          <div className="flex-1 h-px" style={{ background: "#1f2937" }} />
          <p className="text-[10px] font-semibold" style={{ color: "#484848" }}>
            {tracks.length} tracks
          </p>
        </div>

        {tracks.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xs uppercase tracking-widest" style={{ color: "#484848" }}>
              {isOwnProfile
                ? "No published tracks yet. Generate something and share it!"
                : "No published tracks yet."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tracks.map(track => (
              <TrackCard
                key={track.id}
                track={track}
                isPlaying={playing === track.id}
                onPlay={handlePlay}
                onOpenInStudio={handleOpenInStudio}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Track Card ─────────────────────────────────────────────────────────────────

interface TrackCardProps {
  track: PublicTrack;
  isPlaying: boolean;
  onPlay: (t: PublicTrack) => void;
  onOpenInStudio: (t: PublicTrack) => void;
}

function TrackCard({ track, isPlaying, onPlay, onOpenInStudio }: TrackCardProps) {
  const bars = waveformBars(track.id, 20);

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-lg group transition-all duration-100 cursor-default"
      style={{ background: "#1f2937" }}
      onMouseEnter={e => (e.currentTarget.style.background = "#262626")}
      onMouseLeave={e => (e.currentTarget.style.background = "#1f2937")}
    >
      {/* Play button */}
      <button
        onClick={() => onPlay(track)}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-100"
        style={
          isPlaying
            ? { background: "#ffdd73", color: "#624e00", boxShadow: "0px 0px 12px rgba(250,204,21,0.35)" }
            : { background: "#131313", color: "#ababab" }
        }
      >
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
          {isPlaying ? "pause" : "play_arrow"}
        </span>
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-semibold truncate" style={{ color: "#ffffff" }}>{track.title}</p>
        <div className="flex items-center gap-2">
          {track.isLoop && (
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,221,115,0.1)", color: "#ffdd73" }}
            >
              Loop
            </span>
          )}
          {[...track.genreTags, ...track.moodTags].slice(0, 2).map(tag => (
            <span
              key={tag}
              className="text-[9px] uppercase tracking-wider capitalize"
              style={{ color: "#484848" }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Waveform bars */}
      <div className="hidden sm:flex items-center gap-[1.5px] h-7 shrink-0">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-[2px] rounded-full"
            style={{
              height: `${isPlaying ? h : Math.max(h * 0.5, 10)}%`,
              background: isPlaying ? "#d4a800" : "#2c2c2c",
            }}
          />
        ))}
      </div>

      {/* Meta */}
      <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0">
        {track.durationSec > 0 && (
          <span className="text-[10px] font-medium" style={{ color: "#ababab" }}>
            {formatDuration(track.durationSec)}
          </span>
        )}
        {track.bpm && (
          <span className="text-[9px] uppercase tracking-wider" style={{ color: "#484848" }}>
            {track.bpm} BPM
          </span>
        )}
        <span className="text-[9px]" style={{ color: "#484848" }}>{timeAgo(track.createdAt)}</span>
      </div>

      {/* Open in DAW */}
      <button
        onClick={() => onOpenInStudio(track)}
        title="Open in Studio"
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-100 opacity-0 group-hover:opacity-100"
        style={{ color: "#484848" }}
        onMouseEnter={e => { e.currentTarget.style.color = "#ffdd73"; e.currentTarget.style.background = "#131313"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "#484848"; e.currentTarget.style.background = "transparent"; }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>piano</span>
      </button>
    </div>
  );
}
