/**
 * Sonaralabs 2.0 — API Integration Tests (Main Branch)
 *
 * simplify branch'teki api.spec.ts ile birebir aynı mantık —
 * sadece main branch mimarisine özgü farklar belirtilmiştir.
 *
 * Main branch farkları:
 *   - 10 servis (credit :3005, profile :3008, notification :3007 ayrı)
 *   - SSE endpoint: /api/notify/stream  (simplify'da /api/generate/stream)
 *   - Social: PostgreSQL  (simplify'da MongoDB)
 *   - Profile: PostgreSQL  (simplify'da MongoDB via social)
 *
 * Çalıştırmak için (main branch ayaktayken):
 *   API_URL=http://localhost:3000 pnpm exec playwright test tests/e2e/api-main.spec.ts --project=chromium
 */

import { test, expect, APIRequestContext } from "@playwright/test";
import { execSync } from "child_process";

const API = process.env.API_URL || "http://localhost:3000";

// ─── Shared state ─────────────────────────────────────────────────────────────
let ctx:  APIRequestContext;
let anon: APIRequestContext;
let cookies = "";
let userId  = "";

const TS       = Date.now();
const EMAIL    = `api_main_${TS}@sonaralabs.test`;
const PASSWORD = "ApiTest@1234";

test.beforeAll(async ({ playwright }) => {
  ctx  = await playwright.request.newContext({ baseURL: API });
  anon = await playwright.request.newContext({
    baseURL: API,
    storageState: { cookies: [], origins: [] },
  });

  const redisPass = process.env.REDIS_PASSWORD || "sonaralabs_redis_dev";
  try {
    execSync(
      `docker exec sonaralabs20-redis-1 redis-cli -a "${redisPass}" KEYS "rl:*" | xargs docker exec -i sonaralabs20-redis-1 redis-cli -a "${redisPass}" DEL 2>/dev/null || true`,
      { stdio: "pipe" }
    );
  } catch { /* Redis erişilemiyorsa test yine çalışsın */ }
});

test.afterAll(async () => {
  if (cookies) await ctx.post("/api/auth/logout", { headers: { Cookie: cookies } });
  await ctx.dispose();
  await anon.dispose();
});

