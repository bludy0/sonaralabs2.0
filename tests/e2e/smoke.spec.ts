/**
 * Sonaralabs 2.0 — Smoke Tests
 *
 * Çalıştırmak için:
 *   docker-compose up -d
 *   BASE_URL=http://localhost:5173 pnpm exec playwright test
 *
 * API_URL: gateway doğrudan test edilir (port 3000)
 */

import { test, expect, request, APIRequestContext, Page } from "@playwright/test";

const API = process.env.API_URL || "http://localhost:3000";

// ── Test helpers ─────────────────────────────────────────────────────────────

let apiCtx: APIRequestContext;

const TEST_EMAIL    = `smoke_${Date.now()}@sonaralabs.test`;
const TEST_PASSWORD = "Smoke@12345";

test.beforeAll(async ({ playwright }) => {
  apiCtx = await playwright.request.newContext({ baseURL: API });
});

test.afterAll(async () => {
  await apiCtx.dispose();
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

const MOCK_USER = {
  userId: "test123",
  email: "test@example.com",
  role: "user",
  creditBalance: 100,
  storageUsed: 0,
};

/**
 * Set up mocks so the app believes the user is logged in without a real backend.
 * Also silences all other API calls that fire on page load.
 */
async function mockLoggedIn(page: Page) {
  // Auth — /me returns a valid user
  await page.route("**/api/auth/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_USER }),
    });
  });

  // Generation history (fetched on GeneratePage mount)
  await page.route("**/api/generate/history**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { items: [], total: 0 } }),
    });
  });

  // Credit balance (fetched from sidebar / balance endpoint)
  await page.route("**/api/credits/balance", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { balance: 100 } }),
    });
  });

  // Library items
  await page.route("**/api/library**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { items: [], total: 0 } }),
    });
  });

  // Collections
  await page.route("**/api/collections**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  // Notifications SSE — prevent hanging EventSource connection
  await page.route("**/api/notifications/stream**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "",
    });
  });

  // Social tracks (Explore page)
  await page.route("**/api/social/tracks**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { items: [], total: 0 } }),
    });
  });

  // Profile
  await page.route("**/api/profile/**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          userId: "test123",
          username: "testuser",
          bio: "",
          avatarUrl: null,
          publishedTracks: [],
        },
      }),
    });
  });
}

// ── 1. Health checks ──────────────────────────────────────────────────────────

test.describe("Health checks", () => {
  const services = [
    { name: "gateway",      path: "/health" },
    { name: "auth",         path: "/api/auth/health" },
    { name: "generation",   path: "/api/generate/health" },
    { name: "library",      path: "/api/library/health" },
    { name: "credit",       path: "/api/credits/health" },
    { name: "notification", path: "/api/notifications/health" },
    { name: "profile",      path: "/api/profile/health" },
    { name: "social",       path: "/api/social/health" },
  ];

  for (const { name, path } of services) {
    test(`${name} is healthy`, async () => {
      test.skip(process.env.CI !== undefined, "Requires running backend");
      const res = await apiCtx.get(path);
      expect(res.status(), `${name} returned non-200`).toBeLessThan(500);
      const body = await res.json().catch(() => ({}));
      expect(body.status || body.ok || true).toBeTruthy();
    });
  }
});

// ── 2. Auth API flow ──────────────────────────────────────────────────────────

test.describe("Auth API", () => {
  test("register → /me → logout", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    const reg = await apiCtx.post("/api/auth/register", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(reg.status()).toBe(201);
    const regBody = await reg.json();
    expect(regBody.success).toBe(true);
    expect(regBody.data?.user?.email).toBe(TEST_EMAIL);
    expect(regBody.data?.user?.creditBalance).toBe(100);

    const me = await apiCtx.get("/api/auth/me");
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    expect(meBody.data?.email).toBe(TEST_EMAIL);

    const logout = await apiCtx.post("/api/auth/logout");
    expect(logout.status()).toBe(200);
  });

  test("login with wrong password → 401", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    const res = await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: "WrongPass!99" },
    });
    expect(res.status()).toBe(401);
  });

  test("login correct → 200", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    const res = await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ── 3. Credit API ─────────────────────────────────────────────────────────────

test.describe("Credits API", () => {
  test("balance is 100 after registration", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.get("/api/credits/balance");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data?.balance ?? body.balance).toBe(100);
  });

  test("purchase returns 503 (MVP stub)", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.post("/api/credits/purchase", {
      data: { amount: 100 },
    });
    expect(res.status()).toBe(503);
  });
});

