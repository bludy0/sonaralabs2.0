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
if (ACCESS_JWT_SECRET === INTERNAL_JWT_SECRET || ACCESS_JWT_SECRET.length < 32 || INTERNAL_JWT_SECRET.length < 32) {
  logger.error("[gateway] JWT secrets must be distinct and at least 32 characters long");
  process.exit(1);
}

const trustedProxyHops = Math.max(
  0,
  parseInt(process.env.TRUST_PROXY_HOPS ?? (process.env.NODE_ENV === "production" ? "1" : "0")) || 0,
);

// ── REDIS ─────────────────────────────────────────────────────────────────────
const redis = createClient({
  url: REDIS_URL,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 3000) },
});

let redisReady = false;
redis.on("ready", () => { redisReady = true;  logger.info("[gateway] Redis connected"); });
redis.on("error", () => { redisReady = false; });
redis.on("end",   () => { redisReady = false; });
redis.connect().catch((err: Error) => logger.warn("[gateway] Redis unavailable — using in-memory rate-limit fallback", { message: err.message }));

// Redis kesintisinde gateway tamamen limitsiz kalmasın. Bu sayaç instance-local
// olduğu için normal Redis korumasından daha zayıftır ama fail-open davranışını
// önler ve servis kullanılabilirliğini korur.
const localRateLimits = new Map<string, { count: number; expiresAt: number }>();
let localRateOps = 0;

function incrementLocalRateKey(key: string, windowMs: number): number {
  const now = Date.now();
  const current = localRateLimits.get(key);
  const next = !current || current.expiresAt <= now
    ? { count: 1, expiresAt: now + windowMs }
    : { count: current.count + 1, expiresAt: current.expiresAt };
  localRateLimits.set(key, next);

  if (++localRateOps % 1_000 === 0) {
    for (const [storedKey, value] of localRateLimits) {
      if (value.expiresAt <= now) localRateLimits.delete(storedKey);
    }
  }
  return next.count;
}

async function incrementRateKey(key: string, windowMs: number): Promise<number> {
  if (!redisReady) return incrementLocalRateKey(key, windowMs);
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.pExpire(key, windowMs);
    return count;
  } catch {
    return incrementLocalRateKey(key, windowMs);
  }
}

// ── APP ───────────────────────────────────────────────────────────────────────
const app = createApp({
  accessJwtSecret:   ACCESS_JWT_SECRET,
  internalJwtSecret: INTERNAL_JWT_SECRET,
  clientUrl:         CLIENT_URL,
  trustedProxyHops,
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
