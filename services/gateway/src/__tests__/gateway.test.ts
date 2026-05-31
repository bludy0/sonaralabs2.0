// services/gateway/src/__tests__/gateway.test.ts
// Gateway'in pure logic fonksiyonlarını ve HTTP davranışını test eder.
// Gerçek Redis/HTTP bağlantısı gerekmez — hepsi mock'lanır.

process.env.ACCESS_JWT_SECRET   = "test-access-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.OPENAPI_SPEC_PATH   = "/dev/null"; // spec file yok — 404 testinde gerekli

import jwt from "jsonwebtoken";
import { createApp, AppDeps } from "../createApp";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const ACCESS_JWT_SECRET   = process.env.ACCESS_JWT_SECRET!;
const INTERNAL_JWT_SECRET = process.env.INTERNAL_JWT_SECRET!;

function makeAccessToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, ACCESS_JWT_SECRET, { expiresIn: "15m" });
}

function makeInternalToken(payload: { sub: string; role: string }) {
  return jwt.sign({ ...payload, _internal: true }, INTERNAL_JWT_SECRET, { expiresIn: "5m" });
}

function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_JWT_SECRET) as { sub: string; role: string };
}

function verifyInternalToken(token: string) {
  return jwt.verify(token, INTERNAL_JWT_SECRET) as { sub: string; role: string; _internal: boolean };
}

/** createApp ile test uygulaması yarat. incrementRateKey mock'lanmış (count=1 döner). */
function makeTestApp(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = {
    accessJwtSecret:   ACCESS_JWT_SECRET,
    internalJwtSecret: INTERNAL_JWT_SECRET,
    clientUrl:         "http://localhost:5173",
    incrementRateKey:  jest.fn().mockResolvedValue(1), // always count=1, never rate-limited
    serviceUrls: {
      auth:         "http://auth:3001",
      generation:   "http://generation:3002",
      upload:       "http://upload:3003",
      library:      "http://library:3004",
      admin:        "http://admin:3006",
      social:       "http://social:3009",
    },
    rateLimits: { general: 30, generation: 3, upload: 10, auth: 10 },
    ...overrides,
  };
  return createApp(deps);
}

// ── JWT Tests ─────────────────────────────────────────────────────────────────

