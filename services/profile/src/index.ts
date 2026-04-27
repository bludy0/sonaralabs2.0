// services/profile/src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Pool } from "pg";
import jwt from "jsonwebtoken";
import * as Minio from "minio";
import { InternalJwtPayload, UserProfile } from "@sonaralabs/types";

const {
  PORT = "3008",
  DATABASE_URL,
  INTERNAL_JWT_SECRET,
  MINIO_ENDPOINT   = "minio",
  MINIO_PORT       = "9000",
  MINIO_ACCESS_KEY = "minioadmin",
  MINIO_SECRET_KEY = "minioadmin",
  MINIO_USE_SSL    = "false",
  MINIO_BUCKET_AVATARS = "sonaralabs-avatars",
  AVATAR_MAX_BYTES = "5242880", // 5 MB
} = process.env;

if (!DATABASE_URL || !INTERNAL_JWT_SECRET) {
  console.error("[profile] Missing DATABASE_URL or INTERNAL_JWT_SECRET");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const minio = new Minio.Client({
  endPoint:  MINIO_ENDPOINT,
  port:      parseInt(MINIO_PORT),
  useSSL:    MINIO_USE_SSL === "true",
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

// ── DB MIGRATIONS ─────────────────────────────────────────────────────────────
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id         VARCHAR(24) PRIMARY KEY,
      username        VARCHAR(30) UNIQUE NOT NULL,
      display_name    VARCHAR(60),
      bio             TEXT,
      avatar_url      TEXT,
      game_genres     TEXT[]  DEFAULT '{}',
      is_public       BOOLEAN DEFAULT true,
      follower_count  INT     DEFAULT 0,
      following_count INT     DEFAULT 0,
      track_count     INT     DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT now(),
      updated_at      TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_username ON user_profiles(username);
  `);
  console.log("[profile] Migration OK");
}

// ── AUTH HELPER ───────────────────────────────────────────────────────────────
function getPayload(req: Request): InternalJwtPayload {
  const token = req.headers.get("x-internal-token");
  if (!token) throw new Error("No internal token");
  return jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
}

// ── MINIO HELPERS ─────────────────────────────────────────────────────────────
async function ensureBucket() {
  const exists = await minio.bucketExists(MINIO_BUCKET_AVATARS);
  if (!exists) {
    await minio.makeBucket(MINIO_BUCKET_AVATARS, "us-east-1");
    // Set public-read policy for avatars
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${MINIO_BUCKET_AVATARS}/*`] }],
    });
    await minio.setBucketPolicy(MINIO_BUCKET_AVATARS, policy);
  }
}

function avatarUrl(objectName: string): string {
  return `http://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET_AVATARS}/${objectName}`;
}

function rowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    userId:         row.user_id as string,
    username:       row.username as string,
    displayName:    row.display_name as string | undefined,
    bio:            row.bio as string | undefined,
    avatarUrl:      row.avatar_url as string | undefined,
    gameGenres:     (row.game_genres as string[]) ?? [],
    isPublic:       row.is_public as boolean,
    followerCount:  row.follower_count as number,
    followingCount: row.following_count as number,
    trackCount:     row.track_count as number,
    createdAt:      (row.created_at as Date).toISOString(),
  };
}

// ── APP ───────────────────────────────────────────────────────────────────────
const app = new Hono();

// GET /health
app.get("/health", (c) => c.json({ status: "ok", service: "profile" }));

// ── GET /me ───────────────────────────────────────────────────────────────────
// Profil yoksa otomatik oluşturur. MongoDB ObjectId'nin son 8 karakteri zaten
// hex (0-9, a-f) olduğundan default username her zaman geçerli formattadır.
// ON CONFLICT (user_id) DO UPDATE ile tek sorgu — ayrı SELECT/refetch gereksiz.
app.get("/me", async (c) => {
  try {
    const { sub: userId } = getPayload(c.req.raw);
    const defaultUsername = `user_${userId.slice(-8)}`;
    const { rows } = await pool.query(`
      INSERT INTO user_profiles (user_id, username, is_public)
      VALUES ($1, $2, true)
      ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING *
    `, [userId, defaultUsername]);
    return c.json({ success: true, data: rowToProfile(rows[0]) });
  } catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
});

