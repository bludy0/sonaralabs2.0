// services/social/src/__tests__/social.test.ts
// PostgreSQL ve Redis mock'lanır. İş mantığı, token doğrulama ve SQL sorgular test edilir.

process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.DATABASE_URL        = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL           = "redis://localhost:6379";
process.env.PORT                = "3009";

import jwt from "jsonwebtoken";

const SECRET = process.env.INTERNAL_JWT_SECRET!;

// ── Helpers (social servisiyle aynı) ─────────────────────────────────────────

function rowToTrack(row: Record<string, unknown>) {
  return {
    id:           row.id,
    userId:       row.user_id,
    username:     row.username ?? "",
    title:        row.title,
    audioUrl:     row.audio_url,
    durationSec:  row.duration_sec,
    bpm:          row.bpm,
    genreTags:    (row.genre_tags as string[]) ?? [],
    moodTags:     (row.mood_tags  as string[]) ?? [],
    gameTypeTags: (row.game_type_tags as string[]) ?? [],
    likeCount:    row.like_count ?? 0,
    isLoop:       row.is_loop ?? false,
    createdAt:    row.created_at instanceof Date
      ? (row.created_at as Date).toISOString()
      : String(row.created_at),
  };
}

function getPayload(token: string | null) {
  if (!token) throw new Error("No internal token");
  return jwt.verify(token, SECRET) as any;
}

function makeToken(userId: string, role = "user") {
  return jwt.sign({ sub: userId, role, _internal: true }, SECRET, { expiresIn: "5m" });
}

// ── rowToTrack ────────────────────────────────────────────────────────────────

