// Gateway rate-limit davranışı tamamen process içinde test edilir. Çalışan bir
// gateway/Redis instance'ına veya paylaşılan sayaç state'ine bağlı değildir.

import { AppDeps, createApp } from "../createApp";

const ACCESS_SECRET = "test-access-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const INTERNAL_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

function makeRateLimitedApp(options: { authLimit?: number; trustedProxyHops?: number } = {}) {
  const counts = new Map<string, number>();
  const incrementRateKey = jest.fn(async (key: string) => {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return count;
  });

  const deps: AppDeps = {
    accessJwtSecret: ACCESS_SECRET,
    internalJwtSecret: INTERNAL_SECRET,
    clientUrl: "http://localhost:5173",
    trustedProxyHops: options.trustedProxyHops ?? 0,
    incrementRateKey,
    serviceUrls: {
      auth: "http://auth:3001",
      generation: "http://generation:3002",
      upload: "http://upload:3003",
      library: "http://library:3004",
      admin: "http://admin:3006",
      social: "http://social:3009",
    },
    rateLimits: {
      general: 30,
      generation: 3,
      upload: 10,
      auth: options.authLimit ?? 3,
    },
  };

  return { app: createApp(deps), incrementRateKey };
}

describe("Rate limiting — deterministic", () => {
  beforeEach(() => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "Bad request" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("auth limitinden sonraki isteği 429 ile reddeder", async () => {
    const { app } = makeRateLimitedApp({ authLimit: 3 });

    for (let i = 0; i < 3; i++) {
      const response = await app.request("/api/auth/login", { method: "POST" });
      expect(response.status).toBe(400);
    }

    const limited = await app.request("/api/auth/login", { method: "POST" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
    await expect(limited.json()).resolves.toMatchObject({
      success: false,
      error: "Too Many Requests",
    });
  });

  it("güvenilmeyen X-Forwarded-For değişiklikleri limiti bypass edemez", async () => {
    const { app } = makeRateLimitedApp({ authLimit: 2, trustedProxyHops: 0 });

    for (const spoofedIp of ["198.51.100.1", "198.51.100.2"]) {
      const response = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": spoofedIp },
      });
      expect(response.status).toBe(400);
    }

    const limited = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "198.51.100.3" },
    });
    expect(limited.status).toBe(429);
  });

  it("trusted proxy zincirinin soluna sahte IP eklemek limiti bypass edemez", async () => {
    const { app, incrementRateKey } = makeRateLimitedApp({ authLimit: 2, trustedProxyHops: 1 });

    for (const spoofedIp of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) {
      await app.request("/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": `${spoofedIp}, 203.0.113.10` },
      });
    }

    const keys = incrementRateKey.mock.calls.map(([key]) => key as string);
    expect(new Set(keys)).toEqual(new Set(["rl:auth::203.0.113.10"]));
  });

  it("farklı doğrulanmış istemci IP'leri ayrı bütçe kullanır", async () => {
    const { app } = makeRateLimitedApp({ authLimit: 1, trustedProxyHops: 1 });

    const first = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const second = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.11" },
    });

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
  });
});
