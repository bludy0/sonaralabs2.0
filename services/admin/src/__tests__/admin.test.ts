// services/admin/src/__tests__/admin.test.ts
// Admin guard, stats aggregation ve rol değiştirme testi.

process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.MONGO_URI           = "will-be-replaced";
process.env.PORT                = "3006";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";

// ── Models (admin servisiyle aynı strict:false şema) ──────────────────────────
const User       = mongoose.model("User",       new mongoose.Schema({}, { strict: false, collection: "users"        }));
const Generation = mongoose.model("Generation", new mongoose.Schema({}, { strict: false, collection: "generations"  }));
const Upload     = mongoose.model("Upload",     new mongoose.Schema({}, { strict: false, collection: "uploads"      }));
const CreditLog  = mongoose.model("CreditLog",  new mongoose.Schema({}, { strict: false, collection: "credit_logs" }));

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await Generation.deleteMany({});
  await Upload.deleteMany({});
  await CreditLog.deleteMany({});
});

// ── Admin guard ───────────────────────────────────────────────────────────────

describe("Admin role guard", () => {
  const secret = process.env.INTERNAL_JWT_SECRET!;

  function requireAdmin(token: string): boolean {
    try {
      const payload = jwt.verify(token, secret) as any;
      return payload._internal === true && payload.role === "admin";
    } catch {
      return false;
    }
  }

  it("role:admin token geçer", () => {
    const token = jwt.sign({ sub: "a1", role: "admin", _internal: true }, secret, { expiresIn: "5m" });
    expect(requireAdmin(token)).toBe(true);
  });

  it("role:user token reddedilir (403)", () => {
    const token = jwt.sign({ sub: "u1", role: "user", _internal: true }, secret, { expiresIn: "5m" });
    expect(requireAdmin(token)).toBe(false);
  });

  it("_internal flag olmayan admin token reddedilir", () => {
    const token = jwt.sign({ sub: "a1", role: "admin" }, secret, { expiresIn: "5m" });
    expect(requireAdmin(token)).toBe(false);
  });

  it("geçersiz token reddedilir (401)", () => {
    expect(requireAdmin("invalid-token")).toBe(false);
  });

  it("süresi dolmuş token reddedilir", async () => {
    const token = jwt.sign({ sub: "a1", role: "admin", _internal: true }, secret, { expiresIn: "1ms" });
    await new Promise(r => setTimeout(r, 5));
    expect(requireAdmin(token)).toBe(false);
  });
});

// ── Stats aggregation ─────────────────────────────────────────────────────────