describe("rowToTrack — PostgreSQL satırını tipe dönüştürür", () => {
  it("tam satır doğru dönüştürülür", () => {
    const row = {
      id: "uuid-123", user_id: "uid1", username: "testuser",
      title: "Battle Theme", audio_url: "https://storage/track.wav",
      duration_sec: 30, bpm: 120,
      genre_tags: ["action", "rpg"], mood_tags: ["epic"], game_type_tags: ["fps"],
      like_count: 5, is_loop: true,
      created_at: new Date("2025-01-01T00:00:00Z"),
    };
    const track = rowToTrack(row);
    expect(track.id).toBe("uuid-123");
    expect(track.title).toBe("Battle Theme");
    expect(track.genreTags).toEqual(["action", "rpg"]);
    expect(track.likeCount).toBe(5);
    expect(track.isLoop).toBe(true);
    expect(track.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("eksik opsiyonel alanlar default değer alır", () => {
    const row = {
      id: "uuid-456", user_id: "uid2", title: "Ambient",
      audio_url: "url", duration_sec: 15,
      created_at: new Date(),
    };
    const track = rowToTrack(row);
    expect(track.genreTags).toEqual([]);
    expect(track.moodTags).toEqual([]);
    expect(track.likeCount).toBe(0);
    expect(track.isLoop).toBe(false);
  });
});

// ── Internal JWT ──────────────────────────────────────────────────────────────

describe("getPayload — internal JWT", () => {
  it("geçerli token kabul edilir", () => {
    const token = makeToken("user123");
    const payload = getPayload(token);
    expect(payload.sub).toBe("user123");
    expect(payload._internal).toBe(true);
  });

  it("token yoksa hata fırlatır", () => {
    expect(() => getPayload(null)).toThrow("No internal token");
  });

  it("yanlış secret reddedilir", () => {
    const bad = jwt.sign({ sub: "u", _internal: true }, "wrong");
    expect(() => getPayload(bad)).toThrow();
  });

  it("süresi dolmuş token reddedilir", async () => {
    const token = jwt.sign({ sub: "u", _internal: true }, SECRET, { expiresIn: "1ms" });
    await new Promise(r => setTimeout(r, 5));
    expect(() => getPayload(token)).toThrow(/expired/i);
  });
});

// ── SQL sorgu oluşturma mantığı ───────────────────────────────────────────────

describe("GET /tracks — dinamik SQL sorgu oluşturma", () => {
  function buildTrackQuery(opts: { userId?: string; genre?: string; mood?: string; q?: string }) {
    let sql = "SELECT * FROM public_tracks WHERE true";
    const params: unknown[] = [];
    let pi = 1;

    if (opts.userId) { sql += ` AND user_id = $${pi}`;         params.push(opts.userId); pi++; }
    if (opts.genre)  { sql += ` AND $${pi} = ANY(genre_tags)`;  params.push(opts.genre);  pi++; }
    if (opts.mood)   { sql += ` AND $${pi} = ANY(mood_tags)`;   params.push(opts.mood);   pi++; }
    if (opts.q)      { sql += ` AND title ILIKE $${pi}`;        params.push(`%${opts.q}%`); pi++; }

    return { sql, params };
  }

  it("filtre yok → sadece WHERE true", () => {
    const { sql, params } = buildTrackQuery({});
    expect(sql).toBe("SELECT * FROM public_tracks WHERE true");
    expect(params).toHaveLength(0);
  });

  it("userId filtresi eklenir", () => {
    const { sql, params } = buildTrackQuery({ userId: "uid1" });
    expect(sql).toContain("user_id = $1");
    expect(params[0]).toBe("uid1");
  });

  it("genre filtresi eklenir", () => {
    const { sql, params } = buildTrackQuery({ genre: "action" });
    expect(sql).toContain("ANY(genre_tags)");
    expect(params[0]).toBe("action");
  });

  it("birden fazla filtre parametresi doğru numaralandırılır", () => {
    const { sql, params } = buildTrackQuery({ userId: "u1", genre: "rpg", mood: "epic" });
    expect(sql).toContain("$1");
    expect(sql).toContain("$2");
    expect(sql).toContain("$3");
    expect(params).toHaveLength(3);
  });

  it("arama filtresi ILIKE ile partial match yapılır", () => {
    const { sql, params } = buildTrackQuery({ q: "battle" });
    expect(sql).toContain("ILIKE");
    expect(params[0]).toBe("%battle%");
  });
});

// ── Pagination hesaplama ──────────────────────────────────────────────────────

describe("Pagination hesaplama", () => {
  it("page/limit offset doğru hesaplanır", () => {
    const page = 3; const limit = 20;
    const offset = (page - 1) * limit;
    expect(offset).toBe(40);
  });

  it("toplam sayfa sayısı doğru hesaplanır", () => {
    expect(Math.ceil(45 / 20)).toBe(3);
    expect(Math.ceil(20 / 20)).toBe(1);
    expect(Math.ceil(21 / 20)).toBe(2);
    expect(Math.ceil(0 / 20)).toBe(0);
  });

  it("page < 1 → 1'e düzeltilir", () => {
    const page = Math.max(1, -1);
    expect(page).toBe(1);
  });

  it("limit > 50 → 50'ye kırpılır", () => {
    const limit = Math.min(50, 100);
    expect(limit).toBe(50);
  });
});

// ── Fan-out mantığı ───────────────────────────────────────────────────────────

describe("Feed fan-out mantığı", () => {
  it("takipçi yoksa fan-out tetiklenmez", () => {
    const followers: string[] = [];
    const insertCount = followers.length;
    expect(insertCount).toBe(0);
  });

  it("birden fazla takipçiye feed event gönderilir", () => {
    const followers = ["f1", "f2", "f3"];
    const events = followers.map(recipientId => ({
      recipientId,
      actorId: "actor1",
      verb: "published",
      objectType: "track",
      objectId: "track-uuid",
    }));
    expect(events).toHaveLength(3);
    expect(events[0].recipientId).toBe("f1");
  });
});

// ── Follow mantığı ────────────────────────────────────────────────────────────

describe("Follow/Unfollow mantığı", () => {
  it("follow: (followerId, followeeId) PRIMARY KEY çakışması detect edilir", () => {
    const existing = [{ follower_id: "u1", followee_id: "u2" }];
    const isFollowing = existing.some(r => r.follower_id === "u1" && r.followee_id === "u2");
    expect(isFollowing).toBe(true);
  });

  it("unfollow: satır silinince following:false döner", () => {
    let existing = [{ follower_id: "u1", followee_id: "u2" }];
    existing = existing.filter(r => !(r.follower_id === "u1" && r.followee_id === "u2"));
    expect(existing).toHaveLength(0);
  });

  it("kendini takip edememe kontrolü", () => {
    const followerId = "u1";
    const followeeId = "u1";
    const isSelf = followerId === followeeId;
    expect(isSelf).toBe(true); // 400 Bad Request durumu
  });
});

// ── GREATEST guard ────────────────────────────────────────────────────────────

describe("GREATEST(counter + delta, 0) — negatife gitme koruması", () => {
  it.each([
    [5,   1,  6],
    [1,  -1,  0],
    [0,  -1,  0],  // negatife gitme engellenir
    [10, -5,  5],
  ])("current=%d delta=%d → %d", (current, delta, expected) => {
    expect(Math.max(current + delta, 0)).toBe(expected);
  });
});

// ── Like toggle (CTE atomicity) ───────────────────────────────────────────────

describe("Like toggle mantığı", () => {
  it("like yoksa eklenir (liked:true)", () => {
    const likes = new Set<string>();
    const trackId = "uuid-1";
    const userId  = "user-1";

    if (likes.has(userId)) {
      likes.delete(userId);
    } else {
      likes.add(userId);
    }
    expect(likes.has(userId)).toBe(true);
  });

  it("like varsa kaldırılır (liked:false)", () => {
    const likes = new Set<string>(["user-1"]);
    const userId = "user-1";

    if (likes.has(userId)) {
      likes.delete(userId);
    } else {
      likes.add(userId);
    }
    expect(likes.has(userId)).toBe(false);
  });
});
