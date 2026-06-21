// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yunus Emre Aslan

import { logger } from "./logger";
import { serve }  from "@hono/node-server";
import { createClient } from "redis";
import { createApp }    from "./createApp";

// ── ENV ───────────────────────────────────────────────────────────────────────
const {
  PORT = "3000",
  ACCESS_JWT_SECRET,
  INTERNAL_JWT_SECRET,
  REDIS_URL                = "redis://localhost:6379",
  CLIENT_URL               = "http://localhost:5173",
  RATE_LIMIT_GENERAL       = "30",
  RATE_LIMIT_GENERATION    = "3",
  RATE_LIMIT_UPLOAD        = "10",
  RATE_LIMIT_AUTH          = "10",
  AUTH_SERVICE_URL         = "http://auth:3001",
  GENERATION_SERVICE_URL   = "http://generation:3002",
  UPLOAD_SERVICE_URL       = "http://upload:3003",
  LIBRARY_SERVICE_URL      = "http://library:3004",
  ADMIN_SERVICE_URL  = "http://admin:3006",
  SOCIAL_SERVICE_URL  = "http://social:3009",
} = process.env;

if (!ACCESS_JWT_SECRET || !INTERNAL_JWT_SECRET) {
  logger.error("[gateway] Missing required JWT secrets — ACCESS_JWT_SECRET and INTERNAL_JWT_SECRET must be set");
  process.exit(1);
}

// ── REDIS ─────────────────────────────────────────────────────────────────────
const redis = createClient({
  url: REDIS_URL,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 3000) },
});

let redisReady = false;
redis.on("ready", () => { redisReady = true;  logger.info("[gateway] Redis connected"); });
redis.on("error", () => { redisReady = false; }); // prevent crash; rate limit passes through
redis.on("end",   () => { redisReady = false; });
redis.connect().catch((err: Error) => logger.warn("[gateway] Redis unavailable — rate limiting disabled", { message: err.message }));

async function incrementRateKey(key: string, windowMs: number): Promise<number> {
  if (!redisReady) return 0; // Redis down → pass all (dev safety)
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.pExpire(key, windowMs);
    return count;
  } catch {
    return 0;
  }
}

// ── APP ───────────────────────────────────────────────────────────────────────
const app = createApp({
  accessJwtSecret:   ACCESS_JWT_SECRET,
  internalJwtSecret: INTERNAL_JWT_SECRET,
  clientUrl:         CLIENT_URL,
  incrementRateKey,
  serviceUrls: {
    auth:       AUTH_SERVICE_URL,
    generation: GENERATION_SERVICE_URL,
    upload:     UPLOAD_SERVICE_URL,
    library:    LIBRARY_SERVICE_URL,
    admin:      ADMIN_SERVICE_URL,
    social:     SOCIAL_SERVICE_URL,
  },
  rateLimits: {
    general:    parseInt(RATE_LIMIT_GENERAL),
    generation: parseInt(RATE_LIMIT_GENERATION),
    upload:     parseInt(RATE_LIMIT_UPLOAD),
    auth:       parseInt(RATE_LIMIT_AUTH),
  },
});

// ── SERVE ─────────────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: parseInt(PORT) }, () =>
  logger.info(`[gateway] Listening on :${PORT}`)
);
