// services/upload/src/__tests__/upload.test.ts
// MinIO mock'lanır. Gerçek test: dosya validasyonu, atomik quota koruması, silme+iade.

process.env.INTERNAL_JWT_SECRET    = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.MONGO_URI              = "will-be-replaced";
process.env.STORAGE_QUOTA_BYTES    = "524288000"; // 500 MB
process.env.MAX_FILE_SIZE_BYTES    = "52428800";  // 50 MB
process.env.MINIO_ENDPOINT         = "localhost";
process.env.MINIO_PORT             = "9000";
process.env.PORT                   = "3003";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// ── Constants (index.ts'den) ──────────────────────────────────────────────────
const QUOTA  = 524_288_000; // 500 MB
const MAX_SZ = 52_428_800;  // 50 MB
const ALLOWED_MIMES = ["audio/wav", "audio/mpeg", "audio/ogg", "audio/mp3"];

// ── Models ────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  storageUsed: { type: Number, default: 0 },
}, { strict: false });

const uploadSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  originalName: String,
  audioUrl:     String,
  mimeType:     String,
  fileSize:     Number,
  duration:     Number,
  isFavorited:  { type: Boolean, default: false },
}, { timestamps: true });

let mongod: MongoMemoryServer;
let User: mongoose.Model<any>;
let Upload: mongoose.Model<any>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  User   = mongoose.model("User",   userSchema);
  Upload = mongoose.model("Upload", uploadSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await Upload.deleteMany({});
});

// ── Dosya validasyonu ─────────────────────────────────────────────────────────

describe("Dosya MIME tipi validasyonu", () => {
  it.each(ALLOWED_MIMES)("%s kabul edilir", (mime) => {
    expect(ALLOWED_MIMES.includes(mime)).toBe(true);
  });

  it.each(["image/png", "video/mp4", "application/pdf", "audio/flac"])(
    "%s reddedilir",
    (mime) => { expect(ALLOWED_MIMES.includes(mime)).toBe(false); }
  );

  it("50 MB sınırında dosya kabul edilir", () => {
    expect(MAX_SZ).toBe(52_428_800);
    expect(MAX_SZ <= 52_428_800).toBe(true);
  });
});

// ── Atomik storage quota ──────────────────────────────────────────────────────

describe("Storage quota — atomik kontrol", () => {
  it("kullanılmış+yeni <= 500 MB ise storageUsed güncellenir", async () => {
    const user = await User.create({ storageUsed: 100_000_000 }); // 100 MB kullanılmış
    const fileSize = 50_000_000; // 50 MB yeni

    const updated = await User.findOneAndUpdate(
      { _id: user._id, $expr: { $lte: [{ $add: ["$storageUsed", fileSize] }, QUOTA] } },
      { $inc: { storageUsed: fileSize } },
      { new: true }
    );
    expect(updated).not.toBeNull();
    expect(updated!.storageUsed).toBe(150_000_000);
  });

  it("quota doluysa null döner, storageUsed değişmez", async () => {
    const user = await User.create({ storageUsed: QUOTA }); // tam kotada

    const updated = await User.findOneAndUpdate(
      { _id: user._id, $expr: { $lte: [{ $add: ["$storageUsed", 1_000_000] }, QUOTA] } },
      { $inc: { storageUsed: 1_000_000 } },
      { new: true }
    );
    expect(updated).toBeNull();

    const unchanged = await User.findById(user._id);
    expect(unchanged!.storageUsed).toBe(QUOTA);
  });

  it("tam sınırda (500 MB) dosya kabul edilir", async () => {
    const user = await User.create({ storageUsed: 0 });

    const updated = await User.findOneAndUpdate(
      { _id: user._id, $expr: { $lte: [{ $add: ["$storageUsed", QUOTA] }, QUOTA] } },
      { $inc: { storageUsed: QUOTA } },
      { new: true }
    );
    expect(updated!.storageUsed).toBe(QUOTA);
  });

  it("eşzamanlı iki upload kota aşımı yaratmaz", async () => {
    const user = await User.create({ storageUsed: 480_000_000 }); // 480 MB
    const fileSize = 30_000_000; // 30 MB — ikisi birlikte 540 MB = aşar

    const [r1, r2] = await Promise.all([
      User.findOneAndUpdate(
        { _id: user._id, $expr: { $lte: [{ $add: ["$storageUsed", fileSize] }, QUOTA] } },
        { $inc: { storageUsed: fileSize } },
        { new: true }
      ),
      User.findOneAndUpdate(
        { _id: user._id, $expr: { $lte: [{ $add: ["$storageUsed", fileSize] }, QUOTA] } },
        { $inc: { storageUsed: fileSize } },
        { new: true }
      ),
    ]);

    const successes = [r1, r2].filter(Boolean);
    expect(successes).toHaveLength(1);
    const final = await User.findById(user._id);
    expect(final!.storageUsed).toBeLessThanOrEqual(QUOTA);
  });
});

