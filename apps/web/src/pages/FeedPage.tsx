import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface FeedEvent {
  id: string;
  actorId: string;
  actorUsername: string;
  verb: "published" | "liked" | "followed";
  objectType: "track" | "user";
  objectId: string;
  objectTitle?: string;
  createdAt: string;
}

interface SocialSseEvent {
  type: "published" | "liked" | "followed";
  actorId: string;
  actorUsername: string;
  objectId: string;
  objectTitle?: string;
  createdAt: string;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function verbLabel(verb: FeedEvent["verb"]) {
  switch (verb) {
    case "published": return "published a track";
    case "liked":     return "liked a track";
    case "followed":  return "started following someone";
  }
}

const VERB_ICON: Record<FeedEvent["verb"], string> = {
  published: "queue_music",
  liked:     "favorite",
  followed:  "person_add",
};

export default function FeedPage() {
  const navigate = useNavigate();
  const [events, setEvents]    = useState<FeedEvent[]>([]);
  const [loading, setLoading]  = useState(true);
  const [empty, setEmpty]      = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/social/feed", { params: { limit: 50 } });
      const items: FeedEvent[] = data.data?.items ?? [];
      setEvents(items);
      setEmpty(items.length === 0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  // SSE real-time — with exponential backoff reconnect
  useEffect(() => {
    let destroyed = false;
    let retryMs   = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (destroyed) return;
      const es = new EventSource("/api/social/sse", { withCredentials: true });
      esRef.current = es;

      es.onmessage = (ev) => {
        retryMs = 1000; // reset backoff on successful message
        try {
          const parsed: SocialSseEvent = JSON.parse(ev.data);
          if (parsed.type === "published") {
            const synth: FeedEvent = {
              id:            `sse-${Date.now()}`,
              actorId:       parsed.actorId,
              actorUsername: parsed.actorUsername,
              verb:          "published",
              objectType:    "track",
              objectId:      parsed.objectId,
              objectTitle:   parsed.objectTitle,
              createdAt:     parsed.createdAt,
            };
            setEvents(prev => [synth, ...prev]);
            setLiveCount(n => n + 1);
            setEmpty(false);
          }
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        es.close();
        if (!destroyed) {
          retryTimer = setTimeout(() => {
            retryMs = Math.min(retryMs * 2, 30_000); // cap at 30s
            connect();
          }, retryMs);
        }
      };
    }

    connect();
    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      esRef.current?.close();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-page)" }}>
        <p lang="en" className="text-[11px] tracking-widest uppercase" style={{ color: "var(--text-3)" }}>
          Loading stream…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        {/* Header */}
        <div>
          <p className="text-[10px] font-semibold tracking-[0.25em] uppercase mb-1" style={{ color: "var(--text-2)" }}>
            SONARALABS / SOCIAL_FEED
          </p>
          <div className="flex items-center justify-between">
            <h1
              className="text-[2.2rem] font-bold uppercase leading-none"
              style={{ letterSpacing: "-0.02em", color: "var(--text-1)" }}
            >
              Feed
            </h1>
            {liveCount > 0 && (
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full animate-pulse"
                style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
              >
                {liveCount} new
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>
            Activity from people you follow
          </p>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ background: "var(--bg-input)" }} />

        {/* Empty state */}
        {empty && (
          <div className="text-center py-24 space-y-4">
            <span className="material-symbols-outlined block" style={{ fontSize: 40, color: "var(--bg-border)" }}>
              dynamic_feed
            </span>
            <p lang="en" className="text-[12px] uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              Nothing here yet.
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              Follow creators on the{" "}
              <Link to="/explore" style={{ color: "var(--accent)" }}>
                Explore
              </Link>{" "}
              page to see their activity.
            </p>
          </div>
        )}

        {/* Feed events */}
        <div className="space-y-2">
          {events.map(event => (
            <FeedCard
              key={event.id}
              event={event}
              onOpenTrack={() => navigate("/explore")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Feed Card ─────────────────────────────────────────────────────────────────

interface FeedCardProps {
  event: FeedEvent;
  onOpenTrack: (id: string) => void;
}

function FeedCard({ event }: FeedCardProps) {
  const isPublished = event.verb === "published" && event.objectType === "track";

  return (
    <div
      className="px-5 py-4 rounded-lg transition-all duration-100"
      style={{ background: "var(--bg-card)" }}
    >
      <div className="flex items-start gap-3">
        {/* Verb icon + avatar */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase"
            style={{ background: "var(--bg-input)", color: "var(--accent)" }}
          >
            {event.actorUsername?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="material-symbols-outlined" style={{ fontSize: 12, color: "var(--text-3)" }}>
            {VERB_ICON[event.verb]}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Action line */}
          <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
            <Link
              to={`/profile/${event.actorUsername}`}
              className="font-semibold transition-colors duration-100"
              style={{ color: "var(--text-1)" }}
            >
              @{event.actorUsername}
            </Link>
            {" "}
            {verbLabel(event.verb)}
          </p>

          {/* Track card (published) */}
          {isPublished && event.objectTitle && (
            <div
              className="mt-2 rounded-lg px-4 py-3 flex items-center gap-3 transition-all duration-100"
              style={{ background: "var(--bg-input)" }}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--accent)" }}>
                  queue_music
                </span>
              </div>
              <p className="text-[13px] font-semibold truncate flex-1" style={{ color: "var(--text-1)" }}>
                {event.objectTitle}
              </p>
              <Link
                to={`/profile/${event.actorUsername}`}
                className="text-[10px] font-bold uppercase tracking-widest shrink-0 transition-colors duration-100"
                style={{ color: "var(--accent)" }}
              >
                Listen →
              </Link>
            </div>
          )}

          <p className="text-[10px] mt-1.5 uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {timeAgo(event.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