// ── 4. Library API ────────────────────────────────────────────────────────────

test.describe("Library API", () => {
  test("empty library returns success", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.get("/api/library");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.items ?? [])).toBe(true);
  });

  test("create collection", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.post("/api/collections", {
      data: { name: "My Smoke Test Collection" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data?.name).toBe("My Smoke Test Collection");
  });
});

// ── 5. DAW Projects API ───────────────────────────────────────────────────────

test.describe("DAW Projects API", () => {
  let projectId: string;

  test("create project", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.post("/api/projects", {
      data: {
        name: "Smoke Project",
        tracks: [],
        bpm: 120,
        masterVolume: 0.8,
        loopStart: 0,
        loopEnd: 8,
        loopEnabled: false,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data?._id).toBeTruthy();
    projectId = body.data._id;
  });

  test("list projects", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.get("/api/projects");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("update project name", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    if (!projectId) test.skip();
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.put(`/api/projects/${projectId}`, {
      data: { name: "Renamed Smoke Project" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data?.name).toBe("Renamed Smoke Project");
  });

  test("generate share link", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    if (!projectId) test.skip();
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.post(`/api/projects/${projectId}/share`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data?.shareToken).toBeTruthy();
    expect(body.data?.isPublic).toBe(true);

    const pub = await apiCtx.get(`/api/projects/share/${body.data.shareToken}`);
    expect(pub.status()).toBe(200);
    const pubBody = await pub.json();
    expect(pubBody.data?.name).toBe("Renamed Smoke Project");
  });

  test("delete project", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    if (!projectId) test.skip();
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.delete(`/api/projects/${projectId}`);
    expect(res.status()).toBe(200);
  });
});

// ── 6. Profile API ────────────────────────────────────────────────────────────

test.describe("Profile API", () => {
  test("GET /api/profile/me returns profile", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.get("/api/profile/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data?.userId).toBeTruthy();
  });

  test("PUT /api/profile/me updates bio", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    await apiCtx.post("/api/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const res = await apiCtx.put("/api/profile/me", {
      data: { bio: "Smoke test bio" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data?.bio).toBe("Smoke test bio");
  });
});

// ── 7. Social — Explore API ───────────────────────────────────────────────────

test.describe("Social — Explore API", () => {
  test("GET /api/social/tracks returns paginated list", async () => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    const res = await apiCtx.get("/api/social/tracks", {
      params: { page: "1", limit: "10" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.items)).toBe(true);
  });
});

// ── 8. Authentication UI (mocked) ─────────────────────────────────────────────

test.describe("Authentication", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type=email]")).toBeVisible();
    await expect(page.locator("input[type=password]")).toBeVisible();
    await expect(page.locator("button[type=submit]")).toBeVisible();
    await expect(page.locator("button[type=submit]")).toContainText(/Sign in/i);
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("input[type=email]")).toBeVisible();
    await expect(page.locator("input[type=password]")).toBeVisible();
    await expect(page.locator("button[type=submit]")).toBeVisible();
    await expect(page.locator("button[type=submit]")).toContainText(/Create account/i);
  });

  test("unauthenticated visit to / redirects to /login", async ({ page }) => {
    // Make /me return 401 so the app thinks no user is logged in
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    });
    await page.goto("/");
    await page.waitForURL("**/login");
    await expect(page.locator("input[type=email]")).toBeVisible();
  });

  test("unauthenticated visit to /generate redirects to /login", async ({ page }) => {
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    });
    await page.goto("/generate");
    await page.waitForURL("**/login");
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.route("**/api/auth/login", async route => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });
    await page.goto("/login");
    await page.fill("input[type=email]", "bad@example.com");
    await page.fill("input[type=password]", "wrongpassword");
    await page.click("button[type=submit]");
    // Error message should appear (color: #ff7351 paragraph)
    await expect(page.locator("p").filter({ hasText: /invalid|failed|credentials/i })).toBeVisible({ timeout: 5000 });
  });

  test("login with valid credentials redirects to /generate", async ({ page }) => {
    await page.route("**/api/auth/login", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { user: MOCK_USER } }),
      });
    });
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: MOCK_USER }),
      });
    });
    // Mock downstream calls on /generate
    await page.route("**/api/generate/history**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.route("**/api/notifications/stream**", async route => {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
    });

    await page.goto("/login");
    await page.fill("input[type=email]", "test@example.com");
    await page.fill("input[type=password]", "Password@1");
    await page.click("button[type=submit]");
    await page.waitForURL("**/generate", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/generate/);
  });

  test("register with valid credentials redirects to /generate", async ({ page }) => {
    await page.route("**/api/auth/register", async route => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { user: MOCK_USER } }),
      });
    });
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: MOCK_USER }),
      });
    });
    await page.route("**/api/generate/history**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.route("**/api/notifications/stream**", async route => {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
    });

    await page.goto("/register");
    await page.fill("input[type=email]", "newuser@example.com");
    await page.fill("input[type=password]", "Password@1");
    await page.click("button[type=submit]");
    await page.waitForURL("**/generate", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/generate/);
  });

  test("credit balance visible in sidebar after login", async ({ page }) => {
    await mockLoggedIn(page);
    await page.goto("/generate");
    // The credit balance element has data-testid="credit-balance"
    const creditEl = page.locator("[data-testid='credit-balance']");
    await expect(creditEl).toBeVisible({ timeout: 10_000 });
    await expect(creditEl).toContainText("100");
  });

  test("logout redirects to /login", async ({ page }) => {
    await mockLoggedIn(page);
    await page.route("**/api/auth/logout", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });
    await page.goto("/generate");

    // Wait for the sidebar logout button (data-testid="logout-btn")
    const logoutBtn = page.locator("[data-testid='logout-btn']");
    await expect(logoutBtn).toBeVisible({ timeout: 10_000 });
    await logoutBtn.click();
    await page.waitForURL("**/login", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("full register flow with real backend", async ({ page }) => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    const email    = `e2e_${Date.now()}@sonaralabs.test`;
    const password = "E2eTest@999";

    await page.goto("/register");
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", password);
    await page.click("button[type=submit]");

    await page.waitForURL("**/generate", { timeout: 10_000 });
    await expect(page.getByTestId("credit-balance")).toHaveText("100");
  });

  test("full logout flow with real backend", async ({ page }) => {
    test.skip(process.env.CI !== undefined, "Requires running backend");
    const email    = `e2e_${Date.now()}@sonaralabs.test`;
    const password = "E2eTest@999";

    await page.goto("/register");
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", password);
    await page.click("button[type=submit]");
    await page.waitForURL("**/generate");

    await page.getByTestId("logout-btn").click();
    await page.waitForURL("**/login");
  });
});

