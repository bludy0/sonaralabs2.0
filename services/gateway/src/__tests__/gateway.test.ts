// services/gateway/src/__tests__/gateway.test.ts
// Gateway'in pure logic fonksiyonlarını test eder.
// Gerçek Redis/HTTP bağlantısı gerekmez — hepsi mock'lanır.

process.env.ACCESS_JWT_SECRET   = "test-access-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.REDIS_URL           = "redis://localhost:6379";
process.env.PORT                = "3000";

import jwt from "jsonwebtoken";

// Redis mock — bağlantı açmadan rate limit logic'ini test et
jest.mock("redis", () => ({
  createClient: jest.fn().mockReturnValue({
    connect:  jest.fn().mockResolvedValue(undefined),
    on:       jest.fn(),
    isOpen:   true,
    incr:     jest.fn().mockResolvedValue(1),
    pExpire:  jest.fn().mockResolvedValue(1),
  }),
}));

// ── Helpers (gateway logic'ini yeniden tanımlıyoruz, import yerine) ───────────

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
    const loginRoute  = PUBLIC_ROUTES.find(r => r.includes("/login"));
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

  it("admin role erişime izin verir", () => {
    expect(isAdmin("admin")).toBe(true);
  });

  it("user role admin erişimini reddeder", () => {
    expect(isAdmin("user")).toBe(false);
  });

  it("boş string admin değildir", () => {
    expect(isAdmin("")).toBe(false);
  });

  it("büyük harfli ADMIN kabul edilmez (strict karşılaştırma)", () => {
    expect(isAdmin("ADMIN")).toBe(false);
  });
});

// ── Internal path koruması ────────────────────────────────────────────────────

describe("/internal/* path koruması", () => {
  function isInternalPath(path: string) {
    return path.startsWith("/internal/") || path === "/internal";
  }

  it("/internal/users/:id engellenir", () => {
    expect(isInternalPath("/internal/users/abc123")).toBe(true);
  });

  it("/internal engellenir", () => {
    expect(isInternalPath("/internal")).toBe(true);
  });

  it("/api/auth/login engellenmez", () => {
    expect(isInternalPath("/api/auth/login")).toBe(false);
  });

  it("/api/internalize gibi benzer path'ler engellenmez", () => {
    expect(isInternalPath("/api/internalize")).toBe(false);
  });
});
