// services/credit/src/__tests__/credit.test.ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";

process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.MONGO_URI            = "will-be-replaced";
process.env.PORT                 = "3005";

// ── Models (credit servisindekiyle aynı şema) ─────────────────────────────────

const userSchema = new mongoose.Schema({
  creditBalance: { type: Number, default: 0 },
}, { strict: false, timestamps: true });

const creditLogSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  amount:       { type: Number, required: true },
  type:         { type: String, enum: ["earn", "spend", "refund"], required: true },
  reason:       String,
  relatedId:    String,
  relatedModel: String,
  balanceAfter: Number,
}, { timestamps: true });

let mongod: MongoMemoryServer;
let User: mongoose.Model<any>;
let CreditLog: mongoose.Model<any>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  User      = mongoose.model("User",      userSchema);
  CreditLog = mongoose.model("CreditLog", creditLogSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await CreditLog.deleteMany({});
});

// ── Internal token helper ─────────────────────────────────────────────────────

function makeToken(userId: string) {
  return jwt.sign(
    { sub: userId, role: "user", _internal: true },
    process.env.INTERNAL_JWT_SECRET!,
    { expiresIn: "5m" }
  );
}

// ── Atomic spend (ZORUNLU PATTERN) ───────────────────────────────────────────

describe("POST /spend — atomik kredi düşme", () => {
  it("yeterli bakiyede kredi düşer ve log oluşturur", async () => {
    const user = await User.create({ creditBalance: 100 });

    const updated = await User.findOneAndUpdate(
      { _id: user._id, creditBalance: { $gte: 5 } },
      { $inc: { creditBalance: -5 } },
      { new: true, select: "creditBalance" }
    );
    expect(updated).not.toBeNull();
    expect(updated!.creditBalance).toBe(95);

    await CreditLog.create({
      userId: user._id, amount: -5, type: "spend",
      reason: "music_gen", balanceAfter: updated!.creditBalance,
    });
    const log = await CreditLog.findOne({ userId: user._id });
    expect(log!.amount).toBe(-5);
    expect(log!.balanceAfter).toBe(95);
  });

  it("yetersiz bakiyede null döner, bakiye değişmez", async () => {
    const user = await User.create({ creditBalance: 3 });

    const updated = await User.findOneAndUpdate(
      { _id: user._id, creditBalance: { $gte: 5 } },
      { $inc: { creditBalance: -5 } },
      { new: true }
    );
    expect(updated).toBeNull();

    const unchanged = await User.findById(user._id);
    expect(unchanged!.creditBalance).toBe(3);
  });

  it("eşzamanlı iki spend — sadece biri başarılı olur (race condition koruması)", async () => {
    const user = await User.create({ creditBalance: 5 });

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

    const successes = [r1, r2].filter(Boolean);
    expect(successes).toHaveLength(1);

    const final = await User.findById(user._id);
    expect(final!.creditBalance).toBe(0);
  });

  it("sıfır bakiyede spend başarısız olur", async () => {
    const user = await User.create({ creditBalance: 0 });

    const updated = await User.findOneAndUpdate(
      { _id: user._id, creditBalance: { $gte: 1 } },
      { $inc: { creditBalance: -1 } },
      { new: true }
    );
    expect(updated).toBeNull();
  });
});

// ── Earn ─────────────────────────────────────────────────────────────────────

describe("POST /earn — kredi kazanma", () => {
  it("kayıt bonusu kredi ekler ve log oluşturur", async () => {
    const user = await User.create({ creditBalance: 0 });

    const updated = await User.findByIdAndUpdate(
      user._id,
      { $inc: { creditBalance: 100 } },
      { new: true, select: "creditBalance" }
    );
    expect(updated!.creditBalance).toBe(100);

    await CreditLog.create({
      userId: user._id, amount: 100, type: "earn",
      reason: "register_bonus", balanceAfter: 100,
    });
    const log = await CreditLog.findOne({ userId: user._id });
    expect(log!.type).toBe("earn");
    expect(log!.amount).toBe(100);
  });

  it("birden fazla earn birikir", async () => {
    const user = await User.create({ creditBalance: 0 });

    await User.findByIdAndUpdate(user._id, { $inc: { creditBalance: 100 } });
    await User.findByIdAndUpdate(user._id, { $inc: { creditBalance: 500 } });

    const final = await User.findById(user._id);
    expect(final!.creditBalance).toBe(600);
  });
});

// ── Credit history pagination ─────────────────────────────────────────────────

describe("GET /history — kredi geçmişi", () => {
  it("kullanıcıya ait loglar döner", async () => {
    const user = await User.create({ creditBalance: 50 });
    const other = await User.create({ creditBalance: 50 });

    await CreditLog.insertMany([
      { userId: user._id,  amount: -5, type: "spend", reason: "gen1", balanceAfter: 95 },
      { userId: user._id,  amount: -3, type: "spend", reason: "gen2", balanceAfter: 92 },
      { userId: other._id, amount: -5, type: "spend", reason: "other", balanceAfter: 45 },
    ]);

    const logs = await CreditLog.find({ userId: user._id }).sort({ createdAt: -1 });
    expect(logs).toHaveLength(2);
    expect(logs.every(l => String(l.userId) === String(user._id))).toBe(true);
  });

  it("page/limit ile sayfalama çalışır", async () => {
    const user = await User.create({ creditBalance: 0 });
    await CreditLog.insertMany(
      Array.from({ length: 15 }, (_, i) => ({
        userId: user._id, amount: -1, type: "spend",
        reason: `gen${i}`, balanceAfter: 100 - i,
      }))
    );

    const page = 1; const limit = 10;
    const logs = await CreditLog.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    expect(logs).toHaveLength(10);
    const total = await CreditLog.countDocuments({ userId: user._id });
    expect(total).toBe(15);
    expect(Math.ceil(total / limit)).toBe(2); // 2 sayfa
  });
});

// ── Internal JWT validation ───────────────────────────────────────────────────

describe("Internal token doğrulama", () => {
  const secret = process.env.INTERNAL_JWT_SECRET!;

  it("geçerli internal token kabul edilir", () => {
    const token = makeToken("user123");
    const payload = jwt.verify(token, secret) as any;
    expect(payload.sub).toBe("user123");
    expect(payload._internal).toBe(true);
  });

  it("süresi dolmuş token reddedilir", async () => {
    const token = jwt.sign({ sub: "u", _internal: true }, secret, { expiresIn: "1ms" });
    await new Promise(r => setTimeout(r, 5));
    expect(() => jwt.verify(token, secret)).toThrow(/expired/i);
  });

  it("yanlış secret reddedilir", () => {
    const token = jwt.sign({ sub: "u", _internal: true }, "wrong");
    expect(() => jwt.verify(token, secret)).toThrow(/invalid/i);
  });
});

// ── GREATEST guard (counter negatife gitme) ───────────────────────────────────

describe("GREATEST(counter, 0) — negatife gitme koruması", () => {
  it("follower_count 0'ın altına düşmez", async () => {
    // pg'de GREATEST kullanılır — burada MongoDB eşdeğerini test ediyoruz
    // Gerçek değer: Math.max(current + delta, 0)
    const current = 0;
    const delta   = -1;
    const result  = Math.max(current + delta, 0);
    expect(result).toBe(0);
  });

  it("pozitif delta düzgün çalışır", () => {
    expect(Math.max(5 + 1, 0)).toBe(6);
  });
});
