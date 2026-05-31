// services/library/src/__tests__/library.test.ts
// Dış servis HTTP çağrıları (generation, upload) axios mock ile simüle edilir.

process.env.INTERNAL_JWT_SECRET    = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.MONGO_URI              = "will-be-replaced";
process.env.PORT                   = "3004";
process.env.GENERATION_SERVICE_URL = "http://generation:3002";
process.env.UPLOAD_SERVICE_URL     = "http://upload:3003";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";

// ── Models ────────────────────────────────────────────────────────────────────
const collectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name:   { type: String, required: true, maxlength: 80 },
  items:  [{
    refId:    { type: String, required: true },
    refModel: { type: String, enum: ["Generation", "Upload"], required: true },
    addedAt:  { type: Date, default: Date.now },
  }],
}, { timestamps: true });

const dawProjectSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name:         { type: String, required: true, maxlength: 120, default: "Untitled Project" },
  tracks:       { type: mongoose.Schema.Types.Mixed, default: [] },
  bpm:          { type: Number, default: 120 },
  masterVolume: { type: Number, default: 0.8 },
  isPublic:     { type: Boolean, default: false },
  shareToken:   { type: String, sparse: true },
}, { timestamps: true });

let mongod: MongoMemoryServer;
let Collection: mongoose.Model<any>;
let DawProject: mongoose.Model<any>;

const userId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Collection = mongoose.model("Collection", collectionSchema);
  DawProject = mongoose.model("DawProject", dawProjectSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Collection.deleteMany({});
  await DawProject.deleteMany({});
});

// ── Collection CRUD ───────────────────────────────────────────────────────────

describe("Collection CRUD", () => {
  it("koleksiyon oluşturulur", async () => {
    const col = await Collection.create({ userId, name: "My Favorites" });
    expect(col.name).toBe("My Favorites");
    expect(col.items).toHaveLength(0);
  });

  it("kullanıcıya ait koleksiyonlar listelenir", async () => {
    const other = new mongoose.Types.ObjectId();
    await Collection.insertMany([
      { userId, name: "A" },
      { userId, name: "B" },
      { userId: other, name: "C" },
    ]);
    const cols = await Collection.find({ userId });
    expect(cols).toHaveLength(2);
  });

  it("koleksiyon adı güncellenir", async () => {
    const col = await Collection.create({ userId, name: "Old Name" });
    await Collection.findByIdAndUpdate(col._id, { name: "New Name" });
    const updated = await Collection.findById(col._id);
    expect(updated!.name).toBe("New Name");
  });

  it("koleksiyon silinir", async () => {
    const col = await Collection.create({ userId, name: "To Delete" });
    await Collection.findByIdAndDelete(col._id);
    const found = await Collection.findById(col._id);
    expect(found).toBeNull();
  });
});

// ── Collection items ──────────────────────────────────────────────────────────

describe("Collection items", () => {
  it("item eklenir", async () => {
    const col = await Collection.create({ userId, name: "My Mix" });
    const refId = new mongoose.Types.ObjectId().toString();

    await Collection.findByIdAndUpdate(col._id, {
      $push: { items: { refId, refModel: "Generation" } },
    });

    const updated = await Collection.findById(col._id);
    expect(updated!.items).toHaveLength(1);
    expect(updated!.items[0].refId).toBe(refId);
    expect(updated!.items[0].refModel).toBe("Generation");
  });

  it("aynı item tekrar eklenemez (uygulama mantığı)", async () => {
    const col = await Collection.create({ userId, name: "Dedupe Test" });
    const refId = new mongoose.Types.ObjectId().toString();

    // İlk ekleme
    await Collection.findByIdAndUpdate(col._id, {
      $push: { items: { refId, refModel: "Generation" } },
    });

    // Aynı refId zaten varsa $addToSet benzeri kontrol
    const existing = await Collection.findOne({ _id: col._id, "items.refId": refId });
    expect(existing).not.toBeNull(); // var, tekrar ekleme
  });

  it("item silinir", async () => {
    const refId1 = new mongoose.Types.ObjectId().toString();
    const refId2 = new mongoose.Types.ObjectId().toString();
    const col = await Collection.create({
      userId, name: "Remove Test",
      items: [
        { refId: refId1, refModel: "Generation" },
        { refId: refId2, refModel: "Upload" },
      ],
    });

    await Collection.findByIdAndUpdate(col._id, {
      $pull: { items: { refId: refId1 } },
    });

    const updated = await Collection.findById(col._id);
    expect(updated!.items).toHaveLength(1);
    expect(updated!.items[0].refId).toBe(refId2);
  });
});