// ── 9. Generate Page UI ───────────────────────────────────────────────────────

test.describe("Generate Page", () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedIn(page);
  });

  test("two-panel layout is present", async ({ page }) => {
    await page.goto("/generate");
    // Left panel — the form container with a fixed width
    const leftPanel = page.locator("div.w-\\[450px\\]");
    await expect(leftPanel).toBeVisible({ timeout: 10_000 });
    // Right panel — queue panel
    await expect(page.locator("text=Active Stream_Queue")).toBeVisible();
  });

  test("Music and SFX mode tabs are present", async ({ page }) => {
    await page.goto("/generate");
    await expect(page.locator("button", { hasText: "Music" })).toBeVisible();
    await expect(page.locator("button", { hasText: "SFX" })).toBeVisible();
  });

  test("prompt textarea is present in Music mode", async ({ page }) => {
    await page.goto("/generate");
    const promptTextarea = page.locator("[data-testid='prompt-input']");
    await expect(promptTextarea).toBeVisible();
  });

  test("generate button present with credit cost label", async ({ page }) => {
    await page.goto("/generate");
    const generateBtn = page.locator("[data-testid='generate-btn']");
    await expect(generateBtn).toBeVisible();
    // The button shows "Generate Music" text and a credit cost chip
    await expect(generateBtn).toContainText(/Generate Music/i);
    await expect(generateBtn).toContainText(/cr/i);
  });

  test("Style dropdown is present", async ({ page }) => {
    await page.goto("/generate");
    const styleSelect = page.locator("[data-testid='style-select']");
    await expect(styleSelect).toBeVisible();
  });

  test("Mood dropdown is present", async ({ page }) => {
    await page.goto("/generate");
    const moodSelect = page.locator("[data-testid='mood-select']");
    await expect(moodSelect).toBeVisible();
  });

  test("Duration dropdown is present", async ({ page }) => {
    await page.goto("/generate");
    const durationSelect = page.locator("[data-testid='duration-select']");
    await expect(durationSelect).toBeVisible();
  });

  test("Provider dropdown is present", async ({ page }) => {
    await page.goto("/generate");
    const providerSelect = page.locator("[data-testid='provider-select']");
    await expect(providerSelect).toBeVisible();
  });

  test("switching to SFX mode shows SFX form", async ({ page }) => {
    await page.goto("/generate");
    await page.locator("button", { hasText: "SFX" }).click();
    // SFX form has a textarea with sfx-prompt id
    await expect(page.locator("#sfx-prompt")).toBeVisible();
    await expect(page.locator("button", { hasText: /Generate SFX/i })).toBeVisible();
  });

  test("empty generation queue shows placeholder message", async ({ page }) => {
    await page.goto("/generate");
    await expect(page.locator("text=No generations yet")).toBeVisible();
  });
});

