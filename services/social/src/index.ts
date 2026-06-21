// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yunus Emre Aslan

import { logger } from "./logger"
// services/social/src/index.ts
// Profile service merged in — all data on MongoDB, no PostgreSQL dependency.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import mongoose from "mongoose";
import { createClient } from "redis";
import jwt from "jsonwebtoken";
import * as Minio from "minio";
import { InternalJwtPayload, UserProfile, PublicTrack, FeedEvent } from "@sonaralabs/types";

const {
  PORT                 = "3009",
  MONGO_URI,
  INTERNAL_JWT_SECRET,
  REDIS_URL            = "redis://localhost:6379",
  // MinIO (avatars — absorbed from profile service)
  MINIO_ENDPOINT       = "minio",
  MINIO_PORT           = "9000",
  MINIO_ACCESS_KEY     = "minioadmin",
  MINIO_SECRET_KEY     = "minioadmin",
  MINIO_USE_SSL        = "false",
  MINIO_BUCKET_AVATARS = "sonaralabs-avatars",
  MINIO_PUBLIC_URL,
  AVATAR_MAX_BYTES     = "5242880", // 5 MB
  // Pagination / cache
  PAGE_LIMIT           = "20",
  FEED_CACHE_TTL       = "900", // 15 min
} = process.env;

if (!MONGO_URI || !INTERNAL_JWT_SECRET) {
  logger.error("[social] Missing MONGO_URI or INTERNAL_JWT_SECRET");
  process.exit(1);
}

const MINIO_PUBLIC_BASE = MINIO_PUBLIC_URL ?? `http://localhost:${MINIO_PORT}`;

// ── MONGODB MODELS ────────────────────────────────────────────────────────────

const profileSchema = new mongoose.Schema({
  userId:         { type: String, required: true, unique: true },
  username:       { type: String, required: true, unique: true },
  displayName:    String,
  bio:            String,
  avatarUrl:      String,
  gameGenres:     [String],
  isPublic:       { type: Boolean, default: true },
  followerCount:  { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  trackCount:     { type: Number, default: 0 },
}, { timestamps: true });
const Profile = mongoose.model("Profile", profileSchema);

const publicTrackSchema = new mongoose.Schema({
  userId:       { type: String, required: true, index: true },
  username:     { type: String, required: true },
  generationId: String,
  uploadId:     String,
  title:        { type: String, required: true },
  audioUrl:     { type: String, required: true },
  waveformData: [Number],
  durationSec:  { type: Number, default: 0 },
  bpm:          Number,
  genreTags:    [String],
  moodTags:     [String],
  gameTypeTags: [String],
  likeCount:    { type: Number, default: 0 },
  isLoop:       { type: Boolean, default: false },
  loopMetadata: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });
publicTrackSchema.index({ createdAt: -1 });
const PublicTrackModel = mongoose.model("PublicTrack", publicTrackSchema);

const followSchema = new mongoose.Schema({
  followerId: { type: String, required: true },
  followeeId: { type: String, required: true },
}, { timestamps: true });
followSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });
followSchema.index({ followeeId: 1 });
const Follow = mongoose.model("Follow", followSchema);

const trackLikeSchema = new mongoose.Schema({
  userId:  { type: String, required: true },
  trackId: { type: mongoose.Schema.Types.ObjectId, required: true },
});
trackLikeSchema.index({ userId: 1, trackId: 1 }, { unique: true });
const TrackLike = mongoose.model("TrackLike", trackLikeSchema);

const feedEventSchema = new mongoose.Schema({
  recipientId:   { type: String, required: true },
  actorId:       { type: String, required: true },
  actorUsername: String,
  verb:          { type: String, required: true },
  objectType:    { type: String, required: true },
  objectId:      { type: String, required: true },
  objectTitle:   String,
}, { timestamps: true });
feedEventSchema.index({ recipientId: 1, createdAt: -1 });
const FeedEventModel = mongoose.model("FeedEvent", feedEventSchema);