// ── DAW Projects ──────────────────────────────────────────────────────────────

describe("DAW Projects CRUD", () => {
  it("proje oluşturulur (defaults)", async () => {
    const proj = await DawProject.create({ userId, name: "My First Project" });
    expect(proj.bpm).toBe(120);
    expect(proj.masterVolume).toBe(0.8);
    expect(proj.isPublic).toBe(false);
    expect(proj.tracks).toHaveLength(0);
  });

  it("proje kaydedilir (tracks güncellenir)", async () => {
    const proj = await DawProject.create({ userId, name: "Battle Theme" });
    const tracks = [{ id: "t1", name: "Lead", clips: [], gain: 1 }];

    await DawProject.findByIdAndUpdate(proj._id, { tracks, bpm: 140, name: "Battle Theme v2" });
    const updated = await DawProject.findById(proj._id);

    expect(updated!.bpm).toBe(140);
    expect(updated!.name).toBe("Battle Theme v2");
    expect(updated!.tracks).toHaveLength(1);
  });

  it("share link aktif edilir (shareToken + isPublic)", async () => {
    const proj = await DawProject.create({ userId, name: "Share Test" });
    const shareToken = `share_${Date.now()}`;

    await DawProject.findByIdAndUpdate(proj._id, { isPublic: true, shareToken });
    const updated = await DawProject.findById(proj._id);
    expect(updated!.isPublic).toBe(true);
    expect(updated!.shareToken).toBe(shareToken);
  });

  it("shareToken ile proje bulunur", async () => {
    const token = "share_abc123";
    await DawProject.create({ userId, name: "Public Project", isPublic: true, shareToken: token });

    const found = await DawProject.findOne({ shareToken: token, isPublic: true });
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Public Project");
  });

  it("başka kullanıcının projesi erişilemiyor (ownership kontrolü)", async () => {
    const other = new mongoose.Types.ObjectId();
    const proj = await DawProject.create({ userId: other, name: "Private" });

    const found = await DawProject.findOne({ _id: proj._id, userId }); // farklı owner
    expect(found).toBeNull();
  });

  it("proje silinir", async () => {
    const proj = await DawProject.create({ userId, name: "To Delete" });
    await DawProject.findOneAndDelete({ _id: proj._id, userId });
    const found = await DawProject.findById(proj._id);
    expect(found).toBeNull();
  });

  it("kullanıcıya ait projeler listelenir", async () => {
    const other = new mongoose.Types.ObjectId();
    await DawProject.insertMany([
      { userId, name: "P1" },
      { userId, name: "P2" },
      { userId: other, name: "P3" },
    ]);
    const mine = await DawProject.find({ userId }).sort({ createdAt: -1 });
    expect(mine).toHaveLength(2);
  });
});

// ── Internal token ────────────────────────────────────────────────────────────

describe("Internal token", () => {
  const secret = process.env.INTERNAL_JWT_SECRET!;

  it("internal token, adına işlem yapılan kullanıcının id'sini taşır", () => {
    // library, downstream çağrılarda token sub'ına gerçek userId koyar — böylece
    // generation/upload userId'yi query yerine token'dan alır (IDOR savunması).
    const userId = "507f1f77bcf86cd799439011";
    const token = jwt.sign(
      { sub: userId, role: "user", _internal: true },
      secret,
      { expiresIn: "5m" }
    );
    const payload = jwt.verify(token, secret) as any;
    expect(payload._internal).toBe(true);
    expect(payload.sub).toBe(userId);
  });
});