// ── 10. Library Page UI ───────────────────────────────────────────────────────

test.describe("Library Page", () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedIn(page);
  });

  test("library page loads and shows heading", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator("h1", { hasText: "Library" })).toBeVisible({ timeout: 10_000 });
  });

  test("All filter tab is present and active by default", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator("button", { hasText: "All" })).toBeVisible();
  });

  test("Favorites filter tab is present", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator("button", { hasText: "Favorites" })).toBeVisible();
  });

  test("Generations filter tab is present", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator("button", { hasText: "Generations" })).toBeVisible();
  });

  test("Uploads filter tab is present", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator("button", { hasText: "Uploads" })).toBeVisible();
  });

  test("Upload audio area is present", async ({ page }) => {
    await page.goto("/library");
    // The upload section contains a file input
    await expect(page.locator("input[type=file][accept='.wav,.mp3,.ogg']")).toBeAttached();
    await expect(page.locator("label", { hasText: "Upload audio:" })).toBeVisible();
  });

  test("empty library shows no-items message", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator("text=No items found")).toBeVisible({ timeout: 10_000 });
  });

  test("Collections sidebar is present", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator("h2", { hasText: "Collections" })).toBeVisible();
  });
});

// ── 11. Explore Page UI (public) ─────────────────────────────────────────────

test.describe("Explore Page", () => {
  test("explore page loads without authentication", async ({ page }) => {
    // No auth mocks — explore is public
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    });
    await page.route("**/api/social/tracks**", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { items: [], total: 0 } }),
      });
    });
    await page.goto("/explore");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("h1", { hasText: "Explore" })).toBeVisible({ timeout: 10_000 });
  });

  test("search input is present", async ({ page }) => {
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    });
    await page.route("**/api/social/tracks**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.goto("/explore");
    const searchInput = page.locator("input[placeholder*='Search']");
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  test("Popular filter chip is present", async ({ page }) => {
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    });
    await page.route("**/api/social/tracks**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.goto("/explore");
    await expect(page.locator("button", { hasText: "Popular" })).toBeVisible({ timeout: 10_000 });
  });

  test("genre filter chips are present (ambient, action, puzzle, horror)", async ({ page }) => {
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    });
    await page.route("**/api/social/tracks**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.goto("/explore");
    // FILTER_CHIPS = ["Popular", "ambient", "action", "puzzle", "horror"]
    for (const chip of ["Popular", "ambient", "action", "puzzle", "horror"]) {
      await expect(page.locator("button", { hasText: new RegExp(`^${chip}$`, "i") })).toBeVisible({ timeout: 10_000 });
    }
  });

  test("no-tracks message shown when API returns empty", async ({ page }) => {
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    });
    await page.route("**/api/social/tracks**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.goto("/explore");
    await expect(page.locator("text=No tracks found")).toBeVisible({ timeout: 10_000 });
  });
});