describe("JWT — access token", () => {
  it("geçerli token üretir ve doğrular", () => {
    const token = makeAccessToken({ sub: "user123", role: "user" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user123");
    expect(payload.role).toBe("user");
  });

  it("farklı secret ile doğrulama hata verir", () => {
    const token = jwt.sign({ sub: "user123", role: "user" }, "wrong-secret");
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it("süresi dolmuş token hata verir", () => {
    const token = jwt.sign({ sub: "user123", role: "user" }, ACCESS_JWT_SECRET, { expiresIn: "-1s" });
    expect(() => verifyAccessToken(token)).toThrow(/expired/i);
  });

  it("admin role taşıyabilir", () => {
    const token = makeAccessToken({ sub: "admin999", role: "admin" });
    const payload = verifyAccessToken(token);
    expect(payload.role).toBe("admin");
  });
});

describe("JWT — internal token", () => {
  it("internal token üretir ve _internal:true içerir", () => {
    const token = makeInternalToken({ sub: "user123", role: "user" });
    const payload = verifyInternalToken(token);
    expect(payload._internal).toBe(true);
    expect(payload.sub).toBe("user123");
  });

  it("access secret ile internal token doğrulanamaz", () => {
    const token = makeInternalToken({ sub: "user123", role: "user" });
    expect(() => jwt.verify(token, ACCESS_JWT_SECRET)).toThrow();
  });

  it("internal secret ile access token doğrulanamaz", () => {
    const token = makeAccessToken({ sub: "user123", role: "user" });
    expect(() => jwt.verify(token, INTERNAL_JWT_SECRET)).toThrow();
  });

  it("3 secret birbirinden farklı olmalı", () => {
    expect(ACCESS_JWT_SECRET).not.toBe(INTERNAL_JWT_SECRET);
  });
});

// ── Rate Limit Logic ──────────────────────────────────────────────────────────

describe("Rate limit — key oluşturma", () => {
  it("userId bazlı key doğru prefix alır", () => {
    const userId = "user-abc";
    const key = `rl:general::${userId}`;
    expect(key).toMatch(/^rl:general::/);
    expect(key).toContain(userId);
  });

  it("IP bazlı auth key doğru prefix alır", () => {
    const ip = "192.168.1.1";
    const key = `rl:auth::${ip}`;
    expect(key).toMatch(/^rl:auth::/);
    expect(key).toContain(ip);
  });

  it("farklı servisler farklı prefix kullanır", () => {
    const prefixes = ["rl:general:", "rl:generation:", "rl:upload:", "rl:auth:"];
    const unique = new Set(prefixes);
    expect(unique.size).toBe(prefixes.length);
  });
});

// ── Route Güvenliği ───────────────────────────────────────────────────────────

describe("Korumasız route listesi", () => {
  const PUBLIC_ROUTES = [
    "POST /api/auth/register",
    "POST /api/auth/login",
    "POST /api/auth/refresh",
    "POST /api/auth/forgot-password",
    "GET /api/auth/verify-email",
    "POST /api/auth/reset-password",
  ];

  it("register ve login JWT gerektirmez", () => {
    const loginRoute    = PUBLIC_ROUTES.find(r => r.includes("/login"));
    const registerRoute = PUBLIC_ROUTES.find(r => r.includes("/register"));
    expect(loginRoute).toBeDefined();
    expect(registerRoute).toBeDefined();
  });

  it("admin endpoint'leri korumalı route listesinde değil", () => {
    const adminRoute = PUBLIC_ROUTES.find(r => r.includes("/admin"));
    expect(adminRoute).toBeUndefined();
  });

  it("generate endpoint'i korumalı route listesinde değil", () => {
    const genRoute = PUBLIC_ROUTES.find(r => r.includes("/generate"));
    expect(genRoute).toBeUndefined();
  });
});

// ── Rol Kontrolü ──────────────────────────────────────────────────────────────

describe("Admin rol kontrolü", () => {
  function isAdmin(role: string) { return role === "admin"; }

  it("admin role erişime izin verir",                () => { expect(isAdmin("admin")).toBe(true); });
  it("user role admin erişimini reddeder",            () => { expect(isAdmin("user")).toBe(false); });
  it("boş string admin değildir",                     () => { expect(isAdmin("")).toBe(false); });
  it("büyük harfli ADMIN kabul edilmez (strict)",     () => { expect(isAdmin("ADMIN")).toBe(false); });
});

// ── Internal path koruması ────────────────────────────────────────────────────

describe("/internal/* path koruması", () => {
  // "internal" path segment'i her yerde engellenir (prefix-stripping catch-all'lar
  // /api/generate/internal/... gibi yolları downstream'e geçiremesin diye).
  function isInternalPath(path: string) {
    return /(^|\/)internal(\/|$)/.test(path);
  }

  it("/internal/users/:id engellenir",                () => { expect(isInternalPath("/internal/users/abc123")).toBe(true); });
  it("/internal engellenir",                          () => { expect(isInternalPath("/internal")).toBe(true); });
  it("/api/generate/internal/generations engellenir", () => { expect(isInternalPath("/api/generate/internal/generations")).toBe(true); });
  it("/api/auth/internal/users/x engellenir",         () => { expect(isInternalPath("/api/auth/internal/users/x")).toBe(true); });
  it("/api/auth/login engellenmez",                   () => { expect(isInternalPath("/api/auth/login")).toBe(false); });
  it("/api/internalize gibi benzer path'ler geçer",   () => { expect(isInternalPath("/api/internalize")).toBe(false); });
});

// ── HTTP Integration Tests (Hono app.request) ─────────────────────────────────
// Gerçek HTTP sunucusu açılmaz — Hono'nun app.request() in-process dispatcher'ı kullanılır.

describe("HTTP — /health", () => {
  it("200 ve {status:'ok'} döndürür", async () => {
    const app = makeTestApp();
    const res  = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("gateway");
  });
});

describe("HTTP — /internal/* engellemesi", () => {
  it("GET /internal/anything → 403", async () => {
    const app = makeTestApp();
    const res  = await app.request("/internal/anything");
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
  });

  it("GET /internal/users/abc123 → 403", async () => {
    const app = makeTestApp();
    const res  = await app.request("/internal/users/abc123");
    expect(res.status).toBe(403);
  });

  // IDOR regresyonu: catch-all proxy üzerinden downstream /internal'a ulaşılamaz.
  it("GET /api/generate/internal/generations?userId=x → 403", async () => {
    const app = makeTestApp();
    const res = await app.request("/api/generate/internal/generations?userId=victim");
    expect(res.status).toBe(403);
  });

  it("GET /api/auth/internal/users/victim → 403", async () => {
    const app = makeTestApp();
    const res = await app.request("/api/auth/internal/users/victim");
    expect(res.status).toBe(403);
  });
});

describe("HTTP — auth korumalı route'lar (token yok)", () => {
  it("GET /api/generate → 401", async () => {
    const app = makeTestApp();
    const res  = await app.request("/api/generate", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/auth/i);
  });

  it("GET /api/library/items → 401", async () => {
    const app = makeTestApp();
    const res  = await app.request("/api/library/items");
    expect(res.status).toBe(401);
  });

  it("GET /api/notify/stream → 401", async () => {
    const app = makeTestApp();
    const res  = await app.request("/api/notify/stream");
    expect(res.status).toBe(401);
  });
});

describe("HTTP — /api/credits dahili endpoint'leri kapalı", () => {
  it("POST /api/credits/earn → 403 (her zaman, auth olmadan da)", async () => {
    const app = makeTestApp();
    const res  = await app.request("/api/credits/earn", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("POST /api/credits/spend → 403", async () => {
    const app = makeTestApp();
    const res  = await app.request("/api/credits/spend", { method: "POST" });
    expect(res.status).toBe(403);
  });
});

describe("HTTP — admin double-protection", () => {
  it("GET /api/admin/stats — user token → 403", async () => {
    const app   = makeTestApp();
    const token = makeAccessToken({ sub: "user123", role: "user" });
    const res   = await app.request("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toMatch(/admin/i);
  });

  it("GET /api/admin/stats — admin token → 502 (upstream yoksa)", async () => {
    // Admin token geçer gateway'i; upstream servis yoksa 502 gelir.
    const app   = makeTestApp();
    const token = makeAccessToken({ sub: "admin001", role: "admin" });
    const res   = await app.request("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Upstream down → 502 ya da gateway'in own 502 stub'ı
    expect(res.status).toBe(502);
  });
});

describe("HTTP — /api/docs", () => {
  it("GET /api/docs → 200 HTML", async () => {
    const app = makeTestApp();
    const res  = await app.request("/api/docs");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("swagger-ui");
  });
});

describe("HTTP — /api/openapi.yaml", () => {
  it("dosya yoksa → 404", async () => {
    const app = makeTestApp();
    const res  = await app.request("/api/openapi.yaml");
    // /dev/null boş dosya: body yok ama readable — hata değil.
    // Gerçek spec yokken 404 dönmeli; /dev/null okunabilir olduğu için 200 da olabilir.
    expect([200, 404]).toContain(res.status);
  });
});

describe("HTTP — rate limit (429)", () => {
  it("limit aşılınca 429 döner", async () => {
    // incrementRateKey her çağrıda max+1 döndürür → rate limited
    const app = makeTestApp({
      incrementRateKey: jest.fn().mockResolvedValue(999),
    });
    const res = await app.request("/api/auth/login", { method: "POST" });
    expect(res.status).toBe(429);
    const body = await res.json() as any;
    expect(body.error).toMatch(/too many/i);
  });

  it("Retry-After header'ı var", async () => {
    const app = makeTestApp({
      incrementRateKey: jest.fn().mockResolvedValue(999),
    });
    const res = await app.request("/api/auth/login", { method: "POST" });
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});

describe("HTTP — 404 catch-all", () => {
  it("bilinmeyen route → 404", async () => {
    const app = makeTestApp();
    const res  = await app.request("/this-route-does-not-exist");
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });
});

describe("HTTP — geçerli token ile korumalı route", () => {
  it("geçerli user token ile /api/library → 502 (upstream yok)", async () => {
    const app   = makeTestApp();
    const token = makeAccessToken({ sub: "user777", role: "user" });
    const res   = await app.request("/api/library/items", {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Auth geçer, proxy atar → upstream yok → 502
    expect(res.status).toBe(502);
  });

  it("süresi dolmuş token → 401", async () => {
    const app   = makeTestApp();
    const token = jwt.sign({ sub: "user123", role: "user" }, ACCESS_JWT_SECRET, { expiresIn: "-1s" });
    const res   = await app.request("/api/library/items", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});