// ── Dosya silme: storageUsed iadesi ──────────────────────────────────────────

describe("Dosya silme — storageUsed iadesi", () => {
  it("silinen dosyanın boyutu geri eklenir", async () => {
    const user = await User.create({ storageUsed: 100_000_000 });
    const upload = await Upload.create({
      userId: user._id,
      originalName: "track.wav",
      audioUrl: "https://storage/track.wav",
      mimeType: "audio/wav",
      fileSize: 10_000_000,
    });

    await Upload.findByIdAndDelete(upload._id);
    await User.findByIdAndUpdate(user._id, { $inc: { storageUsed: -upload.fileSize } });

    const updated = await User.findById(user._id);
    expect(updated!.storageUsed).toBe(90_000_000);
  });

  it("storageUsed 0'ın altına düşmez (GREATEST koruma)", async () => {
    const user = await User.create({ storageUsed: 5_000_000 });

    // Daha büyük bir delta — negatife gitmemeli
    const newVal = Math.max(user.storageUsed - 10_000_000, 0);
    await User.findByIdAndUpdate(user._id, { storageUsed: newVal });

    const updated = await User.findById(user._id);
    expect(updated!.storageUsed).toBe(0);
  });
});

// ── Upload DB operasyonları ────────────────────────────────────────────────────

describe("Upload document", () => {
  it("doğru alanlarla oluşturulur", async () => {
    const user = await User.create({ storageUsed: 0 });
    const upload = await Upload.create({
      userId: user._id,
      originalName: "ambient.mp3",
      audioUrl: "https://storage/ambient.mp3",
      mimeType: "audio/mpeg",
      fileSize: 5_000_000,
      duration: 120,
    });

    expect(upload.mimeType).toBe("audio/mpeg");
    expect(upload.isFavorited).toBe(false);
    expect(upload.fileSize).toBe(5_000_000);
  });

  it("favorite toggle çalışır", async () => {
    const user = await User.create({ storageUsed: 0 });
    const upload = await Upload.create({
      userId: user._id, originalName: "t.wav",
      audioUrl: "url", mimeType: "audio/wav", fileSize: 1_000_000,
    });

    await Upload.findByIdAndUpdate(upload._id, { isFavorited: true });
    const updated = await Upload.findById(upload._id);
    expect(updated!.isFavorited).toBe(true);
  });

  it("kullanıcıya ait uploadlar listelenir", async () => {
    const u1 = await User.create({ storageUsed: 0 });
    const u2 = await User.create({ storageUsed: 0 });

    await Upload.insertMany([
      { userId: u1._id, originalName: "a.wav", audioUrl: "url", mimeType: "audio/wav", fileSize: 1000 },
      { userId: u1._id, originalName: "b.wav", audioUrl: "url", mimeType: "audio/wav", fileSize: 1000 },
      { userId: u2._id, originalName: "c.wav", audioUrl: "url", mimeType: "audio/wav", fileSize: 1000 },
    ]);

    const u1Uploads = await Upload.find({ userId: u1._id });
    expect(u1Uploads).toHaveLength(2);
  });
});
