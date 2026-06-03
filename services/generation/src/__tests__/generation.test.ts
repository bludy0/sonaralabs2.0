// services/generation/src/__tests__/generation.test.ts
// BullMQ, Redis ve dış AI provider'ları mock'lanır.
// Gerçek test: kredi maliyet hesabı, provider seçimi, retry yarı-kredi, image validation.

process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.MONGO_URI            = "will-be-replaced";
process.env.REDIS_URL            = "redis://localhost:6379"; // mock ile geçersiz kılınır
process.env.PORT                 = "3002";

import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// ── BullMQ ve Redis mock ───────────────────────────────────────────────────────
jest.mock("bullmq", () => ({
  Queue:  jest.fn().mockImplementation(() => ({ add: jest.fn().mockResolvedValue({ id: "job-mock-id" }) })),
  Worker: jest.fn().mockImplementation(() => ({})),
  Job:    jest.fn(),
}));

jest.mock("redis", () => ({
  createClient: jest.fn().mockReturnValue({
    connect:    jest.fn().mockResolvedValue(undefined),
    on:         jest.fn(),
    isOpen:     true,
  }),
}));

import { getMusicCreditCost, getSFXCreditCost } from "@sonaralabs/types";
import type { MusicProvider, SFXProvider } from "@sonaralabs/types";
import { buildGameMusicPrompt } from "../providers/stableaudio";

// ── Image validation helpers (index.ts'den) ───────────────────────────────────
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES          = 10 * 1024 * 1024;
const MAX_IMAGE_BASE64_LENGTH  = Math.ceil(MAX_IMAGE_BYTES * 4 / 3);

function validateImage(mimeType: string, base64Length: number): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) return "Unsupported image type";
  if (base64Length > MAX_IMAGE_BASE64_LENGTH)        return "Image too large (max 10 MB)";
  return null;
}

// ── DB setup ──────────────────────────────────────────────────────────────────
const generationSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, required: true },
  type:       { type: String, default: "music" },
  prompt:     String,
  provider:   String,
  status:     { type: String, default: "pending" },
  audioUrl:   String,
  duration:   Number,
  creditCost: Number,
  style:      String,
  jobId:      String,
  failReason: String,
}, { timestamps: true });

let mongod: MongoMemoryServer;
let Generation: mongoose.Model<any>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Generation = mongoose.model("Generation", generationSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Generation.deleteMany({});
});

// ── Kredi maliyet testleri ────────────────────────────────────────────────────

describe("getMusicCreditCost — normal üretim", () => {
  it.each([
    ["beatoven", 15, 3],
    ["beatoven", 30, 5],
    ["beatoven", 60, 8],
    ["lyria",    15, 2],
    ["lyria",    30, 3],
    ["lyria",    60, 5],
    ["sonauto",  15, 5],   // sonauto flat 5 (her süre)
    ["sonauto",  30, 5],
    ["sonauto",  60, 5],
  ] as [MusicProvider, number, number][])(
    "%s %ds → %d kredi",
    (provider, duration, expected) => {
      expect(getMusicCreditCost(provider, duration)).toBe(expected);
    }
  );

  it("tanımsız duration için 5 kredi döner (fallback)", () => {
    expect(getMusicCreditCost("beatoven", 45)).toBe(5);
  });
});

describe("getMusicCreditCost — retry (yarı fiyat, Math.ceil)", () => {
  it.each([
    ["beatoven", 15, 2],   // ceil(3/2) = 2
    ["beatoven", 30, 3],   // ceil(5/2) = 3
    ["beatoven", 60, 4],   // ceil(8/2) = 4
    ["lyria",    15, 1],   // ceil(2/2) = 1
    ["lyria",    30, 2],   // ceil(3/2) = 2
    ["sonauto",  60, 3],   // ceil(5/2) = 3
  ] as [MusicProvider, number, number][])(
    "retry %s %ds → %d kredi",
    (provider, duration, expected) => {
      expect(getMusicCreditCost(provider, duration, true)).toBe(expected);
    }
  );
});

