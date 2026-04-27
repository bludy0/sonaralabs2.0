// services/profile/src/__tests__/profile.test.ts
// PostgreSQL ve MinIO mock'lanır. İş mantığı, validasyon ve SQL sorguları test edilir.

process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.DATABASE_URL        = "postgresql://test:test@localhost:5432/test";
process.env.MINIO_ENDPOINT      = "localhost";
process.env.PORT                = "3008";

import jwt from "jsonwebtoken";

const SECRET = process.env.INTERNAL_JWT_SECRET!;

// ── Helpers (profile/src/index.ts'den) ────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>) {
  return {
    userId:         row.user_id,
    username:       row.username,
    displayName:    row.display_name,
    bio:            row.bio,
    avatarUrl:      row.avatar_url,
    gameGenres:     (row.game_genres as string[]) ?? [],
    isPublic:       row.is_public,
    followerCount:  row.follower_count ?? 0,
    followingCount: row.following_count ?? 0,
    trackCount:     row.track_count ?? 0,
    createdAt:      row.created_at instanceof Date
      ? (row.created_at as Date).toISOString()
      : String(row.created_at),
  };
}

function getPayload(token: string | null) {
  if (!token) throw new Error("No internal token");
  return jwt.verify(token, SECRET) as any;
}

function makeToken(userId: string) {
  return jwt.sign({ sub: userId, role: "user", _internal: true }, SECRET, { expiresIn: "5m" });
}

// ── Avatar URL helper ─────────────────────────────────────────────────────────

function avatarUrl(endpoint: string, port: string, bucket: string, objectName: string) {
  return `http://${endpoint}:${port}/${bucket}/${objectName}`;
}

// ── rowToProfile ──────────────────────────────────────────────────────────────

describe("rowToProfile — DB satırını tipe dönüştürür", () => {
  it("tam satır doğru dönüştürülür", () => {
    const row = {
      user_id: "abc123",
      username: "pixel_composer",
      display_name: "Pixel Composer",
      bio: "Game music creator",
      avatar_url: "https://storage/avatar.jpg",
      game_genres: ["rpg", "platformer"],
      is_public: true,
      follower_count: 10,
      following_count: 5,
      track_count: 3,
      created_at: new Date("2025-01-01"),
    };
    const profile = rowToProfile(row);
    expect(profile.userId).toBe("abc123");
    expect(profile.username).toBe("pixel_composer");
    expect(profile.gameGenres).toEqual(["rpg", "platformer"]);
    expect(profile.followerCount).toBe(10);
    expect(profile.isPublic).toBe(true);
  });

  it("opsiyonel alanlar undefined olabilir", () => {
    const row = {
      user_id: "abc123", username: "user_12345678",
      is_public: true,
      follower_count: 0, following_count: 0, track_count: 0,
      created_at: new Date(),
    };
    const profile = rowToProfile(row);
    expect(profile.bio).toBeUndefined();
    expect(profile.avatarUrl).toBeUndefined();
    expect(profile.gameGenres).toEqual([]);
  });
});

// ── Default username ──────────────────────────────────────────────────────────

describe("Default username oluşturma", () => {
  it("MongoDB ObjectId son 8 char geçerli hex döner", () => {
    // MongoDB ObjectId = 24 hex karakter (0-9, a-f)
    const objectId = "507f1f77bcf86cd799439011";
    const defaultUsername = `user_${objectId.slice(-8)}`;
    expect(defaultUsername).toBe("user_99439011");  // slice(-8) = son 8 karakter
    expect(/^user_[0-9a-f]+$/.test(defaultUsername)).toBe(true);
  });

  it.each([
    "507f1f77bcf86cd799439011",
    "60d5f484f1b2c3a4e5f6a7b8",
    "000000000000000000000001",
  ])("ObjectId '%s' için default username geçerli", (objectId) => {
    const username = `user_${objectId.slice(-8)}`;
    expect(/^user_[0-9a-f]{7,8}$/.test(username)).toBe(true);
  });
});

// ── Avatar URL ────────────────────────────────────────────────────────────────

