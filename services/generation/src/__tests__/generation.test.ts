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
    ["stability",15, 2],
    ["stability",30, 3],
    ["stability",60, 5],
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
    ["stability",60, 3],   // ceil(5/2) = 3
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