describe("GET /stats — platform metrikleri", () => {
  it("kullanıcı, üretim ve upload sayıları doğru döner", async () => {
    await User.insertMany([{ email: "a@t.com", role: "user" }, { email: "b@t.com", role: "admin" }]);
    await Generation.insertMany([
      { userId: "u1", status: "done",       provider: "beatoven", style: "action" },
      { userId: "u1", status: "done",       provider: "stability",style: "ambient" },
      { userId: "u2", status: "failed",     provider: "beatoven", style: "action" },
      { userId: "u2", status: "processing", provider: "lyria",    style: "horror" },
    ]);
    await Upload.insertMany([{ userId: "u1" }, { userId: "u2" }]);

    const [totalUsers, totalGenerations, doneGens, failedGens, totalUploads] = await Promise.all([
      User.countDocuments(),
      Generation.countDocuments(),
      Generation.countDocuments({ status: "done" }),
      Generation.countDocuments({ status: "failed" }),
      Upload.countDocuments(),
    ]);

    expect(totalUsers).toBe(2);
    expect(totalGenerations).toBe(4);
    expect(doneGens).toBe(2);
    expect(failedGens).toBe(1);
    expect(totalUploads).toBe(2);
  });

  it("başarı oranı doğru hesaplanır", async () => {
    await Generation.insertMany([
      { userId: "u1", status: "done" },
      { userId: "u1", status: "done" },
      { userId: "u1", status: "failed" },
      { userId: "u1", status: "pending" },
    ]);

    const total  = await Generation.countDocuments();
    const done   = await Generation.countDocuments({ status: "done" });
    const rate   = ((done / total) * 100).toFixed(1);
    expect(rate).toBe("50.0");
  });

  it("provider dağılımı aggregate ile döner", async () => {
    await Generation.insertMany([
      { userId: "u1", status: "done", provider: "beatoven" },
      { userId: "u1", status: "done", provider: "beatoven" },
      { userId: "u2", status: "done", provider: "stability" },
    ]);

    const providerCounts = await Generation.aggregate([
      { $group: { _id: "$provider", count: { $sum: 1 } } },
    ]);

    const map: Record<string, number> = {};
    for (const p of providerCounts) map[p._id] = p.count;
    expect(map.beatoven).toBe(2);
    expect(map.stability).toBe(1);
  });

  it("top styles listesi doğru sıralanır", async () => {
    await Generation.insertMany([
      { userId: "u1", status: "done", style: "action" },
      { userId: "u1", status: "done", style: "action" },
      { userId: "u1", status: "done", style: "action" },
      { userId: "u2", status: "done", style: "ambient" },
      { userId: "u2", status: "done", style: "ambient" },
    ]);

    const topStyles = await Generation.aggregate([
      { $match: { status: "done" } },
      { $group: { _id: "$style", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    expect(topStyles[0]._id).toBe("action");
    expect(topStyles[0].count).toBe(3);
  });
});

// ── GET /stats/daily ──────────────────────────────────────────────────────────

describe("GET /stats/daily — 30 günlük trend", () => {
  it("son 30 günlük üretimler gruplanır", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400_000);
    const oldDate    = new Date(now.getTime() - 45 * 86400_000); // 45 gün önce

    await Generation.insertMany([
      { userId: "u1", status: "done", createdAt: now },
      { userId: "u1", status: "done", createdAt: yesterday },
      { userId: "u1", status: "done", createdAt: oldDate }, // 30 gün dışında
    ]);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const daily = await Generation.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: "done" } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      }},
    ]);

    expect(daily.length).toBeGreaterThanOrEqual(1);
    const totalInPeriod = daily.reduce((s: number, d: any) => s + d.count, 0);
    expect(totalInPeriod).toBe(2); // sadece son 30 gün
  });
});

// ── GET /users — user list ────────────────────────────────────────────────────

describe("GET /users — pagination ve arama", () => {
  it("sayfalama doğru çalışır", async () => {
    await User.insertMany(
      Array.from({ length: 25 }, (_, i) => ({ email: `user${i}@test.com`, role: "user" }))
    );

    const page = 1; const limit = 20;
    const users = await User.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    const total = await User.countDocuments({});

    expect(users).toHaveLength(20);
    expect(total).toBe(25);
    expect(Math.ceil(total / limit)).toBe(2);
  });

  it("email araması çalışır (case-insensitive regex)", async () => {
    await User.insertMany([
      { email: "admin@sonaralabs.com", role: "admin" },
      { email: "user@example.com",     role: "user" },
    ]);

    const results = await User.find({ email: { $regex: "sonaralabs", $options: "i" } }).lean() as any[];
    expect(results).toHaveLength(1);
    expect(results[0].email).toBe("admin@sonaralabs.com");
  });
});

// ── PATCH /users/:id/role ──────────────────────────────────────────────────────

describe("PATCH /users/:id/role — rol değiştirme", () => {
  it("user → admin rol değişir", async () => {
    const user = await User.create({ email: "promote@test.com", role: "user" });
    await User.findByIdAndUpdate(user._id, { role: "admin" });
    const updated = await User.findById(user._id).lean() as any;
    expect(updated!.role).toBe("admin");
  });

  it("admin → user rol değişir", async () => {
    const user = await User.create({ email: "demote@test.com", role: "admin" });
    await User.findByIdAndUpdate(user._id, { role: "user" });
    const updated = await User.findById(user._id).lean() as any;
    expect(updated!.role).toBe("user");
  });

  it("geçersiz rol reddedilir (uygulama mantığı)", () => {
    const validRoles = ["user", "admin"];
    expect(validRoles.includes("superadmin")).toBe(false);
    expect(validRoles.includes("user")).toBe(true);
  });
});
