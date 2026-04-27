// services/gateway/src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { getCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { createClient } from "redis";
import jwt from "jsonwebtoken";
import type { Context, MiddlewareHandler } from "hono";
import { UserJwtPayload, InternalJwtPayload, INTERNAL_TOKEN_HEADER } from "@sonaralabs/types";

// ── ENV ───────────────────────────────────────────────────────────────────────
const {
  PORT = "3000",
  ACCESS_JWT_SECRET,
  INTERNAL_JWT_SECRET,
  REDIS_URL = "redis://localhost:6379",
  CLIENT_URL = "http://localhost:5173",
  RATE_LIMIT_GENERAL    = "30",
  RATE_LIMIT_GENERATION = "3",
  RATE_LIMIT_UPLOAD     = "10",
  RATE_LIMIT_AUTH       = "10",
  AUTH_SERVICE_URL         = "http://auth:3001",
  GENERATION_SERVICE_URL   = "http://generation:3002",
  UPLOAD_SERVICE_URL       = "http://upload:3003",
  LIBRARY_SERVICE_URL      = "http://library:3004",
  CREDIT_SERVICE_URL       = "http://credit:3005",
  ADMIN_SERVICE_URL        = "http://admin:3006",
  NOTIFICATION_SERVICE_URL = "http://notification:3007",
  PROFILE_SERVICE_URL      = "http://profile:3008",
  SOCIAL_SERVICE_URL       = "http://social:3009",
} = process.env;

if (!ACCESS_JWT_SECRET || !INTERNAL_JWT_SECRET) {
  console.error("[gateway] Missing required JWT secrets");
  process.exit(1);
}

// ── REDIS CLIENT ──────────────────────────────────────────────────────────────
// disableOfflineQueue: true — Redis kapalıyken komutlar kuyruklanmaz, anında hata döner
const redis = createClient({ url: REDIS_URL, socket: { reconnectStrategy: false } });
let redisReady = false;
redis.on("ready",       () => { redisReady = true;  console.log("[gateway] Redis connected"); });
redis.on("error",       ()  => { redisReady = false; });
redis.on("end",         ()  => { redisReady = false; });
redis.connect().catch(err => console.warn("[gateway] Redis unavailable:", err.message));

// ── RATE LIMITER ──────────────────────────────────────────────────────────────
async function incrementRateKey(key: string, windowMs: number): Promise<number> {
  if (!redisReady) return 0; // Redis yoksa sınırsız geçir (dev)
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.pExpire(key, windowMs);
    return count;
  } catch {
    return 0;
  }
}

function rateLimiter(
  max: number,
  windowMs: number,
  prefix: string,
  keyFn?: (c: Context) => string,
): MiddlewareHandler {
  return async (c, next) => {
    const key = `${prefix}:${keyFn ? keyFn(c) : (c.req.header("x-forwarded-for") ?? "unknown")}`;
    const count = await incrementRateKey(key, windowMs);
    if (count > max) {
      c.header("Retry-After", String(Math.ceil(windowMs / 1000)));
      return c.json({ success: false, error: "Too Many Requests", message: "Rate limit exceeded. Try again later." }, 429);
    }
    await next();
  };
}

const userKey = (c: Context) => c.get("userId") ?? c.req.header("x-forwarded-for") ?? "unknown";

const generalLimiter    = rateLimiter(parseInt(RATE_LIMIT_GENERAL),    60_000,  "rl:general:",    userKey);
const generationLimiter = rateLimiter(parseInt(RATE_LIMIT_GENERATION), 60_000,  "rl:generation:", userKey);
const uploadLimiter     = rateLimiter(parseInt(RATE_LIMIT_UPLOAD),     60_000,  "rl:upload:",     userKey);
const authLimiter       = rateLimiter(parseInt(RATE_LIMIT_AUTH),       900_000, "rl:auth:");      // IP bazlı, 15dk
// OGG export is memory-heavy (WAV held in heap); max 3 req/min per user
const oggExportLimiter  = rateLimiter(3, 60_000, "rl:ogg-export:", userKey);

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, "access_token") ?? c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ success: false, error: "Authentication required" }, 401);

  try {
    const payload = jwt.verify(token, ACCESS_JWT_SECRET!) as UserJwtPayload;
    c.set("userId", payload.sub);
    c.set("userRole", payload.role);

    const internalPayload: Omit<InternalJwtPayload, "iat" | "exp"> = {
      sub: payload.sub,
      role: payload.role,
      _internal: true,
    };
    c.set("internalToken", jwt.sign(internalPayload, INTERNAL_JWT_SECRET!, { expiresIn: "5m" }));

    await next();
  } catch {
    return c.json({ success: false, error: "Invalid or expired token" }, 401);
  }
};

const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (c.get("userRole") !== "admin") {
    return c.json({ success: false, error: "Admin access required" }, 403);
  }
  await next();
};