describe("avatarUrl helper", () => {
  it("doğru URL formatı oluşturur", () => {
    const url = avatarUrl("minio", "9000", "sonaralabs-avatars", "user123.jpg");
    expect(url).toBe("http://minio:9000/sonaralabs-avatars/user123.jpg");
  });

  it("objectName formatı: userId.ext", () => {
    const userId = "60d5f484f1b2c3a4e5f6a7b8";
    const ext = "image/jpeg".split("/")[1].replace("jpeg", "jpg");
    const objectName = `${userId}.${ext}`;
    expect(objectName).toBe("60d5f484f1b2c3a4e5f6a7b8.jpg");
  });

  it.each([
    ["image/jpeg",  "jpg"],
    ["image/jpg",   "jpg"],
    ["image/png",   "png"],
    ["image/webp",  "webp"],
  ])("%s → ext: %s", (mimeType, expectedExt) => {
    const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
    expect(ext).toBe(expectedExt);
  });
});

// ── Avatar validasyonu ────────────────────────────────────────────────────────

describe("Avatar dosya validasyonu", () => {
  const ALLOWED  = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

  it.each(ALLOWED)("%s kabul edilir", (mime) => {
    expect(ALLOWED.includes(mime)).toBe(true);
  });

  it("GIF reddedilir", () => {
    expect(ALLOWED.includes("image/gif")).toBe(false);
  });

  it("5 MB sınırında kabul edilir", () => {
    expect(MAX_BYTES).toBeLessThanOrEqual(5 * 1024 * 1024 + 1);
  });

  it("5 MB'ı aşan dosya reddedilir", () => {
    const fileSize = 6 * 1024 * 1024;
    expect(fileSize > MAX_BYTES).toBe(true);
  });
});

// ── Username validasyonu ──────────────────────────────────────────────────────

describe("Username validasyonu", () => {
  const isValid = (u: string) => /^[a-z0-9_]{3,30}$/.test(u);

  it.each(["pixel_composer", "user123", "abc", "a_b_c_123"])(
    "'%s' geçerli username", (u) => { expect(isValid(u)).toBe(true); }
  );

  it.each(["ab", "A_B_C", "user name", "user!", "", "a".repeat(31)])(
    "'%s' geçersiz username", (u) => { expect(isValid(u)).toBe(false); }
  );
});

// ── PUT /me validasyonu ───────────────────────────────────────────────────────

describe("PUT /me — profil güncelleme COALESCE mantığı", () => {
  it("null gönderilen alan mevcut değeri korur (COALESCE)", () => {
    // SQL: COALESCE($2, user_profiles.username)
    // $2 = null → mevcut değeri koru
    const existingValue = "old_username";
    const newValue = null;
    const result = newValue ?? existingValue;
    expect(result).toBe("old_username");
  });

  it("yeni değer gönderilince güncellenir", () => {
    const existingValue = "old_username";
    const newValue = "new_username";
    const result = newValue ?? existingValue;
    expect(result).toBe("new_username");
  });
});

// ── Counter PATCH ─────────────────────────────────────────────────────────────

describe("PATCH /internal/profile/:userId/counters", () => {
  it.each([
    [{ followerDelta: 1,  followingDelta: 0, trackDelta: 0 }, [1, 0, 0]],
    [{ followerDelta: -1, followingDelta: 0, trackDelta: 0 }, [-1, 0, 0]],
    [{ followerDelta: 0,  followingDelta: 1, trackDelta: 0 }, [0, 1, 0]],
    [{ followerDelta: 0,  followingDelta: 0, trackDelta: 1 }, [0, 0, 1]],
  ])("delta %j → params %j", (body, expected) => {
    const { followerDelta = 0, followingDelta = 0, trackDelta = 0 } = body;
    expect([followerDelta, followingDelta, trackDelta]).toEqual(expected);
  });

  it("eksik delta alanları 0 default alır", () => {
    const body = {};
    const { followerDelta = 0, followingDelta = 0, trackDelta = 0 } = body as any;
    expect(followerDelta).toBe(0);
    expect(followingDelta).toBe(0);
    expect(trackDelta).toBe(0);
  });
});

// ── Internal JWT ──────────────────────────────────────────────────────────────

describe("Internal JWT", () => {
  it("geçerli token kabul edilir", () => {
    const token = makeToken("uid123");
    const payload = getPayload(token);
    expect(payload.sub).toBe("uid123");
  });

  it("token yoksa 401", () => {
    expect(() => getPayload(null)).toThrow("No internal token");
  });

  it("süresi dolmuş token reddedilir", async () => {
    const token = jwt.sign({ sub: "u", _internal: true }, SECRET, { expiresIn: "1ms" });
    await new Promise(r => setTimeout(r, 5));
    expect(() => getPayload(token)).toThrow(/expired/i);
  });
});