describe("getSFXCreditCost", () => {
  it("ElevenLabs SFX her zaman 1 kredi", () => {
    expect(getSFXCreditCost("elevenlabs")).toBe(1);
  });
});

// ── Image validation ──────────────────────────────────────────────────────────

describe("validateImage", () => {
  it("geçerli PNG formatı kabul edilir", () => {
    expect(validateImage("image/png", 1000)).toBeNull();
  });

  it("geçerli JPEG formatı kabul edilir", () => {
    expect(validateImage("image/jpeg", 1000)).toBeNull();
  });

  it("geçerli WEBP formatı kabul edilir", () => {
    expect(validateImage("image/webp", 1000)).toBeNull();
  });

  it("GIF formatı reddedilir", () => {
    expect(validateImage("image/gif", 1000)).toMatch(/unsupported/i);
  });

  it("PDF formatı reddedilir", () => {
    expect(validateImage("application/pdf", 1000)).toMatch(/unsupported/i);
  });

  it("10 MB sınırında base64 kabul edilir", () => {
    expect(validateImage("image/png", MAX_IMAGE_BASE64_LENGTH)).toBeNull();
  });

  it("10 MB sınırını aşan base64 reddedilir", () => {
    expect(validateImage("image/png", MAX_IMAGE_BASE64_LENGTH + 1)).toMatch(/large/i);
  });
});

// ── Generation DB operasyonları ───────────────────────────────────────────────

describe("Generation document lifecycle", () => {
  const userId = new mongoose.Types.ObjectId();

  it("pending durumunda oluşturulur", async () => {
    const gen = await Generation.create({
      userId, prompt: "epic battle music", provider: "beatoven",
      duration: 30, creditCost: 5, status: "pending", type: "music",
    });
    expect(gen.status).toBe("pending");
    expect(gen.creditCost).toBe(5);
  });

  it("done durumuna geçince audioUrl eklenir", async () => {
    const gen = await Generation.create({
      userId, prompt: "calm forest", provider: "stability",
      duration: 15, creditCost: 2, status: "pending", type: "music",
    });

    await Generation.findByIdAndUpdate(gen._id, {
      status: "done", audioUrl: "https://storage.example.com/track.wav",
    });

    const updated = await Generation.findById(gen._id);
    expect(updated!.status).toBe("done");
    expect(updated!.audioUrl).toBe("https://storage.example.com/track.wav");
  });

  it("failed durumuna geçince failReason kaydedilir", async () => {
    const gen = await Generation.create({
      userId, prompt: "test", provider: "beatoven",
      duration: 30, creditCost: 5, status: "processing", type: "music",
    });

    await Generation.findByIdAndUpdate(gen._id, {
      status: "failed", failReason: "Provider timeout",
    });

    const updated = await Generation.findById(gen._id);
    expect(updated!.status).toBe("failed");
    expect(updated!.failReason).toBe("Provider timeout");
  });

  it("history endpoint için userId + createdAt index ile sorgu çalışır", async () => {
    await Generation.insertMany([
      { userId, prompt: "p1", provider: "beatoven", duration: 15, creditCost: 3, status: "done", type: "music" },
      { userId, prompt: "p2", provider: "stability", duration: 30, creditCost: 3, status: "pending", type: "music" },
      { userId: new mongoose.Types.ObjectId(), prompt: "other", provider: "beatoven", duration: 15, creditCost: 3, status: "done", type: "music" },
    ]);

    const myItems = await Generation.find({ userId }).sort({ createdAt: -1 });
    expect(myItems).toHaveLength(2);
    expect(myItems.every(i => String(i.userId) === String(userId))).toBe(true);
  });
});

// ── GET /stats aggregation mantığı ────────────────────────────────────────────
// index.ts'deki /stats endpoint'i bu aggregate pipeline'larını kullanır.
// HTTP katmanı yerine pipeline'ları doğrudan model üzerinde doğrularız.

