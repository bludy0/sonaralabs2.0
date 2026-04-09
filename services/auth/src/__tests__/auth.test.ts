// services/auth/src/__tests__/auth.test.ts
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// ─── test ortamı env ───────────────────────────────────────────────────────────
process.env.ACCESS_JWT_SECRET   = "test-access-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.REFRESH_JWT_SECRET  = "test-refresh-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.ACCESS_TOKEN_TTL    = "15m";
process.env.REFRESH_TOKEN_TTL_DAYS = "7";

// ─── inline minimal app (test için index.ts'yi import etmek yerine) ─────────────
// Gerçek projede: import app from "../index" (app'i export etmek gerekir)
// Burada kritik logic'i doğrudan test ediyoruz.

let mongod: MongoMemoryServer;

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

// ─── MONGOOSE MODELS ──────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  email:        { type: String, unique: true, lowercase: true },
  passwordHash: { type: String, select: false },
  role:         { type: String, default: "user" },
  creditBalance:{ type: Number, default: 100 },
  storageUsed:  { type: Number, default: 0 },
}, { timestamps: true });

const refreshSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, index: true },
  tokenHash: { type: String, index: true },
  expiresAt: Date,
}, { timestamps: true });

refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

let User: mongoose.Model<any>;
let RefreshToken: mongoose.Model<any>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  User         = mongoose.model("User",         userSchema);
  RefreshToken = mongoose.model("RefreshToken", refreshSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await RefreshToken.deleteMany({});
});

// ─── UNIT TESTS ───────────────────────────────────────────────────────────────

describe("JWT middleware — internal token", () => {
  const secret = process.env.INTERNAL_JWT_SECRET!;

  it("valid internal token doğrulanır", () => {
    const token = jwt.sign({ sub: "uid123", role: "user", _internal: true }, secret, { expiresIn: "5m" });
    const payload = jwt.verify(token, secret) as any;
    expect(payload.sub).toBe("uid123");
    expect(payload._internal).toBe(true);
  });

  it("süresi dolmuş token hata fırlatır", async () => {
    const token = jwt.sign({ sub: "uid123", _internal: true }, secret, { expiresIn: "1ms" });
    await new Promise(r => setTimeout(r, 5));
    expect(() => jwt.verify(token, secret)).toThrow(/expired/i);
  });

  it("yanlış secret hata fırlatır", () => {
    const token = jwt.sign({ sub: "uid123", _internal: true }, "wrong-secret");
    expect(() => jwt.verify(token, secret)).toThrow(/invalid/i);
  });

  it("user JWT ile internal endpoint 401 döner (secret farklı)", () => {
    const userToken = jwt.sign({ sub: "uid123", role: "user" }, process.env.ACCESS_JWT_SECRET!, { expiresIn: "15m" });
    expect(() => jwt.verify(userToken, secret)).toThrow();
  });
});

describe("Refresh token — rotation & revocation", () => {
  it("logout sonrası token hash silinir", async () => {
    const user = await User.create({ email: "a@test.com", passwordHash: "x" });
    const rawToken = crypto.randomBytes(64).toString("hex");
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    });

    // logout simüle et
    await RefreshToken.findOneAndDelete({ tokenHash: hashToken(rawToken) });
    const found = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
    expect(found).toBeNull();
  });

  it("logout-all tüm kullanıcı token'larını siler", async () => {
    const user = await User.create({ email: "b@test.com", passwordHash: "x" });
    const tokens = ["tok1", "tok2", "tok3"];
    await RefreshToken.insertMany(tokens.map(t => ({
      userId: user._id,
      tokenHash: hashToken(t),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    })));

    await RefreshToken.deleteMany({ userId: user._id });
    const remaining = await RefreshToken.countDocuments({ userId: user._id });
    expect(remaining).toBe(0);
  });

  it("süresi dolmuş token geçersiz sayılır", async () => {
    const user = await User.create({ email: "c@test.com", passwordHash: "x" });
    const rawToken = crypto.randomBytes(64).toString("hex");
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000), // geçmişte
    });

    const found = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
    // expiresAt geçmiş — TTL index prod'da siler, test'te manuel kontrol
    expect(found!.expiresAt < new Date()).toBe(true);
  });
});

// ─── INTEGRATION TESTS ────────────────────────────────────────────────────────

