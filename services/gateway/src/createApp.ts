/**
 * createApp — pure Hono app factory.
 * No side effects at import time (no Redis connections, no process.exit).
 * Accepts injected dependencies so the app is fully testable.
 */
import { readFileSync }  from "fs";
import { join }          from "path";
import { Hono }          from "hono";
import { getCookie }     from "hono/cookie";
import { cors }          from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { getConnInfo }   from "@hono/node-server/conninfo";
import jwt               from "jsonwebtoken";
import type { Context, MiddlewareHandler } from "hono";
import { UserJwtPayload, InternalJwtPayload, INTERNAL_TOKEN_HEADER } from "@sonaralabs/types";
import { logger }        from "./logger";

export interface AppDeps {
  accessJwtSecret:   string;
  internalJwtSecret: string;
  clientUrl:         string;
  incrementRateKey:  (key: string, windowMs: number) => Promise<number>;
  serviceUrls: {
    auth:       string;
    generation: string;
    upload:     string;
    library:    string;
    admin:      string;
    social:     string;
  };
  rateLimits: {
    general:    number;
    generation: number;
    upload:     number;
    auth:       number;
  };
}

export function createApp(deps: AppDeps): Hono {
  const {
    accessJwtSecret, internalJwtSecret, clientUrl,
    incrementRateKey, serviceUrls, rateLimits,
  } = deps;

  // ── Rate limiter ──────────────────────────────────────────────────────────
  function rateLimiter(
    max: number, windowMs: number, prefix: string,
    keyFn?: (c: Context) => string,
  ): MiddlewareHandler {
    return async (c, next) => {
      const key   = `${prefix}:${keyFn ? keyFn(c) : (c.req.header("x-forwarded-for") ?? "unknown")}`;
      const count = await incrementRateKey(key, windowMs);
      if (count > max) {
        c.header("Retry-After", String(Math.ceil(windowMs / 1000)));
        return c.json({ success: false, error: "Too Many Requests", message: "Rate limit exceeded. Try again later." }, 429);
      }
      await next();
    };
  }

  // Gerçek bağlantı IP'sini kullan — X-Forwarded-For header'ı client tarafından
  // sahte olarak set edilebileceğinden rate-limit key olarak güvenilmez.
  const getClientIp = (c: Context): string => {
    try {
      const info = getConnInfo(c);
      return info.remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  };
  const userKey = (c: Context) => c.get("userId") ?? getClientIp(c);

  const generalLimiter    = rateLimiter(rateLimits.general,    60_000,  "rl:general:",    userKey);
  const generationLimiter = rateLimiter(rateLimits.generation, 60_000,  "rl:generation:", userKey);
  const uploadLimiter     = rateLimiter(rateLimits.upload,     60_000,  "rl:upload:",     userKey);
  const authLimiter       = rateLimiter(rateLimits.auth,       900_000, "rl:auth:");
  const oggExportLimiter  = rateLimiter(3,                     60_000,  "rl:ogg-export:", userKey);

  // ── Auth middleware ───────────────────────────────────────────────────────
  const requireAuth: MiddlewareHandler = async (c, next) => {
    const token = getCookie(c, "access_token") ?? c.req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return c.json({ success: false, error: "Authentication required" }, 401);
    try {
      const payload = jwt.verify(token, accessJwtSecret) as UserJwtPayload;
      c.set("userId",   payload.sub);
      c.set("userRole", payload.role);
      const internal: Omit<InternalJwtPayload, "iat" | "exp"> = { sub: payload.sub, role: payload.role, _internal: true };
      c.set("internalToken", jwt.sign(internal, internalJwtSecret, { expiresIn: "5m" }));
      await next();
    } catch {
      return c.json({ success: false, error: "Invalid or expired token" }, 401);
    }
  };

  const requireAdmin: MiddlewareHandler = async (c, next) => {
    if (c.get("userRole") !== "admin")
      return c.json({ success: false, error: "Admin access required" }, 403);
    await next();
  };

  // Upstream istek için zaman aşımı. Bir downstream servis yavaşlar/takılırsa
  // istemci isteği sonsuza dek askıda kalmasın diye fetch abort edilir.
  // SSE/stream route'ları uzun ömürlüdür → onlara timeout uygulanmaz.
  const PROXY_TIMEOUT_MS = parseInt(process.env.PROXY_TIMEOUT_MS ?? "30000");
  const isStreamPath = (p: string) => /\/(stream|sse)$/.test(p);

  // ── Proxy helper ──────────────────────────────────────────────────────────
  async function proxyTo(c: Context, baseUrl: string, overridePath?: string): Promise<Response> {
    const reqUrl  = new URL(c.req.url);
    const target  = new URL(baseUrl);
    const path    = overridePath ?? reqUrl.pathname;
    const forward = `${target.origin}${path}${reqUrl.search}`;

    const headers = new Headers();
    for (const h of ["content-type", "accept", "cookie", "x-forwarded-for", "user-agent"]) {
      const v = c.req.header(h); if (v) headers.set(h, v);
    }
    const internalToken: string | undefined = c.get("internalToken");
    if (internalToken) headers.set(INTERNAL_TOKEN_HEADER, internalToken);

    const hasBody = !["GET", "HEAD"].includes(c.req.method);
    let bodyPayload: ArrayBuffer | undefined;
    if (hasBody) bodyPayload = await c.req.arrayBuffer();

    const signal = isStreamPath(path) ? undefined : AbortSignal.timeout(PROXY_TIMEOUT_MS);

    try {
      const upstream = await fetch(forward, { method: c.req.method, headers, body: bodyPayload, signal });
      return new Response(upstream.body, {
        status:     upstream.status,
        statusText: upstream.statusText,
        headers:    new Headers(upstream.headers),
      });
    } catch (err) {
      // AbortSignal.timeout → TimeoutError (DOMException). Diğer ağ hataları → 502.
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return new Response(
        JSON.stringify({ success: false, error: timedOut ? "Gateway timeout" : "Service unavailable" }),
        { status: timedOut ? 504 : 502, headers: { "content-type": "application/json" } },
      );
    }
  }

  // ── App ───────────────────────────────────────────────────────────────────
  const app = new Hono();

  app.use("*", secureHeaders({
    xFrameOptions: "DENY", xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: "max-age=63072000; includeSubDomains",
  }));

  app.use("*", cors({
    origin: clientUrl, credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }));

  // Block service-to-service /internal/* routes from ever being reached by a client.
  // Matching only "/internal/*" is insufficient: prefix-stripping catch-alls like
  // app.all("/api/generate/*") would forward "/api/generate/internal/generations"
  // to a downstream service's /internal route WITH a valid internal token (IDOR).
  // So reject "/internal" appearing as a path segment anywhere.
  app.use("*", async (c, next) => {
    if (/(^|\/)internal(\/|$)/.test(c.req.path))
      return c.json({ success: false, error: "Forbidden" }, 403);
    await next();
  });
  app.get("/health",     (c) => c.json({ status: "ok", service: "gateway" }));

  // ── API Docs ──────────────────────────────────────────────────────────────
  const OPENAPI_SPEC_PATH = process.env.OPENAPI_SPEC_PATH ?? join(process.cwd(), "docs/openapi.yaml");

  app.get("/api/docs", (c) => c.html(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"/><title>Sonaralabs API Docs</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
  <style>body{margin:0;background:#0e0e0e}.swagger-ui .topbar{background:#131313;border-bottom:1px solid #262626}.swagger-ui .topbar .download-url-wrapper{display:none}</style>
</head><body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({url:"/api/openapi.yaml",dom_id:"#swagger-ui",presets:[SwaggerUIBundle.presets.apis,SwaggerUIBundle.SwaggerUIStandalonePreset],layout:"BaseLayout",deepLinking:true,defaultModelsExpandDepth:1,defaultModelExpandDepth:2})</script>
</body></html>`));

  app.get("/api/openapi.yaml", (c) => {
    try {
      const spec = readFileSync(OPENAPI_SPEC_PATH, "utf-8");
      c.header("Content-Type", "application/yaml");
      return c.body(spec);
    } catch { return c.json({ error: "Spec file not found" }, 404); }
  });

  // ── Auth routes ───────────────────────────────────────────────────────────
  app.post("/api/auth/register",            authLimiter, (c) => proxyTo(c, serviceUrls.auth, "/register"));
  app.post("/api/auth/login",               authLimiter, (c) => proxyTo(c, serviceUrls.auth, "/login"));
  app.post("/api/auth/refresh",             authLimiter, (c) => proxyTo(c, serviceUrls.auth, "/refresh"));
  app.get ("/api/auth/verify-email",        authLimiter, (c) => proxyTo(c, serviceUrls.auth, "/verify-email"));
  app.post("/api/auth/resend-verification", authLimiter, (c) => proxyTo(c, serviceUrls.auth, "/resend-verification"));
  app.post("/api/auth/forgot-password",     authLimiter, (c) => proxyTo(c, serviceUrls.auth, "/forgot-password"));
  app.post("/api/auth/reset-password",      authLimiter, (c) => proxyTo(c, serviceUrls.auth, "/reset-password"));
  app.all ("/api/auth/*", requireAuth, generalLimiter, (c) =>
    proxyTo(c, serviceUrls.auth, c.req.path.replace("/api/auth", "") || "/"));

  // ── Generation routes ─────────────────────────────────────────────────────
  app.get ("/api/generate/capabilities",              generalLimiter,    (c) => proxyTo(c, serviceUrls.generation, "/capabilities"));
  app.post("/api/generate",               requireAuth, generationLimiter, (c) => proxyTo(c, serviceUrls.generation, "/"));
  app.post("/api/generate/sfx",           requireAuth, generationLimiter, (c) => proxyTo(c, serviceUrls.generation, "/sfx"));
  app.post("/api/generate/analyze-image", requireAuth, generationLimiter, (c) => proxyTo(c, serviceUrls.generation, "/analyze-image"));
  app.post("/api/generate/midi",          requireAuth, generalLimiter,    (c) => proxyTo(c, serviceUrls.generation, "/midi"));
  app.post("/api/generate/export/ogg",    requireAuth, oggExportLimiter,  (c) => proxyTo(c, serviceUrls.generation, "/export/ogg"));
  app.all ("/api/generate/*",             requireAuth, generalLimiter,    (c) =>
    proxyTo(c, serviceUrls.generation, c.req.path.replace("/api/generate", "") || "/"));

  // ── Upload routes ─────────────────────────────────────────────────────────
  app.post("/api/upload",   requireAuth, uploadLimiter,  (c) => proxyTo(c, serviceUrls.upload, "/"));
  app.all ("/api/upload/*", requireAuth, generalLimiter, (c) =>
    proxyTo(c, serviceUrls.upload, c.req.path.replace("/api/upload", "") || "/"));

  // ── Library + Collections ─────────────────────────────────────────────────
  app.all("/api/library/*", requireAuth, generalLimiter, (c) =>
    proxyTo(c, serviceUrls.library, c.req.path.replace("/api/library", "") || "/"));
  app.get ("/api/collections",   requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.library, "/collections"));
  app.post("/api/collections",   requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.library, "/collections"));
  app.all ("/api/collections/*", requireAuth, generalLimiter, (c) =>
    proxyTo(c, serviceUrls.library, "/collections" + c.req.path.replace("/api/collections", "")));

  // ── Credits ───────────────────────────────────────────────────────────────
  app.get ("/api/credits/packages", generalLimiter, (c) => proxyTo(c, serviceUrls.auth, "/credits/packages"));
  app.post("/api/credits/webhook",  generalLimiter, (c) => proxyTo(c, serviceUrls.auth, "/credits/webhook"));
  app.post("/api/credits/earn",  (c) => c.json({ success: false, error: "Forbidden" }, 403));
  app.post("/api/credits/spend", (c) => c.json({ success: false, error: "Forbidden" }, 403));
  app.all ("/api/credits/*", requireAuth, generalLimiter, (c) =>
    proxyTo(c, serviceUrls.auth, "/credits" + (c.req.path.replace("/api/credits", "") || "/")));

  // ── Notification ──────────────────────────────────────────────────────────
  // /api/notify/stream → generation servisi (SSE notification taşındı)
  app.all("/api/notify/*", requireAuth, (c) =>
    proxyTo(c, serviceUrls.generation, c.req.path.replace("/api/notify", "") || "/"));

  // ── Admin ─────────────────────────────────────────────────────────────────
  app.all("/api/admin/*", requireAuth, requireAdmin, (c) =>
    proxyTo(c, serviceUrls.admin, c.req.path.replace("/api/admin", "") || "/"));

  // ── Users ─────────────────────────────────────────────────────────────────
  app.all("/api/users/*", requireAuth, generalLimiter, (c) =>
    proxyTo(c, serviceUrls.auth, c.req.path.replace("/api/users", "") || "/"));

  // ── Profile ───────────────────────────────────────────────────────────────
  app.get ("/api/profile/me",        requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/profile/me"));
  app.put ("/api/profile/me",        requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/profile/me"));
  app.post("/api/profile/me/avatar", requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/profile/me/avatar"));
  app.get ("/api/profile/:username",              generalLimiter, (c) => proxyTo(c, serviceUrls.social, `/profile/${c.req.param("username")}`));

  // ── Projects ──────────────────────────────────────────────────────────────
  app.get("/api/projects/share/:token", generalLimiter, (c) =>
    proxyTo(c, serviceUrls.library, `/projects/share/${c.req.param("token")}`));
  app.get ("/api/projects",   requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.library, "/projects"));
  app.post("/api/projects",   requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.library, "/projects"));
  app.all ("/api/projects/*", requireAuth, generalLimiter, (c) =>
    proxyTo(c, serviceUrls.library, "/projects" + c.req.path.replace("/api/projects", "")));

  // ── Social ────────────────────────────────────────────────────────────────
  app.post  ("/api/social/tracks",            requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/tracks"));
  app.get   ("/api/social/tracks",                         generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/tracks"));
  app.get   ("/api/social/tracks/:id",                     generalLimiter, (c) => proxyTo(c, serviceUrls.social, `/tracks/${c.req.param("id")}`));
  app.delete("/api/social/tracks/:id",        requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, `/tracks/${c.req.param("id")}`));
  app.post  ("/api/social/tracks/:id/like",   requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, `/tracks/${c.req.param("id")}/like`));
  app.post  ("/api/social/follow/:userId",    requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, `/follow/${c.req.param("userId")}`));
  app.get   ("/api/social/follow/:userId/status", requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, `/follow/${c.req.param("userId")}/status`));
  app.get   ("/api/social/followers",         requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/followers"));
  app.get   ("/api/social/following",         requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/following"));
  app.get   ("/api/social/feed",              requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/feed"));
  app.get   ("/api/social/my-tracks",         requireAuth, generalLimiter, (c) => proxyTo(c, serviceUrls.social, "/my-tracks"));
  app.get   ("/api/social/sse",               requireAuth,                 (c) => proxyTo(c, serviceUrls.social, "/sse"));

  // ── 404 ──────────────────────────────────────────────────────────────────
  app.all("*", (c) => c.json({ success: false, error: "Route not found" }, 404));

  return app;
}