describe("GET /stats aggregations", () => {
  const userId = new mongoose.Types.ObjectId();
  const other  = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    await Generation.insertMany([
      { userId, provider: "beatoven", status: "done",   type: "music", duration: 30, creditCost: 5, style: "epic"  },
      { userId, provider: "beatoven", status: "done",   type: "music", duration: 15, creditCost: 3, style: "epic"  },
      { userId, provider: "sonauto",  status: "failed",  type: "music", duration: 30, creditCost: 5, style: "calm"  },
      { userId, provider: "sonauto",  status: "done",    type: "sfx",   duration: 0,  creditCost: 1, style: "calm"  },
      // başka kullanıcının kaydı — sonuçlara karışmamalı
      { userId: other, provider: "beatoven", status: "done", type: "music", duration: 60, creditCost: 8, style: "epic" },
    ]);
  });

  it("byStatus / byProvider yalnızca o kullanıcıyı sayar", async () => {
    const uid = userId;
    const [byStatus, byProvider] = await Promise.all([
      Generation.aggregate([{ $match: { userId: uid } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Generation.aggregate([{ $match: { userId: uid, provider: { $ne: null } } }, { $group: { _id: "$provider", count: { $sum: 1 } } }]),
    ]);
    const toMap = (rows: any[]) => rows.reduce((a, r) => (a[r._id] = r.count, a), {} as Record<string, number>);
    expect(toMap(byStatus)).toEqual({ done: 3, failed: 1 });
    expect(toMap(byProvider)).toEqual({ beatoven: 2, sonauto: 2 });
  });

  it("topStyles done üretimleri sayar, çoktan aza sıralar", async () => {
    const topStyles = await Generation.aggregate([
      { $match: { userId, status: "done", style: { $ne: null } } },
      { $group: { _id: "$style", count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 8 },
    ]);
    expect(topStyles[0]).toMatchObject({ _id: "epic", count: 2 });
    expect(topStyles.find(s => s._id === "calm")).toMatchObject({ count: 1 });
  });

  it("totals: harcanan kredi ve toplam süre ($ifNull ile null-safe)", async () => {
    const totals = await Generation.aggregate([
      { $match: { userId } },
      { $group: { _id: null,
        creditsSpent:  { $sum: { $ifNull: ["$creditCost", 0] } },
        totalDuration: { $sum: { $ifNull: ["$duration", 0] } },
      } },
    ]);
    expect(totals[0].creditsSpent).toBe(5 + 3 + 5 + 1);   // 14
    expect(totals[0].totalDuration).toBe(30 + 15 + 30 + 0); // 75
  });
});

// ── Internal endpoint scope (IDOR sertleştirmesi) ─────────────────────────────
// Internal endpoint'ler userId'yi token sub'ından alır; bir kullanıcının kaydı
// başka userId ile sorgulandığında bulunamaz (yatay yetki yükseltme engellenir).

describe("internal endpoint userId scoping", () => {
  it("başka kullanıcının üretimi token sub ile bulunamaz", async () => {
    const owner   = new mongoose.Types.ObjectId();
    const attacker = new mongoose.Types.ObjectId();
    const gen = await Generation.create({
      userId: owner, provider: "beatoven", status: "done", type: "music", duration: 30, creditCost: 5,
    });
    // token sub = attacker → owner'ın kaydına erişemez
    expect(await Generation.findOne({ _id: gen._id, userId: attacker })).toBeNull();
    // token sub = owner → erişebilir
    expect(await Generation.findOne({ _id: gen._id, userId: owner })).not.toBeNull();
  });
});

// ── Internal JWT ──────────────────────────────────────────────────────────────

describe("makeInternalToken", () => {
  const secret = process.env.INTERNAL_JWT_SECRET!;

  it("internal token üretilir ve doğrulanır", () => {
    const token = jwt.sign(
      { sub: "generation-service", role: "user", _internal: true },
      secret,
      { expiresIn: "5m" }
    );
    const payload = jwt.verify(token, secret) as any;
    expect(payload._internal).toBe(true);
    expect(payload.sub).toBe("generation-service");
  });
});

// ── Stable Audio: oyun müziği prompt optimizasyonu ─────────────────────────────
describe("buildGameMusicPrompt", () => {
  it("kullanıcı promptu + tür + mood + oyun çerçevesini birleştirir", () => {
    const p = buildGameMusicPrompt("dungeon crawl", "chiptune", "heroic");
    expect(p).toContain("dungeon crawl");
    expect(p.toLowerCase()).toContain("chiptune");        // tür betimlemesi
    expect(p.toLowerCase()).toContain("heroic");          // mood betimlemesi
    expect(p).toContain("video game soundtrack");         // oyun çerçevesi (suffix)
    expect(p).toContain("seamless loop");
  });

  it("promptta zaten geçen tür kelimesini tekrarlamaz", () => {
    const p = buildGameMusicPrompt("ambient soft pads", "ambient", "calm");
    const ambientCount = (p.toLowerCase().match(/ambient/g) || []).length;
    expect(ambientCount).toBe(1);                         // tür betimlemesi eklenmedi
  });

  it("bilinmeyen tür/mood ile çökmeden prompt + suffix döner", () => {
    const p = buildGameMusicPrompt("test track", "no-such-style", "no-such-mood");
    expect(p).toContain("test track");
    expect(p).toContain("video game soundtrack");
  });

  it("çıktıyı 500 karaktere kısaltır", () => {
    const p = buildGameMusicPrompt("a".repeat(900), "orchestral", "epic");
    expect(p.length).toBeLessThanOrEqual(500);
  });
});

// ── Export: format haritası + SSRF guard (index.ts mantığının kopyası) ─────────
const EXPORT_FORMATS: Record<string, { ext: string }> = {
  wav: { ext: "wav" }, mp3: { ext: "mp3" }, ogg: { ext: "ogg" }, flac: { ext: "flac" }, aac: { ext: "m4a" },
};
function isOwnAudioUrl(u: string, base: string, bucket: string): boolean {
  try {
    const url = new URL(u);
    const b   = new URL(base);
    return url.host === b.host && url.pathname.startsWith(`/${bucket}/`);
  } catch { return false; }
}

describe("export format haritası", () => {
  it("wav/mp3/ogg/flac/aac desteklenir, bilinmeyen reddedilir", () => {
    for (const f of ["wav", "mp3", "ogg", "flac", "aac"]) expect(EXPORT_FORMATS[f]).toBeDefined();
    expect(EXPORT_FORMATS["exe"]).toBeUndefined();
    expect(EXPORT_FORMATS["wav"].ext).toBe("wav");
    expect(EXPORT_FORMATS["aac"].ext).toBe("m4a");
  });
});

describe("export SSRF guard (isOwnAudioUrl)", () => {
  const base = "http://localhost:9000";
  const bucket = "sonaralabs-audio";

  it("kendi MinIO bucket URL'sini kabul eder", () => {
    expect(isOwnAudioUrl("http://localhost:9000/sonaralabs-audio/music/x.wav", base, bucket)).toBe(true);
  });
  it("yabancı host'u reddeder", () => {
    expect(isOwnAudioUrl("http://evil.example.com/sonaralabs-audio/x.wav", base, bucket)).toBe(false);
  });
  it("farklı bucket'ı reddeder", () => {
    expect(isOwnAudioUrl("http://localhost:9000/secret-bucket/x.wav", base, bucket)).toBe(false);
  });
  it("geçersiz URL'i reddeder", () => {
    expect(isOwnAudioUrl("not-a-url", base, bucket)).toBe(false);
  });
});

// ── ZeroGPU kota hata tespiti (providerErrorMessage mantığı) ───────────────────
function isQuotaError(msg: string): boolean {
  return /quota|zerogpu/i.test(msg);
}
describe("ZeroGPU kota hatası tespiti", () => {
  it("kota aşımı mesajını tanır", () => {
    expect(isQuotaError('StableAudio: space error {"error": "You have exceeded your free ZeroGPU quota (60s requested vs. 0s left)"}')).toBe(true);
  });
  it("normal sağlayıcı hatasını kota saymaz", () => {
    expect(isQuotaError("StableAudio: submit failed (HTTP 502)")).toBe(false);
  });
});