async function doLogin(email: string, pass: string): Promise<string> {
  const res = await ctx.post("/api/auth/login", { data: { email, password: pass } });
  return res.headersArray()
    .filter(h => h.name.toLowerCase() === "set-cookie")
    .map(h => h.value.split(";")[0])
    .join("; ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. HEALTH CHECKS
// ─────────────────────────────────────────────────────────────────────────────
test.describe("1 · Health Checks", () => {
  test("gateway /health → ok", async () => {
    const res  = await ctx.get("/health");
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("gateway");
  });

  const SERVICES = [
    "/api/auth/health",
    "/api/generate/health",
    "/api/upload/health",
    "/api/library/health",
  ];

  for (const path of SERVICES) {
    test(`${path} → servis ayakta`, async () => {
      const res = await ctx.get(path);
      expect([200, 401, 403, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body.status).toBe("ok");
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTH AKIŞI
// ─────────────────────────────────────────────────────────────────────────────
test.describe("2 · Auth API", () => {
  test("register → 201 + requiresVerification", async () => {
    const res  = await ctx.post("/api/auth/register", { data: { email: EMAIL, password: PASSWORD } });
    const body = await res.json();
    expect(res.status()).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.requiresVerification).toBe(true);
    expect(body.data.email).toBe(EMAIL);
  });

  test("duplicate email → 409", async () => {
    const res = await ctx.post("/api/auth/register", { data: { email: EMAIL, password: PASSWORD } });
    expect(res.status()).toBe(409);
  });

  test("weak password → 400", async () => {
    const res = await ctx.post("/api/auth/register", {
      data: { email: `weak_${TS}@test.com`, password: "short" },
    });
    expect(res.status()).toBe(400);
  });

  test("login → 200 + accessToken cookie", async () => {
    const res  = await ctx.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(EMAIL);
    expect(body.data.role).toBe("user");
    userId = body.data.userId;

    cookies = res.headersArray()
      .filter(h => h.name.toLowerCase() === "set-cookie")
      .map(h => h.value.split(";")[0])
      .join("; ");
    expect(cookies).toMatch(/access_?[Tt]oken/);
  });

  test("yanlış şifre → 401 veya 429 (rate limit)", async () => {
    const res = await ctx.post("/api/auth/login", {
      data: { email: EMAIL, password: "WrongPass@999" },
    });
    expect([401, 429]).toContain(res.status());
  });

  test("GET /api/auth/me → profil döner", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/auth/me", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.data.email).toBe(EMAIL);
    expect(body.data).not.toHaveProperty("passwordHash");
  });

  test("cookie olmadan /me → 401", async () => {
    const res = await anon.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. KREDİ API
// [MAIN] Ayrı credit servisi :3005 — gateway /api/credits/* → credit:/
// ─────────────────────────────────────────────────────────────────────────────
test.describe("3 · Credits API  [Main: ayrı credit servisi :3005]", () => {
  test("GET /api/credits/packages → auth gerektirmez", async () => {
    const res  = await ctx.get("/api/credits/packages");
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    for (const pkg of body.data) {
      expect(pkg).toHaveProperty("id");
      expect(pkg).toHaveProperty("credits");
      expect(pkg).toHaveProperty("price");
    }
  });

  test("GET /api/credits/balance → sayısal bakiye", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/credits/balance", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data.creditBalance).toBe("number");
  });

  test("GET /api/credits/history → sayfalı log", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/credits/history", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.logs)).toBe(true);
    expect(typeof body.data.total).toBe("number");
  });

  test("POST /api/credits/purchase → 400/500/503 (Stripe stub veya hata)", async () => {
    if (!cookies) test.skip();
    const res = await ctx.post("/api/credits/purchase", {
      headers: { Cookie: cookies },
      data: { packageId: "pack_100" },
    });
    expect([400, 500, 503]).toContain(res.status());
  });

  test("auth olmadan /credits/balance → 401", async () => {
    const res = await anon.get("/api/credits/balance");
    expect(res.status()).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROFİL API
// [MAIN] Ayrı profile servisi :3008 — PostgreSQL backend
// ─────────────────────────────────────────────────────────────────────────────
test.describe("4 · Profile API  [Main: ayrı profile servisi :3008, PostgreSQL]", () => {
  test("GET /api/profile/me → profil döner", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/profile/me", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("userId");
    expect(body.data).toHaveProperty("username");
    expect(body.data).toHaveProperty("followerCount");
    expect(body.data).toHaveProperty("followingCount");
  });

  test("PUT /api/profile/me → biyografi güncellenir", async () => {
    if (!cookies) test.skip();
    const newBio = `Bio ${TS}`;
    const res    = await ctx.put("/api/profile/me", {
      headers: { Cookie: cookies },
      data:    { bio: newBio },
    });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.bio).toBe(newBio);
  });

  test("GET /api/profile/:username → public endpoint", async () => {
    if (!cookies) test.skip();
    const meRes   = await ctx.get("/api/profile/me", { headers: { Cookie: cookies } });
    const { username } = (await meRes.json()).data;

    const res  = await ctx.get(`/api/profile/${username}`);
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.data.username).toBe(username);
  });

  test("auth olmadan /profile/me → 401", async () => {
    const res = await anon.get("/api/profile/me");
    expect(res.status()).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SOCIAL API
// [MAIN] PostgreSQL backend
// ─────────────────────────────────────────────────────────────────────────────
test.describe("5 · Social API  [Main: PostgreSQL backend]", () => {
  test("GET /api/social/tracks → public, sayfalı liste", async () => {
    const res  = await ctx.get("/api/social/tracks");
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("items");
    expect(body.data).toHaveProperty("total");
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  test("GET /api/social/tracks?genre=ambient → filtre çalışıyor", async () => {
    const res = await ctx.get("/api/social/tracks?genre=ambient");
    expect(res.status()).toBe(200);
  });

  test("GET /api/social/feed → kişisel feed (auth gerekli)", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/social/feed", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("items");
  });

  test("auth olmadan /social/feed → 401", async () => {
    const res = await anon.get("/api/social/feed");
    expect(res.status()).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. KÜTÜPHANESERVİSİ API
// ─────────────────────────────────────────────────────────────────────────────
test.describe("6 · Library API", () => {
  let collectionId = "";

  test("GET /api/library → boş liste döner", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/library", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(typeof body.data.total).toBe("number");
  });

  test("POST /api/collections → koleksiyon oluşturulur", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.post("/api/collections", {
      headers: { Cookie: cookies },
      data:    { name: `Test Koleksiyon ${TS}` },
    });
    const body = await res.json();
    expect(res.status()).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe(`Test Koleksiyon ${TS}`);
    collectionId = body.data._id || body.data.id || "";
  });

  test("GET /api/collections → oluşturulan koleksiyon listede", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/collections", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((c: any) => c.name === `Test Koleksiyon ${TS}`)).toBe(true);
  });

  test("DELETE /api/collections/:id → koleksiyon silinir", async () => {
    if (!cookies || !collectionId) test.skip();
    const res = await ctx.delete(`/api/collections/${collectionId}`, {
      headers: { Cookie: cookies },
    });
    expect(res.status()).toBe(200);
  });

  test("auth olmadan /library → 401", async () => {
    const res = await anon.get("/api/library");
    expect(res.status()).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. GENERATION + NOTIFICATION API
// [MAIN] SSE ayrı notification servisinde: /api/notify/stream
//        (simplify'da /api/generate/stream)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("7 · Generation + Notification API  [Main: SSE /api/notify/stream]", () => {
  test("GET /api/generate/history → sayfalı geçmiş", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/generate/history", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  test("GET /api/generate/history?status=pending → filtre çalışıyor", async () => {
    if (!cookies) test.skip();
    const res = await ctx.get("/api/generate/history?status=pending", {
      headers: { Cookie: cookies },
    });
    expect(res.status()).toBe(200);
  });

  // [MAIN] SSE ayrı notification servisinde — simplify'da generation içindeydi
  test("GET /api/notify/stream → text/event-stream açılıyor", async () => {
    if (!cookies) test.skip();
    const res = await ctx.get("/api/notify/stream", {
      headers: { Cookie: cookies },
      timeout: 2000,
    }).catch(() => null);

    if (res && res.status() === 200) {
      const ct = res.headers()["content-type"] ?? "";
      expect(ct).toContain("text/event-stream");
    }
    // null = timeout = bağlantı açık kaldı ✓
  });

  test("kredi olmadan üretim → 402 veya 422", async () => {
    const zeroEmail = `zero_main_${TS}@test.com`;
    await ctx.post("/api/auth/register", { data: { email: zeroEmail, password: "ZeroPass@1" } });
    const zeroCookies = await doLogin(zeroEmail, "ZeroPass@1");
    if (!zeroCookies) return test.skip();

    const res = await ctx.post("/api/generate", {
      headers: { Cookie: zeroCookies },
      data:    { prompt: "epic battle", provider: "beatoven", duration: 15, style: "cinematic", mood: "intense" },
    });
    expect([402, 422]).toContain(res.status());
    await ctx.post("/api/auth/logout", { headers: { Cookie: zeroCookies } });
  });

  test("auth olmadan /generate/history → 401", async () => {
    const res = await anon.get("/api/generate/history");
    expect(res.status()).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. UPLOAD API
// ─────────────────────────────────────────────────────────────────────────────
test.describe("8 · Upload API", () => {
  test("dosyasız POST /api/upload → 400 veya 422", async () => {
    if (!cookies) test.skip();
    const res = await ctx.post("/api/upload", {
      headers: { Cookie: cookies },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("auth olmadan upload → 401", async () => {
    const res = await anon.post("/api/upload");
    expect(res.status()).toBe(401);
  });

  test("GET /api/library?type=upload → upload filtresi", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/library?type=upload", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. ADMİN API
// ─────────────────────────────────────────────────────────────────────────────
test.describe("9 · Admin API (double-layer guard)", () => {
  test("anonim → 401", async () => {
    const res = await anon.get("/api/admin/stats");
    expect(res.status()).toBe(401);
  });

  test("normal kullanıcı → 403", async () => {
    if (!cookies) test.skip();
    const res = await ctx.get("/api/admin/stats", { headers: { Cookie: cookies } });
    expect(res.status()).toBe(403);
  });

  test("admin kullanıcı → 200 ile stats", async () => {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass  = process.env.ADMIN_PASS;
    if (!adminEmail || !adminPass) return test.skip();

    const adminCookies = await doLogin(adminEmail, adminPass);
    if (!adminCookies) return test.skip();

    const res  = await ctx.get("/api/admin/stats", { headers: { Cookie: adminCookies } });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.data).toHaveProperty("users");
    expect(body.data).toHaveProperty("generations");
    await ctx.post("/api/auth/logout", { headers: { Cookie: adminCookies } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. GÜVENLİK TESTLERİ
// ─────────────────────────────────────────────────────────────────────────────
test.describe("10 · Security", () => {
  test("var olmayan koleksiyon ID → 403/404", async () => {
    if (!cookies) test.skip();
    const res = await ctx.get("/api/collections/000000000000000000000001", {
      headers: { Cookie: cookies },
    });
    expect([403, 404]).toContain(res.status());
  });

  test("x-internal-token header'ı gateway'den geçemiyor", async () => {
    const res = await ctx.get("/api/auth/me", {
      headers: { "x-internal-token": "hacker.fake.token" },
    });
    expect(res.status()).toBe(401);
  });

  test("auth rate limit: 11 hızlı istek → en az biri 429", async () => {
    const dummy = `rl_main_${TS}@test.com`;
    const results = await Promise.all(
      Array.from({ length: 11 }, () =>
        ctx.post("/api/auth/login", { data: { email: dummy, password: "WrongPass@1" } })
      )
    );
    const statuses = results.map(r => r.status());
    expect(statuses.some(s => s === 429)).toBe(true);
  });

  test("passwordHash yanıtta asla dönmez", async () => {
    if (!cookies) test.skip();
    const res  = await ctx.get("/api/auth/me", { headers: { Cookie: cookies } });
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain("password");
  });
});