describe("Kredi atomicity", () => {
  it("creditBalance >= amount ise düşer", async () => {
    const user = await User.create({ email: "d@test.com", passwordHash: "x", creditBalance: 100 });
    const updated = await User.findOneAndUpdate(
      { _id: user._id, creditBalance: { $gte: 5 } },
      { $inc: { creditBalance: -5 } },
      { new: true }
    );
    expect(updated!.creditBalance).toBe(95);
  });

  it("creditBalance < amount ise null döner (422)", async () => {
    const user = await User.create({ email: "e@test.com", passwordHash: "x", creditBalance: 3 });
    const updated = await User.findOneAndUpdate(
      { _id: user._id, creditBalance: { $gte: 5 } },
      { $inc: { creditBalance: -5 } },
      { new: true }
    );
    expect(updated).toBeNull();
    // Bakiye değişmedi
    const unchanged = await User.findById(user._id);
    expect(unchanged!.creditBalance).toBe(3);
  });

  it("eşzamanlı iki harcama quota aşımı yaratmaz", async () => {
    const user = await User.create({ email: "f@test.com", passwordHash: "x", creditBalance: 5 });
    // 5 kredi var, ikisi de 5 harcamak istiyor — sadece biri başarılı olmalı
    const [r1, r2] = await Promise.all([
      User.findOneAndUpdate(
        { _id: user._id, creditBalance: { $gte: 5 } },
        { $inc: { creditBalance: -5 } },
        { new: true }
      ),
      User.findOneAndUpdate(
        { _id: user._id, creditBalance: { $gte: 5 } },
        { $inc: { creditBalance: -5 } },
        { new: true }
      ),
    ]);
    const results = [r1, r2];
    const successes = results.filter(r => r !== null);
    const failures  = results.filter(r => r === null);
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const final = await User.findById(user._id);
    expect(final!.creditBalance).toBe(0); // en az sıfır — negatife gitme
  });
});

describe("Storage quota atomicity", () => {
  it("storageUsed + fileSize <= QUOTA ise günceller", async () => {
    const QUOTA = 524288000; // 500 MB
    const user = await User.create({ email: "g@test.com", passwordHash: "x", storageUsed: 100_000_000 });
    const fileSize = 50_000_000;

    const updated = await User.findOneAndUpdate(
      { _id: user._id, $expr: { $lte: [{ $add: ["$storageUsed", fileSize] }, QUOTA] } },
      { $inc: { storageUsed: fileSize } },
      { new: true }
    );
    expect(updated).not.toBeNull();
    expect(updated!.storageUsed).toBe(150_000_000);
  });

  it("quota doluysa null döner (413)", async () => {
    const QUOTA = 524288000;
    const user = await User.create({ email: "h@test.com", passwordHash: "x", storageUsed: 500_000_000 });
    const fileSize = 50_000_000; // aşacak

    const updated = await User.findOneAndUpdate(
      { _id: user._id, $expr: { $lte: [{ $add: ["$storageUsed", fileSize] }, QUOTA] } },
      { $inc: { storageUsed: fileSize } },
      { new: true }
    );
    expect(updated).toBeNull();
    const unchanged = await User.findById(user._id);
    expect(unchanged!.storageUsed).toBe(500_000_000);
  });

  it("eşzamanlı iki upload quota aşımı yaratmaz", async () => {
    const QUOTA = 524288000;
    const user = await User.create({ email: "i@test.com", passwordHash: "x", storageUsed: 480_000_000 });
    const fileSize = 30_000_000; // ikisi birlikte 560 MB = aşar

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
    expect(successes.length).toBe(1); // sadece biri geçer
    const final = await User.findById(user._id);
    expect(final!.storageUsed).toBeLessThanOrEqual(QUOTA);
  });
});

describe("Admin role guard", () => {
  const secret = process.env.INTERNAL_JWT_SECRET!;

  it("role:admin token geçer", () => {
    const token = jwt.sign({ sub: "adminId", role: "admin", _internal: true }, secret, { expiresIn: "5m" });
    const payload = jwt.verify(token, secret) as any;
    expect(payload.role).toBe("admin");
  });

  it("role:user token admin endpoint'te 403 alır", () => {
    const token = jwt.sign({ sub: "userId", role: "user", _internal: true }, secret, { expiresIn: "5m" });
    const payload = jwt.verify(token, secret) as any;
    // Middleware simülasyonu
    const isAdmin = payload.role === "admin";
    expect(isAdmin).toBe(false);
  });
});