// ── MINIO ─────────────────────────────────────────────────────────────────────
const minio = new Minio.Client({
  endPoint:  MINIO_ENDPOINT,
  port:      parseInt(MINIO_PORT),
  useSSL:    MINIO_USE_SSL === "true",
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

async function ensureBucket() {
  const exists = await minio.bucketExists(MINIO_BUCKET_AVATARS);
  if (!exists) {
    await minio.makeBucket(MINIO_BUCKET_AVATARS, "us-east-1");
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${MINIO_BUCKET_AVATARS}/*`] }],
    });
    await minio.setBucketPolicy(MINIO_BUCKET_AVATARS, policy);
  }
}

function avatarUrl(objectName: string): string {
  return `${MINIO_PUBLIC_BASE}/${MINIO_BUCKET_AVATARS}/${objectName}`;
}

// ── REDIS ─────────────────────────────────────────────────────────────────────
const redis = createClient({
  url: REDIS_URL,
  socket: { reconnectStrategy: (r) => Math.min(r * 200, 3000) },
});
redis.on("error", (err) => logger.warn("[social] Redis error:", { message: String(err) }));

// ── AUTH HELPER ───────────────────────────────────────────────────────────────
function getPayload(req: Request): InternalJwtPayload {
  const token = req.headers.get("x-internal-token");
  if (!token) throw new Error("No internal token");
  const payload = jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
  if (!payload._internal) throw new Error("Not an internal token");
  return payload;
}

// ── DOC MAPPERS ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docToProfile(doc: any): UserProfile {
  return {
    userId:         doc.userId,
    username:       doc.username,
    displayName:    doc.displayName,
    bio:            doc.bio,
    avatarUrl:      doc.avatarUrl,
    gameGenres:     doc.gameGenres ?? [],
    isPublic:       doc.isPublic,
    followerCount:  doc.followerCount,
    followingCount: doc.followingCount,
    trackCount:     doc.trackCount,
    createdAt:      new Date(doc.createdAt).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docToTrack(doc: any): PublicTrack {
  return {
    id:            String(doc._id),
    userId:        doc.userId,
    username:      doc.username ?? "",
    generationId:  doc.generationId ?? "",
    title:         doc.title,
    audioUrl:      doc.audioUrl,
    waveformData:  doc.waveformData,
    durationSec:   doc.durationSec,
    bpm:           doc.bpm,
    genreTags:     doc.genreTags ?? [],
    moodTags:      doc.moodTags ?? [],
    gameTypeTags:  doc.gameTypeTags ?? [],
    likeCount:     doc.likeCount,
    isLoop:        doc.isLoop,
    loopMetadata:  doc.loopMetadata,
    createdAt:     new Date(doc.createdAt).toISOString(),
  };
}

// ── SSE CONNECTIONS ───────────────────────────────────────────────────────────
interface SseConn { ctrl: ReadableStreamDefaultController; resetIdle: () => void; }
const sseConnections = new Map<string, Set<SseConn>>();

function broadcast(userId: string, data: object) {
  const conns = sseConnections.get(userId);
  if (!conns?.size) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const conn of conns) {
    try { conn.ctrl.enqueue(msg); conn.resetIdle(); }
    catch { conns.delete(conn); }
  }
}

// ── FAN-OUT ───────────────────────────────────────────────────────────────────
async function fanOutFeedEvent(
  actorId: string, actorUsername: string,
  verb: string, objectType: string, objectId: string, objectTitle?: string,
) {
  const follows = await Follow.find({ followeeId: actorId }).select("followerId").lean();
  if (!follows.length) return;

  const recipientIds = follows.map(f => f.followerId);
  await FeedEventModel.insertMany(
    recipientIds.map(recipientId => ({ recipientId, actorId, actorUsername, verb, objectType, objectId, objectTitle }))
  );

  const event = { type: verb, actorId, actorUsername, objectId, objectTitle, createdAt: new Date().toISOString() };
  for (const id of recipientIds) {
    broadcast(id, event);
    redis.del(`feed:${id}`).catch(() => {});
  }
}

// ── APP ───────────────────────────────────────────────────────────────────────
const app = new Hono();

app.get("/health", (c) => c.json({
  status: "ok", service: "social",
  sseClients: [...sseConnections.values()].reduce((n, s) => n + s.size, 0),
}));

// ── SSE ───────────────────────────────────────────────────────────────────────
app.get("/sse", (c) => {
  let userId: string;
  try { userId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }

  const SSE_IDLE_MS = 30 * 60 * 1000;
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
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
});

// ── PROFILE ROUTES ────────────────────────────────────────────────────────────

// GET /profile/me — get or create own profile
app.get("/profile/me", async (c) => {
  let userId: string;
  try { userId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
  try {
    const defaultUsername = `user_${userId.slice(-8)}`;
    const profile = await Profile.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, username: defaultUsername, isPublic: true } },
      { upsert: true, new: true },
    ).lean();
    return c.json({ success: true, data: docToProfile(profile) });
  } catch (err) {
    logger.error("[social] GET /profile/me:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// PUT /profile/me — update profile
app.put("/profile/me", async (c) => {
  try {
    const { sub: userId } = getPayload(c.req.raw);
    const body = await c.req.json() as {
      username?: string; displayName?: string; bio?: string;
      gameGenres?: string[]; isPublic?: boolean;
    };
    const patch: Record<string, unknown> = {};
    if (body.username    !== undefined) patch.username    = body.username;
    if (body.displayName !== undefined) patch.displayName = body.displayName;
    if (body.bio         !== undefined) patch.bio         = body.bio;
    if (body.gameGenres  !== undefined) patch.gameGenres  = body.gameGenres;
    if (body.isPublic    !== undefined) patch.isPublic    = body.isPublic;

    const profile = await Profile.findOneAndUpdate(
      { userId },
      { $set: patch, $setOnInsert: { userId } },
      { upsert: true, new: true },
    ).lean();
    return c.json({ success: true, data: docToProfile(profile) });
  } catch (err: any) {
    if (err.code === 11000) return c.json({ success: false, error: "Username already taken" }, 409);
    if ((err as Error).message === "No internal token") return c.json({ success: false, error: "Unauthorized" }, 401);
    logger.error("[social] PUT /profile/me:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// POST /profile/me/avatar — avatar upload
app.post("/profile/me/avatar", async (c) => {
  try {
    const { sub: userId } = getPayload(c.req.raw);
    const formData = await c.req.formData();
    const file = formData.get("avatar") as File | null;
    if (!file) return c.json({ success: false, error: "No file provided" }, 400);

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type))
      return c.json({ success: false, error: "Only JPEG, PNG and WEBP allowed" }, 400);
    if (file.size > parseInt(AVATAR_MAX_BYTES))
      return c.json({ success: false, error: "Avatar must be under 5 MB" }, 413);

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const objectName = `${userId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await minio.putObject(MINIO_BUCKET_AVATARS, objectName, buffer, buffer.length, { "Content-Type": file.type });
    const url = avatarUrl(objectName);
    await Profile.findOneAndUpdate({ userId }, { $set: { avatarUrl: url } });
    return c.json({ success: true, data: { avatarUrl: url } });
  } catch (err: any) {
    if ((err as Error).message === "No internal token") return c.json({ success: false, error: "Unauthorized" }, 401);
    logger.error("[social] POST /profile/me/avatar:", { message: String(err) });
    return c.json({ success: false, error: "Upload failed" }, 500);
  }
});

// GET /profile/internal/:userId — for other services (upload, etc.)
// IMPORTANT: registered BEFORE /:username so "internal" is never matched as a username
app.get("/profile/internal/:userId", async (c) => {
  try {
    getPayload(c.req.raw);
    const { userId } = c.req.param();
    const profile = await Profile.findOne({ userId }).lean();
    if (!profile) return c.json({ success: false, error: "Not found" }, 404);
    return c.json({ success: true, data: docToProfile(profile) });
  } catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
});

// GET /profile/:username — public profile
// Registered AFTER /profile/me and /profile/internal/* so those are never matched here
app.get("/profile/:username", async (c) => {
  try {
    const { username } = c.req.param();
    const profile = await Profile.findOne({ username, isPublic: true }).lean();
    if (!profile) return c.json({ success: false, error: "Profile not found" }, 404);
    return c.json({ success: true, data: docToProfile(profile) });
  } catch (err) {
    logger.error("[social] GET /profile/:username:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
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
    };
    if (!body.title || !body.audioUrl)
      return c.json({ success: false, error: "title and audioUrl required" }, 400);

    // Always fetch username from Profile — never trust client-supplied value
    const profileDoc = await Profile.findOne({ userId }).select("username").lean();
    const username = profileDoc?.username ?? userId;

    // Cap waveformData to prevent oversized payloads
    const safeWaveform = Array.isArray(body.waveformData) ? body.waveformData.slice(0, 2000) : undefined;

    const track = await PublicTrackModel.create({
      userId, username,
      generationId: body.generationId,
      uploadId: body.uploadId,
      title: body.title,
      audioUrl: body.audioUrl,
      waveformData: safeWaveform,
      durationSec: body.durationSec ?? 0,
      bpm: body.bpm,
      genreTags: body.genreTags ?? [],
      moodTags: body.moodTags ?? [],
      gameTypeTags: body.gameTypeTags ?? [],
      isLoop: body.isLoop ?? false,
      loopMetadata: body.loopMetadata,
    });

    // Increment track count — log on failure, don't fail the request
    Profile.findOneAndUpdate({ userId }, { $inc: { trackCount: 1 } })
      .catch(err => logger.error("[social] track_count sync failed (publish):", { message: String(err) }));

    fanOutFeedEvent(userId, username, "published", "track", String(track._id), body.title).catch(() => {});

    return c.json({ success: true, data: docToTrack(track) }, 201);
  } catch (err: any) {
    if ((err as Error).message === "No internal token") return c.json({ success: false, error: "Unauthorized" }, 401);
    logger.error("[social] POST /tracks:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// GET /tracks — explore (public, paginated, filterable)
app.get("/tracks", async (c) => {
  try {
    const page  = Math.max(1, parseInt(c.req.query("page") ?? "1"));
    const limit = Math.min(50, parseInt(c.req.query("limit") ?? PAGE_LIMIT));
    const genre  = c.req.query("genre");
    const mood   = c.req.query("mood");
    const q      = c.req.query("q");
    const userId = c.req.query("userId");

    const filter: Record<string, unknown> = {};
    if (userId) filter.userId = userId;
    if (genre)  filter.genreTags  = genre;
    if (mood)   filter.moodTags   = mood;
    if (q)      filter.title = { $regex: q, $options: "i" };

    const [items, total] = await Promise.all([
      PublicTrackModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PublicTrackModel.countDocuments(filter),
    ]);

    return c.json({
      success: true,
      data: { items: items.map(docToTrack), total, page, pages: Math.ceil(total / limit) },
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
    const track = await PublicTrackModel.findById(id).lean();
    if (!track) return c.json({ success: false, error: "Not found" }, 404);
    return c.json({ success: true, data: docToTrack(track) });
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
    const track = await PublicTrackModel.findOneAndDelete({ _id: id, userId });
    if (!track) return c.json({ success: false, error: "Not found" }, 404);
    Profile.findOneAndUpdate({ userId }, { $inc: { trackCount: -1 } }).catch(() => {});
    return c.json({ success: true });
  } catch (err) {
    logger.error("[social] DELETE /tracks/:id:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// POST /tracks/:id/like — insert-on-conflict toggle (like / unlike)
app.post("/tracks/:id/like", async (c) => {
  try {
    const { sub: userId } = getPayload(c.req.raw);
    const { id } = c.req.param();
    const trackId = new mongoose.Types.ObjectId(id);

    try {
      // Try to insert — throws E11000 if already liked → becomes unlike
      await TrackLike.create({ userId, trackId });
      const track = await PublicTrackModel.findByIdAndUpdate(
        trackId, { $inc: { likeCount: 1 } }, { new: true }
      ).lean();
      if (!track) {
        await TrackLike.deleteOne({ userId, trackId }); // rollback orphan
        return c.json({ success: false, error: "Track not found" }, 404);
      }

      // Fan-out to followers
      const profileDoc = await Profile.findOne({ userId }).select("username").lean();
      const username = profileDoc?.username ?? userId;
      fanOutFeedEvent(userId, username, "liked", "track", id, track.title).catch(() => {});

      return c.json({ success: true, data: { liked: true, likeCount: track.likeCount } });
    } catch (err: any) {
      if (err.code !== 11000) throw err;
      // Already liked — unlike it
      await TrackLike.deleteOne({ userId, trackId });
      const track = await PublicTrackModel.findByIdAndUpdate(
        trackId, [{ $set: { likeCount: { $max: [{ $subtract: ["$likeCount", 1] }, 0] } } }], { new: true }
      ).lean();
      return c.json({ success: true, data: { liked: false, likeCount: track?.likeCount ?? 0 } });
    }
  } catch (err) {
    if ((err as Error).message === "No internal token")
      return c.json({ success: false, error: "Unauthorized" }, 401);
    logger.error("[social] POST /tracks/:id/like:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── FOLLOW ────────────────────────────────────────────────────────────────────

// POST /follow/:userId — toggle follow / unfollow
app.post("/follow/:userId", async (c) => {
  try {
    const { sub: followerId } = getPayload(c.req.raw);
    const { userId: followeeId } = c.req.param();

    if (followerId === followeeId)
      return c.json({ success: false, error: "Cannot follow yourself" }, 400);

    // Always fetch username from Profile — never trust client-supplied value
    const followerProfile = await Profile.findOne({ userId: followerId }).select("username").lean();
    const followerUsername = followerProfile?.username ?? followerId;

    const existing = await Follow.findOne({ followerId, followeeId });
    let following: boolean;

    if (existing) {
      await Follow.deleteOne({ followerId, followeeId });
      following = false;
      const results = await Promise.allSettled([
        Profile.findOneAndUpdate({ userId: followerId }, { $inc: { followingCount: -1 } }),
        Profile.findOneAndUpdate({ userId: followeeId }, { $inc: { followerCount: -1 } }),
      ]);
      results.filter(r => r.status === "rejected")
        .forEach(r => logger.error("[social] Counter sync failed (unfollow):", (r as PromiseRejectedResult).reason));
    } else {
      try {
        await Follow.create({ followerId, followeeId });
      } catch (err: any) {
        if (err.code !== 11000) throw err; // concurrent follow — treat as success
      }
      following = true;
      const results = await Promise.allSettled([
        Profile.findOneAndUpdate({ userId: followerId }, { $inc: { followingCount: 1 } }),
        Profile.findOneAndUpdate({ userId: followeeId }, { $inc: { followerCount: 1 } }),
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
    const follows = await Follow.find({ followeeId: userId }).sort({ createdAt: -1 }).lean();
    return c.json({ success: true, data: follows.map(f => ({ follower_id: f.followerId, created_at: f.createdAt })) });
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
    const follows = await Follow.find({ followerId: userId }).sort({ createdAt: -1 }).lean();
    return c.json({ success: true, data: follows.map(f => ({ followee_id: f.followeeId, created_at: f.createdAt })) });
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
    const exists = await Follow.exists({ followerId, followeeId });
    return c.json({ success: true, data: { following: !!exists } });
  } catch (err) {
    logger.error("[social] GET /follow/status:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── FEED ──────────────────────────────────────────────────────────────────────

app.get("/feed", async (c) => {
  let userId: string;
  try { userId = getPayload(c.req.raw).sub; }
  catch { return c.json({ success: false, error: "Unauthorized" }, 401); }
  try {
    const page  = Math.max(1, parseInt(c.req.query("page") ?? "1"));
    const limit = Math.min(50, parseInt(c.req.query("limit") ?? "20"));

    if (page === 1) {
      const cached = await redis.get(`feed:${userId}`).catch(() => null);
      if (cached) return c.json({ success: true, data: { items: JSON.parse(cached), cached: true } });
    }

    const events = await FeedEventModel.find({ recipientId: userId })
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();

    const items: FeedEvent[] = events.map(e => ({
      id:           String(e._id),
      actorId:      e.actorId,
      actorUsername: e.actorUsername ?? "",
      verb:         e.verb as FeedEvent["verb"],
      objectType:   e.objectType as FeedEvent["objectType"],
      objectId:     e.objectId,
      objectTitle:  e.objectTitle ?? undefined,
      createdAt:    new Date(e.createdAt).toISOString(),
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
    const tracks = await PublicTrackModel.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
    return c.json({ success: true, data: tracks.map(docToTrack) });
  } catch (err) {
    logger.error("[social] GET /my-tracks:", { message: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
async function start() {
  await mongoose.connect(MONGO_URI!);
  logger.info("[social] MongoDB connected");
  await redis.connect();
  logger.info("[social] Redis connected");
  await ensureBucket().catch(e => logger.warn("[social] MinIO bucket warning:", { message: String(e) }));
  serve({ fetch: app.fetch, port: parseInt(PORT) }, () =>
    logger.info(`[social] Listening on :${PORT}`)
  );
}

start().catch(err => { logger.error("[social] Startup failed:", { message: String(err) }); process.exit(1); });