// ── PROXY HELPER ──────────────────────────────────────────────────────────────
async function proxyTo(c: Context, baseUrl: string, overridePath?: string): Promise<Response> {
  const reqUrl  = new URL(c.req.url);
  const target  = new URL(baseUrl);
  const path    = overridePath ?? reqUrl.pathname;
  const forward = `${target.origin}${path}${reqUrl.search}`;

  const headers = new Headers();
  // Güvenli header'ları ilet
  for (const h of ["content-type", "accept", "cookie", "x-forwarded-for", "user-agent"]) {
    const v = c.req.header(h);
    if (v) headers.set(h, v);
  }
  // Internal token ekle (eğer authenticate edilmişse)
  const internalToken: string | undefined = c.get("internalToken");
  if (internalToken) headers.set(INTERNAL_TOKEN_HEADER, internalToken);

  const hasBody = !["GET", "HEAD"].includes(c.req.method);

  // SSE endpoint'leri için streaming proxy (body yok, response stream)
  const isSSE = c.req.header("accept") === "text/event-stream";

  // Body'yi önce buffer'a al — Node 25'te ReadableStream duplex proxy
  // fetch() içinde takılabiliyor; arrayBuffer okuyup tekrar iletmek güvenli.
  let bodyPayload: ArrayBuffer | undefined;
  if (hasBody) {
    bodyPayload = await c.req.arrayBuffer();
  }

  try {
    const upstream = await fetch(forward, {
      method: c.req.method,
      headers,
      body: bodyPayload,
    });

    // Upstream Response'dan mutable yeni Response oluştur.
    // fetch()'in döndürdüğü Response immutable headers'a sahip — Hono'nun
    // CORS middleware'i bu header'lara yazmaya çalışınca "TypeError: immutable"
    // fırlatır. Headers'ı kopyalayarak mutable Response yaratıyoruz.
    const responseHeaders = new Headers(upstream.headers);

    // SSE stream'leri için body doğrudan ilet, diğerleri için body'yi tükettir
    return new Response(upstream.body, {
      status:     upstream.status,
      statusText: upstream.statusText,
      headers:    responseHeaders,
    });
  } catch (err) {
    console.error("[gateway] Proxy error →", baseUrl, err);
    return new Response(JSON.stringify({ success: false, error: "Service unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

// ── APP ───────────────────────────────────────────────────────────────────────
const app = new Hono();

// CORS
app.use("*", cors({
  origin: CLIENT_URL,
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// /internal/* dışarıya kapalı
app.all("/internal/*", (c) => c.json({ success: false, error: "Forbidden" }, 403));

// Health
app.get("/health", (c) => c.json({ status: "ok", service: "gateway" }));

// ── AUTH — public, IP rate limit ──────────────────────────────────────────────
app.post("/api/auth/register",              authLimiter, (c) => proxyTo(c, AUTH_SERVICE_URL, "/register"));
app.post("/api/auth/login",                 authLimiter, (c) => proxyTo(c, AUTH_SERVICE_URL, "/login"));
app.post("/api/auth/refresh",               authLimiter, (c) => proxyTo(c, AUTH_SERVICE_URL, "/refresh"));
app.get ("/api/auth/verify-email",          authLimiter, (c) => proxyTo(c, AUTH_SERVICE_URL, "/verify-email"));
app.post("/api/auth/resend-verification",   authLimiter, (c) => proxyTo(c, AUTH_SERVICE_URL, "/resend-verification"));

// ── KORUNAN ROUTE'LAR ─────────────────────────────────────────────────────────
// requireAuth + generalLimiter her korunan route'a uygulanır

// Auth — logout, logout-all, /me
app.all("/api/auth/*", requireAuth, generalLimiter, (c) =>
  proxyTo(c, AUTH_SERVICE_URL, c.req.path.replace("/api/auth", "") || "/")
);

// Generation
app.post("/api/generate",               requireAuth, generationLimiter, (c) => proxyTo(c, GENERATION_SERVICE_URL, "/"));
app.post("/api/generate/sfx",           requireAuth, generationLimiter, (c) => proxyTo(c, GENERATION_SERVICE_URL, "/sfx"));
app.post("/api/generate/analyze-image", requireAuth, generationLimiter, (c) => proxyTo(c, GENERATION_SERVICE_URL, "/analyze-image"));
app.post("/api/generate/midi",          requireAuth, generalLimiter,    (c) => proxyTo(c, GENERATION_SERVICE_URL, "/midi"));
// OGG export holds the full WAV in heap — dedicated tight limiter (3/min)
app.post("/api/generate/export/ogg",    requireAuth, oggExportLimiter,  (c) => proxyTo(c, GENERATION_SERVICE_URL, "/export/ogg"));
app.all ("/api/generate/*",             requireAuth, generalLimiter,    (c) =>
  proxyTo(c, GENERATION_SERVICE_URL, c.req.path.replace("/api/generate", "") || "/")
);

// Upload
app.post("/api/upload",  requireAuth, uploadLimiter,  (c) => proxyTo(c, UPLOAD_SERVICE_URL, "/"));
app.all ("/api/upload/*", requireAuth, generalLimiter, (c) =>
  proxyTo(c, UPLOAD_SERVICE_URL, c.req.path.replace("/api/upload", "") || "/")
);

// Library + Collections
app.all("/api/library/*",     requireAuth, generalLimiter, (c) =>
  proxyTo(c, LIBRARY_SERVICE_URL, c.req.path.replace("/api/library", "") || "/")
);
app.all("/api/collections/*", requireAuth, generalLimiter, (c) =>
  proxyTo(c, LIBRARY_SERVICE_URL, "/collections" + c.req.path.replace("/api/collections", ""))
);

// Credits — packages and stripe webhook are public; all other credit routes require auth
app.get ("/api/credits/packages",        generalLimiter, (c) => proxyTo(c, CREDIT_SERVICE_URL, "/packages"));
// Webhook: no auth required (Stripe signs the payload) but rate-limited by IP to prevent flood
app.post("/api/credits/webhook",         generalLimiter, (c) => proxyTo(c, CREDIT_SERVICE_URL, "/webhook"));
// Block internal-only credit operations — /earn and /spend are server-to-server only, never user-facing
app.post("/api/credits/earn",  (c) => c.json({ success: false, error: "Forbidden" }, 403));
app.post("/api/credits/spend", (c) => c.json({ success: false, error: "Forbidden" }, 403));
app.all ("/api/credits/*", requireAuth, generalLimiter, (c) =>
  proxyTo(c, CREDIT_SERVICE_URL, c.req.path.replace("/api/credits", "") || "/")
);

// Notification (SSE)
app.all("/api/notify/*", requireAuth, generalLimiter, (c) =>
  proxyTo(c, NOTIFICATION_SERVICE_URL, c.req.path.replace("/api/notify", "") || "/")
);

// Admin — çift koruma
app.all("/api/admin/*", requireAuth, requireAdmin, (c) =>
  proxyTo(c, ADMIN_SERVICE_URL, c.req.path.replace("/api/admin", "") || "/")
);

// Users (auth servisi — /api/users/me → /me, /api/users/me/preferences → /me/preferences)
app.all("/api/users/*", requireAuth, generalLimiter, (c) =>
  proxyTo(c, AUTH_SERVICE_URL, c.req.path.replace("/api/users", "") || "/")
);

// Profile
app.get ("/api/profile/me",          requireAuth, generalLimiter, (c) => proxyTo(c, PROFILE_SERVICE_URL, "/me"));
app.put ("/api/profile/me",          requireAuth, generalLimiter, (c) => proxyTo(c, PROFILE_SERVICE_URL, "/me"));
app.post("/api/profile/me/avatar",   requireAuth, generalLimiter, (c) => proxyTo(c, PROFILE_SERVICE_URL, "/me/avatar"));
app.get ("/api/profile/:username",   generalLimiter,              (c) => proxyTo(c, PROFILE_SERVICE_URL, `/${c.req.param("username")}`));

// DAW Projects (save/load) — share link is public
app.get("/api/projects/share/:token", generalLimiter, (c) =>
  proxyTo(c, LIBRARY_SERVICE_URL, `/projects/share/${c.req.param("token")}`)
);
// Hono'da /* en az 1 karakter gerektirir — /api/projects (trailing slash'siz liste endpoint'i)
// ayrıca tanımlanmazsa 404 düşer.
app.get ("/api/projects",   requireAuth, generalLimiter, (c) => proxyTo(c, LIBRARY_SERVICE_URL, "/projects"));
app.post("/api/projects",   requireAuth, generalLimiter, (c) => proxyTo(c, LIBRARY_SERVICE_URL, "/projects"));
app.all ("/api/projects/*", requireAuth, generalLimiter, (c) =>
  proxyTo(c, LIBRARY_SERVICE_URL, "/projects" + c.req.path.replace("/api/projects", ""))
);

// Social — tracks
app.post("/api/social/tracks", requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, "/tracks"));
app.get   ("/api/social/tracks",                       generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, "/tracks"));
app.get   ("/api/social/tracks/:id",                   generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, `/tracks/${c.req.param("id")}`));
app.delete("/api/social/tracks/:id",      requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, `/tracks/${c.req.param("id")}`));
app.post  ("/api/social/tracks/:id/like", requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, `/tracks/${c.req.param("id")}/like`));

// Social — follow
app.post("/api/social/follow/:userId",         requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, `/follow/${c.req.param("userId")}`));
app.get ("/api/social/follow/:userId/status",  requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, `/follow/${c.req.param("userId")}/status`));
app.get ("/api/social/followers",              requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, "/followers"));
app.get ("/api/social/following",              requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, "/following"));

// Social — feed + my tracks + SSE
app.get("/api/social/feed",      requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, "/feed"));
app.get("/api/social/my-tracks", requireAuth, generalLimiter, (c) => proxyTo(c, SOCIAL_SERVICE_URL, "/my-tracks"));
app.get("/api/social/sse",       requireAuth,                 (c) => proxyTo(c, SOCIAL_SERVICE_URL, "/sse"));

// 404
app.all("*", (c) => c.json({ success: false, error: "Route not found" }, 404));

// ── START ─────────────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: parseInt(PORT) }, () =>
  console.log(`[gateway] Listening on :${PORT}`)
);