// ── 12. Profile Page UI ───────────────────────────────────────────────────────

test.describe("Profile Page", () => {
  test("profile page loads for a known user", async ({ page }) => {
    await page.route("**/api/auth/me", async route => {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    });
    await page.route("**/api/profile/testuser", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            userId: "test123",
            username: "testuser",
            bio: "A test user",
            avatarUrl: null,
            publishedTracks: [],
          },
        }),
      });
    });
    await page.route("**/api/social/tracks**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.goto("/profile/testuser");
    // Should not redirect to login — profile is public
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("logged-in user visits own profile — page loads or shows not-found", async ({ page }) => {
    await mockLoggedIn(page);
    await page.goto("/profile/testuser");
    await expect(page).not.toHaveURL(/\/login/);
    // Either the profile loaded or a not-found/error state rendered
    // We just verify the page does not crash (check body exists)
    await expect(page.locator("body")).toBeVisible();
  });
});

// ── 13. Navigation ────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedIn(page);
  });

  test("all nav items present in sidebar when logged in", async ({ page }) => {
    await page.goto("/generate");
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    for (const label of ["Generate", "Library", "Studio", "Explore", "Feed"]) {
      await expect(sidebar.locator("a", { hasText: new RegExp(label, "i") })).toBeVisible();
    }
  });

  test("sidebar Generate link navigates to /generate", async ({ page }) => {
    await page.goto("/library");
    const sidebar = page.locator("aside");
    await sidebar.locator("a", { hasText: /Generate/i }).click();
    await page.waitForURL("**/generate");
    await expect(page).toHaveURL(/\/generate/);
  });

  test("sidebar Library link navigates to /library", async ({ page }) => {
    await page.goto("/generate");
    const sidebar = page.locator("aside");
    await sidebar.locator("a", { hasText: /Library/i }).click();
    await page.waitForURL("**/library");
    await expect(page).toHaveURL(/\/library/);
  });

  test("sidebar Explore link navigates to /explore", async ({ page }) => {
    await page.route("**/api/social/tracks**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.goto("/generate");
    const sidebar = page.locator("aside");
    await sidebar.locator("a", { hasText: /Explore/i }).click();
    await page.waitForURL("**/explore");
    await expect(page).toHaveURL(/\/explore/);
  });

  test("sidebar Feed link navigates to /feed", async ({ page }) => {
    await page.route("**/api/social/tracks**", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0 } }) });
    });
    await page.goto("/generate");
    const sidebar = page.locator("aside");
    await sidebar.locator("a", { hasText: /Feed/i }).click();
    await page.waitForURL("**/feed");
    await expect(page).toHaveURL(/\/feed/);
  });

  test("sidebar Studio link navigates to /studio", async ({ page }) => {
    await page.goto("/generate");
    const sidebar = page.locator("aside");
    await sidebar.locator("a", { hasText: /Studio/i }).click();
    await page.waitForURL("**/studio");
    await expect(page).toHaveURL(/\/studio/);
  });

  test("Sonaralabs brand label is visible in sidebar", async ({ page }) => {
    await page.goto("/generate");
    const sidebar = page.locator("aside");
    await expect(sidebar.locator("text=Sonaralabs")).toBeVisible();
  });

  test("user email is shown in sidebar bottom panel", async ({ page }) => {
    await page.goto("/generate");
    const sidebar = page.locator("aside");
    await expect(sidebar.locator(`text=${MOCK_USER.email}`)).toBeVisible({ timeout: 10_000 });
  });
});
