import { logger } from "./logger"
// services/social/src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { createClient } from "redis";
import jwt from "jsonwebtoken";
import { InternalJwtPayload, PublicTrack, FeedEvent } from "@sonaralabs/types";

const {
  PORT              = "3009",
  DATABASE_URL,
  INTERNAL_JWT_SECRET,
  REDIS_URL         = "redis://localhost:6379",
  PROFILE_SERVICE_URL = "http://profile:3008",
  PAGE_LIMIT        = "20",
  FEED_CACHE_TTL    = "900", // 15 min
} = process.env;

if (!DATABASE_URL || !INTERNAL_JWT_SECRET) {
  logger.error("[social] Missing DATABASE_URL or INTERNAL_JWT_SECRET");
  process.exit(1);
}

const pool  = new Pool({ connectionString: DATABASE_URL });
const redis = createClient({ url: REDIS_URL });

// ── DB MIGRATIONS ─────────────────────────────────────────────────────────────
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_tracks (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       VARCHAR(24) NOT NULL,
      username      VARCHAR(30) NOT NULL,
      generation_id VARCHAR(24),
      upload_id     VARCHAR(24),
      title         VARCHAR(120) NOT NULL,
      audio_url     TEXT NOT NULL,
      waveform_data JSONB,
      duration_sec  SMALLINT NOT NULL DEFAULT 0,
      bpm           SMALLINT,
      genre_tags    TEXT[] DEFAULT '{}',
      mood_tags     TEXT[] DEFAULT '{}',
      game_type_tags TEXT[] DEFAULT '{}',
      like_count    INT DEFAULT 0,
      is_loop       BOOLEAN DEFAULT false,
      loop_metadata JSONB,
      created_at    TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_tracks_user   ON public_tracks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_created ON public_tracks(created_at DESC);

    CREATE TABLE IF NOT EXISTS follows (
      follower_id VARCHAR(24) NOT NULL,
      followee_id VARCHAR(24) NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (follower_id, followee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

    CREATE TABLE IF NOT EXISTS track_likes (
      user_id  VARCHAR(24) NOT NULL,
      track_id UUID REFERENCES public_tracks(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS feed_events (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id VARCHAR(24) NOT NULL,
      actor_id    VARCHAR(24) NOT NULL,
      actor_username VARCHAR(30),
      verb        VARCHAR(20) NOT NULL,
      object_type VARCHAR(20) NOT NULL,
      object_id   TEXT NOT NULL,
      object_title TEXT,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_feed_recipient ON feed_events(recipient_id, created_at DESC);
  `);
  logger.info("[social] Migration OK");
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function getPayload(req: Request): InternalJwtPayload {
  const token = req.headers.get("x-internal-token");
  if (!token) throw new Error("No internal token");
  const payload = jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
  if (!payload._internal) throw new Error("Not an internal token");
  return payload;
}

function makeInternalToken(): string {
  return jwt.sign({ sub: "social-service", role: "user", _internal: true }, INTERNAL_JWT_SECRET!, { expiresIn: "5m" });
}

// ── SSE CONNECTIONS ───────────────────────────────────────────────────────────
interface SseConn { ctrl: ReadableStreamDefaultController; resetIdle: () => void; }
const sseConnections = new Map<string, Set<SseConn>>();

function broadcast(userId: string, data: object) {
  const conns = sseConnections.get(userId);
  if (!conns?.size) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const conn of conns) {
    try {
      conn.ctrl.enqueue(msg);
      conn.resetIdle();
    } catch { conns.delete(conn); }
  }
}

// ── FAN-OUT: notify followers ─────────────────────────────────────────────────
async function fanOutFeedEvent(
  actorId: string,
  actorUsername: string,
  verb: string,
  objectType: string,
  objectId: string,
  objectTitle?: string,
) {
  // Get all followers of actor
  const { rows: followers } = await pool.query(
    "SELECT follower_id FROM follows WHERE followee_id = $1",
    [actorId]
  );

  if (!followers.length) return;

  const recipientIds = followers.map(r => r.follower_id as string);

  // Bulk insert feed events for each follower
  await pool.query(`
    INSERT INTO feed_events (recipient_id, actor_id, actor_username, verb, object_type, object_id, object_title)
    SELECT unnest($1::varchar[]), $2, $3, $4, $5, $6, $7
  `, [recipientIds, actorId, actorUsername, verb, objectType, objectId, objectTitle ?? null]);

  // Real-time SSE broadcast to online followers
  const event = { type: verb, actorId, actorUsername, objectId, objectTitle, createdAt: new Date().toISOString() };
  for (const id of recipientIds) {
    broadcast(id, event);
    // Invalidate feed cache
    await redis.del(`feed:${id}`).catch(() => {});
  }
}

// ── ROW TO TYPE ───────────────────────────────────────────────────────────────
function rowToTrack(row: Record<string, unknown>): PublicTrack {
  return {
    id:            row.id as string,
    userId:        row.user_id as string,
    username:      (row.username ?? "") as string,
    generationId:  (row.generation_id ?? "") as string,
    title:         row.title as string,
    audioUrl:      row.audio_url as string,
    waveformData:  row.waveform_data as number[] | undefined,
    durationSec:   row.duration_sec as number,
    bpm:           row.bpm as number | undefined,
    genreTags:     (row.genre_tags as string[]) ?? [],
    moodTags:      (row.mood_tags as string[]) ?? [],
    gameTypeTags:  (row.game_type_tags as string[]) ?? [],
    likeCount:     row.like_count as number,
    isLoop:        row.is_loop as boolean,
    loopMetadata:  row.loop_metadata as PublicTrack["loopMetadata"],
    createdAt:     (row.created_at as Date).toISOString(),
  };
}

// ── APP ───────────────────────────────────────────────────────────────────────
const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "social" }));

// ── SSE stream ────────────────────────────────────────────────────────────────
app.get("/sse", (c) => {
  let userId: string;
  try {
    userId = getPayload(c.req.raw).sub;
  } catch {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  // ctrl'i closure üzerinden capture ediyoruz — cancel() controller parametresi almaz,
  // "this" bağlamı da tanımsız, bu yüzden start()'ta kaydedip cancel'da kullanıyoruz.
  const SSE_IDLE_MS = 30 * 60 * 1000; // 30 dakika — kopuk client'ları temizle
  let conn: SseConn;
  let idleTimer: ReturnType<typeof setTimeout>;

  const cleanup = () => {
    clearTimeout(idleTimer);
    sseConnections.get(userId)?.delete(conn);
    try { conn.ctrl.close(); } catch { /* already closed */ }
  };

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(cleanup, SSE_IDLE_MS);
  };

  const stream = new ReadableStream({
    start(ctrl) {
      conn = { ctrl, resetIdle };
      if (!sseConnections.has(userId)) sseConnections.set(userId, new Set());
      sseConnections.get(userId)!.add(conn);
      ctrl.enqueue(`: connected\n\n`);
      resetIdle();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
});

// ── PUBLIC TRACKS ─────────────────────────────────────────────────────────────

// POST /tracks — publish a track
app.post("/tracks", async (c) => {
  try {
    const { sub: userId } = getPayload(c.req.raw);
    const body = await c.req.json() as {
      generationId?: string; uploadId?: string;
      title: string; audioUrl: string;
      durationSec?: number; bpm?: number;
      genreTags?: string[]; moodTags?: string[]; gameTypeTags?: string[];
      isLoop?: boolean; loopMetadata?: { loopStart: number; loopEnd: number; tempo: number };
      waveformData?: number[];
      // username intentionally NOT accepted from client — always fetched from profile service
    };

    if (!body.title || !body.audioUrl) {
      return c.json({ success: false, error: "title and audioUrl required" }, 400);
    }

    // VULN-11: Always fetch username from profile service — never trust client-supplied value
    let username = userId; // fallback to userId if profile lookup fails
    try {
      const res = await fetch(`${PROFILE_SERVICE_URL}/internal/profile/${userId}`, {
        headers: { "x-internal-token": makeInternalToken() },
      });
      const pd = await res.json() as { data?: { username?: string } };
      username = pd.data?.username ?? userId;
    } catch { /* keep fallback */ }

    // VULN-09: Cap waveformData to prevent oversized JSONB payloads
    const safeWaveform = Array.isArray(body.waveformData)
      ? body.waveformData.slice(0, 2000)
      : null;

    const { rows } = await pool.query(`
      INSERT INTO public_tracks
        (user_id, username, generation_id, upload_id, title, audio_url,
         waveform_data, duration_sec, bpm, genre_tags, mood_tags, game_type_tags,
         is_loop, loop_metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      userId, username, body.generationId ?? null, body.uploadId ?? null,
      body.title, body.audioUrl,
      safeWaveform ? JSON.stringify(safeWaveform) : null,
      body.durationSec ?? 0, body.bpm ?? null,
      body.genreTags ?? [], body.moodTags ?? [], body.gameTypeTags ?? [],
      body.isLoop ?? false,
      body.loopMetadata ? JSON.stringify(body.loopMetadata) : null,
    ]);

    const track = rowToTrack(rows[0]);

    // Update profile track count — hata loglansın, sessizce yutulmasın
    fetch(`${PROFILE_SERVICE_URL}/internal/profile/${userId}/counters`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-internal-token": makeInternalToken() },
      body: JSON.stringify({ trackDelta: 1 }),
    }).catch(err => logger.error("[social] track_count sync failed (publish):", { message: String(err) }));

    // Fan-out to followers' feeds
    fanOutFeedEvent(userId, username, "published", "track", track.id, body.title).catch(() => {});

    return c.json({ success: true, data: track }, 201);
  } catch (err: any) {
    if (err.message === "No internal token") return c.json({ success: false, error: "Unauthorized" }, 401);
    logger.error("[social] POST /tracks:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// GET /tracks — explore (public, paginated)
app.get("/tracks", async (c) => {
  try {
    const page  = Math.max(1, parseInt(c.req.query("page") ?? "1"));
    const limit = Math.min(50, parseInt(c.req.query("limit") ?? PAGE_LIMIT));
    const genre  = c.req.query("genre");
    const mood   = c.req.query("mood");
    const q      = c.req.query("q");      // title search
    const userId = c.req.query("userId"); // filter by specific user

    let sql   = "SELECT * FROM public_tracks WHERE true";
    const params: unknown[] = [];
    let pi = 1;

    if (userId) { sql += ` AND user_id = $${pi}`;        params.push(userId); pi++; }
    if (genre)  { sql += ` AND $${pi} = ANY(genre_tags)`; params.push(genre); pi++; }
    if (mood)   { sql += ` AND $${pi} = ANY(mood_tags)`;  params.push(mood);  pi++; }
    if (q)      { sql += ` AND title ILIKE $${pi}`;       params.push(`%${q}%`); pi++; }

    const countSql = sql.replace("SELECT *", "SELECT COUNT(*)");
    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(`${sql} ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`, [...params, limit, (page - 1) * limit]),
      pool.query(countSql, params),
    ]);

    return c.json({
      success: true,
      data: {
        items: rows.map(rowToTrack),
        total: parseInt(countRows[0].count),
        page, pages: Math.ceil(parseInt(countRows[0].count) / limit),
      },
    });
  } catch (err) {
    logger.error("[social] GET /tracks error:", { message: String(err) });
    return c.json({ success: false, error: "Failed to fetch tracks" }, 500);
  }
});

// GET /tracks/:id
app.get("/tracks/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const { rows } = await pool.query("SELECT * FROM public_tracks WHERE id = $1", [id]);
    if (!rows.length) return c.json({ success: false, error: "Not found" }, 404);
    return c.json({ success: true, data: rowToTrack(rows[0]) });
  } catch (err) {
    logger.error("[social] GET /tracks/:id error:", { message: String(err) });
    return c.json({ success: false, error: "Failed to fetch track" }, 500);
  }
});

// DELETE /tracks/:id
app.delete("/tracks/:id", async (c) => {
  let userId: string;
  try { userId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
  try {
    const { id } = c.req.param();
    const { rowCount } = await pool.query(
      "DELETE FROM public_tracks WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (!rowCount) return c.json({ success: false, error: "Not found" }, 404);
    // Decrement track count
    await fetch(`${PROFILE_SERVICE_URL}/internal/profile/${userId}/counters`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-internal-token": makeInternalToken() },
      body: JSON.stringify({ trackDelta: -1 }),
    }).catch(() => {});
    return c.json({ success: true });
  } catch (err) {
    logger.error("[social] DELETE /tracks/:id:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// POST /tracks/:id/like — atomic toggle via single transaction
app.post("/tracks/:id/like", async (c) => {
  try {
    const { sub: userId } = getPayload(c.req.raw);
    const { id } = c.req.param();

    // Single transaction: attempt INSERT; if conflict (already liked) DELETE instead.
    // The CTE returns 1 row if an insert happened, 0 rows if it conflicted.
    // The UPDATE adjusts like_count in the same statement — no separate SELECT needed.
    const { rows } = await pool.query<{ like_count: number; liked: boolean }>(`
      WITH attempt AS (
        INSERT INTO track_likes (user_id, track_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, track_id) DO NOTHING
        RETURNING 1 AS inserted
      ),
      remove AS (
        DELETE FROM track_likes
        WHERE user_id = $1 AND track_id = $2
          AND NOT EXISTS (SELECT 1 FROM attempt)
        RETURNING 1 AS deleted
      ),
      updated AS (
        UPDATE public_tracks
        SET like_count = GREATEST(
          like_count + CASE
            WHEN (SELECT COUNT(*) FROM attempt) > 0 THEN  1
            WHEN (SELECT COUNT(*) FROM remove)  > 0 THEN -1
            ELSE 0
          END,
          0
        )
        WHERE id = $2
        RETURNING like_count
      )
      SELECT
        u.like_count,
        (SELECT COUNT(*) FROM attempt) > 0 AS liked
      FROM updated u
    `, [userId, id]);

    if (!rows.length) return c.json({ success: false, error: "Track not found" }, 404);
    return c.json({ success: true, data: { liked: rows[0].liked, likeCount: rows[0].like_count } });
  } catch (err) {
    if ((err as Error).message === "No internal token")
      return c.json({ success: false, error: "Unauthorized" }, 401);
    logger.error("[social] POST /tracks/:id/like:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── FOLLOW ────────────────────────────────────────────────────────────────────

// POST /follow/:userId — toggle follow/unfollow
app.post("/follow/:userId", async (c) => {
  try {
    const { sub: followerId } = getPayload(c.req.raw);
    const { userId: followeeId } = c.req.param();

    if (followerId === followeeId) {
      return c.json({ success: false, error: "Cannot follow yourself" }, 400);
    }

    // Always derive username from the verified JWT userId via profile service —
    // never trust a caller-supplied header (it was not forwarded by the gateway anyway).
    let followerUsername = followerId;
    try {
      const res = await fetch(`${PROFILE_SERVICE_URL}/internal/profile/${followerId}`, {
        headers: { "x-internal-token": makeInternalToken() },
      });
      const pd = await res.json() as { data?: { username?: string } };
      followerUsername = pd.data?.username ?? followerId;
    } catch { /* use userId as fallback */ }

    const { rows: existing } = await pool.query(
      "SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2",
      [followerId, followeeId]
    );

    let following: boolean;
    if (existing.length) {
      await pool.query("DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2", [followerId, followeeId]);
      following = false;
      // Update counters — log failures so they don't silently drift
      const results = await Promise.allSettled([
        fetch(`${PROFILE_SERVICE_URL}/internal/profile/${followerId}/counters`, {
          method: "PATCH", headers: { "Content-Type": "application/json", "x-internal-token": makeInternalToken() },
          body: JSON.stringify({ followingDelta: -1 }),
        }),
        fetch(`${PROFILE_SERVICE_URL}/internal/profile/${followeeId}/counters`, {
          method: "PATCH", headers: { "Content-Type": "application/json", "x-internal-token": makeInternalToken() },
          body: JSON.stringify({ followerDelta: -1 }),
        }),
      ]);
      results.filter(r => r.status === "rejected")
        .forEach(r => logger.error("[social] Counter sync failed (unfollow):", (r as PromiseRejectedResult).reason));
    } else {
      await pool.query(
        "INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [followerId, followeeId]
      );
      following = true;
      // Update counters — log failures so they don't silently drift
      const results = await Promise.allSettled([
        fetch(`${PROFILE_SERVICE_URL}/internal/profile/${followerId}/counters`, {
          method: "PATCH", headers: { "Content-Type": "application/json", "x-internal-token": makeInternalToken() },
          body: JSON.stringify({ followingDelta: 1 }),
        }),
        fetch(`${PROFILE_SERVICE_URL}/internal/profile/${followeeId}/counters`, {
          method: "PATCH", headers: { "Content-Type": "application/json", "x-internal-token": makeInternalToken() },
          body: JSON.stringify({ followerDelta: 1 }),
        }),
      ]);
      results.filter(r => r.status === "rejected")
        .forEach(r => logger.error("[social] Counter sync failed (follow):", (r as PromiseRejectedResult).reason));
      fanOutFeedEvent(followerId, followerUsername, "followed", "user", followeeId).catch(() => {});
    }

    return c.json({ success: true, data: { following } });
  } catch (err) {
    if ((err as Error).message === "No internal token")
      return c.json({ success: false, error: "Unauthorized" }, 401);
    logger.error("[social] POST /follow:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// GET /followers — own followers
app.get("/followers", async (c) => {
  let userId: string;
  try { userId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
  try {
    const { rows } = await pool.query(
      "SELECT follower_id, created_at FROM follows WHERE followee_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return c.json({ success: true, data: rows });
  } catch (err) {
    logger.error("[social] GET /followers:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// GET /following — who I follow
app.get("/following", async (c) => {
  let userId: string;
  try { userId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
  try {
    const { rows } = await pool.query(
      "SELECT followee_id, created_at FROM follows WHERE follower_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return c.json({ success: true, data: rows });
  } catch (err) {
    logger.error("[social] GET /following:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// GET /follow/:userId/status — am I following this user?
app.get("/follow/:userId/status", async (c) => {
  let followerId: string;
  try { followerId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
  try {
    const { userId: followeeId } = c.req.param();
    const { rows } = await pool.query(
      "SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2",
      [followerId, followeeId]
    );
    return c.json({ success: true, data: { following: rows.length > 0 } });
  } catch (err) {
    logger.error("[social] GET /follow/status:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── FEED ──────────────────────────────────────────────────────────────────────

// GET /feed — activity feed (with Redis cache)
app.get("/feed", async (c) => {
  let userId: string;
  try { userId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
  try {
    const page  = Math.max(1, parseInt(c.req.query("page") ?? "1"));
    const limit = Math.min(50, parseInt(c.req.query("limit") ?? "20"));

    if (page === 1) {
      const cached = await redis.get(`feed:${userId}`).catch(() => null);
      if (cached) {
        return c.json({ success: true, data: { items: JSON.parse(cached), cached: true } });
      }
    }

    const { rows } = await pool.query(`
      SELECT * FROM feed_events
      WHERE recipient_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, (page - 1) * limit]);

    const items: FeedEvent[] = rows.map(r => ({
      id:           r.id as string,
      actorId:      r.actor_id as string,
      actorUsername: (r.actor_username ?? "") as string,
      verb:         r.verb as FeedEvent["verb"],
      objectType:   r.object_type as FeedEvent["objectType"],
      objectId:     r.object_id as string,
      objectTitle:  r.object_title as string | undefined,
      createdAt:    (r.created_at as Date).toISOString(),
    }));

    if (page === 1) {
      redis.setEx(`feed:${userId}`, parseInt(FEED_CACHE_TTL), JSON.stringify(items)).catch(() => {});
    }

    return c.json({ success: true, data: { items } });
  } catch (err) {
    logger.error("[social] GET /feed:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── MY TRACKS ─────────────────────────────────────────────────────────────────
app.get("/my-tracks", async (c) => {
  let userId: string;
  try { userId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
  try {
    const { rows } = await pool.query(
      "SELECT * FROM public_tracks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [userId]
    );
    return c.json({ success: true, data: rows.map(rowToTrack) });
  } catch (err) {
    logger.error("[social] GET /my-tracks:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
async function start() {
  await redis.connect();
  await migrate();
  serve({ fetch: app.fetch, port: parseInt(PORT) }, () =>
    logger.info(`[social] Listening on :${PORT}`)
  );
}

start().catch(err => { logger.error("[social] Startup failed:", { message: String(err) }); process.exit(1); });