// ── PUT /me ───────────────────────────────────────────────────────────────────
app.put("/me", async (c) => {
  try {
    const { sub: userId } = getPayload(c.req.raw);
    const body = await c.req.json() as {
      username?: string; displayName?: string; bio?: string;
      gameGenres?: string[]; isPublic?: boolean;
    };

    const { username, displayName, bio, gameGenres, isPublic } = body;

    // Upsert
    const { rows } = await pool.query(`
      INSERT INTO user_profiles (user_id, username, display_name, bio, game_genres, is_public, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (user_id) DO UPDATE SET
        username     = COALESCE($2, user_profiles.username),
        display_name = COALESCE($3, user_profiles.display_name),
        bio          = COALESCE($4, user_profiles.bio),
        game_genres  = COALESCE($5, user_profiles.game_genres),
        is_public    = COALESCE($6, user_profiles.is_public),
        updated_at   = now()
      RETURNING *
    `, [userId, username ?? null, displayName ?? null, bio ?? null,
        gameGenres ?? null, isPublic ?? null]);

    return c.json({ success: true, data: rowToProfile(rows[0]) });
  } catch (err: any) {
    if (err.code === "23505") return c.json({ success: false, error: "Username already taken" }, 409);
    if (err.message === "No internal token") return c.json({ success: false, error: "Unauthorized" }, 401);
    console.error("[profile] PUT /me:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── POST /me/avatar ───────────────────────────────────────────────────────────
app.post("/me/avatar", async (c) => {
  try {
    const { sub: userId } = getPayload(c.req.raw);
    const formData = await c.req.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) return c.json({ success: false, error: "No file provided" }, 400);

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      return c.json({ success: false, error: "Only JPEG, PNG and WEBP allowed" }, 400);
    }
    if (file.size > parseInt(AVATAR_MAX_BYTES)) {
      return c.json({ success: false, error: "Avatar must be under 5 MB" }, 413);
    }

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const objectName = `${userId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await minio.putObject(MINIO_BUCKET_AVATARS, objectName, buffer, buffer.length, {
      "Content-Type": file.type,
    });

    const url = avatarUrl(objectName);
    await pool.query(
      "UPDATE user_profiles SET avatar_url = $1, updated_at = now() WHERE user_id = $2",
      [url, userId]
    );

    return c.json({ success: true, data: { avatarUrl: url } });
  } catch (err: any) {
    if (err.message === "No internal token") return c.json({ success: false, error: "Unauthorized" }, 401);
    console.error("[profile] POST /me/avatar:", err);
    return c.json({ success: false, error: "Upload failed" }, 500);
  }
});

// ── GET /internal/profile/:userId — for social service ───────────────────────
// IMPORTANT: registered BEFORE /:username so "internal" is never matched as a username
app.get("/internal/profile/:userId", async (c) => {
  try {
    getPayload(c.req.raw);
    const { userId } = c.req.param();
    const { rows } = await pool.query(
      "SELECT * FROM user_profiles WHERE user_id = $1",
      [userId]
    );
    if (!rows.length) return c.json({ success: false, error: "Not found" }, 404);
    return c.json({ success: true, data: rowToProfile(rows[0]) });
  } catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
});

// ── Internal: increment/decrement counters ───────────────────────────────────
app.patch("/internal/profile/:userId/counters", async (c) => {
  try {
    getPayload(c.req.raw);
    const { userId } = c.req.param();
    const body = await c.req.json() as {
      followerDelta?: number; followingDelta?: number; trackDelta?: number;
    };
    const { followerDelta = 0, followingDelta = 0, trackDelta = 0 } = body;
    // GREATEST(..., 0) prevents counters going negative due to sync races
    await pool.query(`
      UPDATE user_profiles SET
        follower_count  = GREATEST(follower_count  + $1, 0),
        following_count = GREATEST(following_count + $2, 0),
        track_count     = GREATEST(track_count     + $3, 0),
        updated_at      = now()
      WHERE user_id = $4
    `, [followerDelta, followingDelta, trackDelta, userId]);
    return c.json({ success: true });
  } catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
});

// ── GET /:username — public profile ──────────────────────────────────────────
// Registered AFTER /internal/* routes so "internal" is never matched here
app.get("/:username", async (c) => {
  try {
    const { username } = c.req.param();
    const { rows } = await pool.query(
      "SELECT * FROM user_profiles WHERE username = $1 AND is_public = true",
      [username]
    );
    if (!rows.length) return c.json({ success: false, error: "Profile not found" }, 404);
    return c.json({ success: true, data: rowToProfile(rows[0]) });
  } catch (err) {
    console.error("[profile] GET /:username:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
async function start() {
  await migrate();
  await ensureBucket().catch(e => console.warn("[profile] MinIO bucket warning:", e.message));
  serve({ fetch: app.fetch, port: parseInt(PORT) }, () =>
    console.log(`[profile] Listening on :${PORT}`)
  );
}

start().catch(err => { console.error("[profile] Startup failed:", err); process.exit(1); });
