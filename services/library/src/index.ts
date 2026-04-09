// services/library/src/index.ts
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import axios from "axios";
import { InternalJwtPayload, ApiResponse } from "@sonaralabs/types";

const app = express();
app.use(express.json());

const {
  PORT = "3004",
  MONGO_URI,
  INTERNAL_JWT_SECRET,
  GENERATION_SERVICE_URL = "http://generation:3002",
  UPLOAD_SERVICE_URL     = "http://upload:3003",
} = process.env;

if (!MONGO_URI || !INTERNAL_JWT_SECRET) { process.exit(1); }

// ── MODELS ────────────────────────────────────────────────────────────────────
const collectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name:   { type: String, required: true, maxlength: 80 },
  items:  [{
    refId:    { type: String, required: true },
    refModel: { type: String, enum: ["Generation", "Upload"], required: true },
    addedAt:  { type: Date, default: Date.now },
  }],
}, { timestamps: true });

const Collection = mongoose.model("Collection", collectionSchema);

// favorites "Generation" ve "Upload" modellerinde isFavorited flag ile tutulur.
// Library servisi bu verilere internal HTTP ile erişir.

// ── AUTH ──────────────────────────────────────────────────────────────────────
function getPayload(req: express.Request): InternalJwtPayload {
  const token = req.headers["x-internal-token"] as string;
  if (!token) throw new Error("No token");
  return jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
}

function internalToken(): string {
  return jwt.sign(
    { sub: "library-service", role: "user", _internal: true },
    INTERNAL_JWT_SECRET!,
    { expiresIn: "5m" }
  );
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// GET / — birleşik kütüphane listesi (generations + uploads)
app.get("/", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const headers = { "x-internal-token": internalToken() };
    const page  = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const favOnly = req.query.favorites === "true";

    // limit=200: tüm itemlar in-memory çekilip sayfalanır (her servis max 200)
    const [genRes, upRes] = await Promise.allSettled([
      axios.get(`${GENERATION_SERVICE_URL}/internal/generations?userId=${userId}&limit=200`, { headers }),
      axios.get(`${UPLOAD_SERVICE_URL}/internal/uploads?userId=${userId}&limit=200`, { headers }),
    ]);

    let generations = genRes.status === "fulfilled" ? genRes.value.data.data : [];
    let uploads     = upRes.status  === "fulfilled" ? upRes.value.data.data  : [];

    // Birleştir ve sırala
    const items = [
      ...generations.map((g: any) => ({ ...g, _type: "generation" })),
      ...uploads.map((u: any)     => ({ ...u, _type: "upload"     })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const filtered  = favOnly ? items.filter((i: any) => i.isFavorited) : items;
    const total     = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    res.json({ success: true, data: { items: paginated, total, page, pages: Math.ceil(total / limit) } } as ApiResponse);
  } catch (err) {
    console.error("library list error", err);
    res.status(500).json({ success: false, error: "Failed to fetch library" });
  }
});

// PATCH /:model/:id/favorite — favori toggle
app.patch("/:model/:id/favorite", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { model, id } = req.params;
    const headers = { "x-internal-token": internalToken() };

    if (model === "generation") {
      await axios.patch(`${GENERATION_SERVICE_URL}/internal/generations/${id}/favorite?userId=${userId}`, {}, { headers });
    } else if (model === "upload") {
      await axios.patch(`${UPLOAD_SERVICE_URL}/internal/uploads/${id}/favorite?userId=${userId}`, {}, { headers });
    } else {
      return res.status(400).json({ success: false, error: "Invalid model. Use generation or upload." });
    }

    res.json({ success: true, message: "Favorite toggled" } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Failed to toggle favorite" });
  }
});

// DELETE /:model/:id — kütüphaneden sil
app.delete("/:model/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { model, id } = req.params;
    const headers = { "x-internal-token": internalToken() };

    if (model === "upload") {
      await axios.delete(`${UPLOAD_SERVICE_URL}/${id}?userId=${userId}`, { headers });
    } else {
      return res.status(400).json({ success: false, error: "Only uploads can be deleted from library directly." });
    }

    res.json({ success: true, message: "Deleted" } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Delete failed" });
  }
});

// ── COLLECTIONS ────────────────────────────────────────────────────────────────

// GET /collections
app.get("/collections", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const collections = await Collection.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: collections } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// POST /collections
app.post("/collections", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: "Name required" });

    const col = await Collection.create({ userId, name: name.trim(), items: [] });
    res.status(201).json({ success: true, data: col } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// GET /collections/:id
app.get("/collections/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const col = await Collection.findOne({ _id: req.params.id, userId });
    if (!col) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: col } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// PATCH /collections/:id — isim güncelle
app.patch("/collections/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { name } = req.body;
    const col = await Collection.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name: name?.trim() },
      { new: true }
    );
    if (!col) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: col } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// DELETE /collections/:id
app.delete("/collections/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const result = await Collection.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, message: "Collection deleted" } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// POST /collections/:id/items — item ekle
app.post("/collections/:id/items", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { refId, refModel } = req.body;
    if (!refId || !refModel) return res.status(400).json({ success: false, error: "refId and refModel required" });

    const col = await Collection.findOneAndUpdate(
      { _id: req.params.id, userId, "items.refId": { $ne: refId } },
      { $push: { items: { refId, refModel, addedAt: new Date() } } },
      { new: true }
    );
    if (!col) return res.status(404).json({ success: false, error: "Collection not found or item already exists" });
    res.json({ success: true, data: col } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// DELETE /collections/:id/items/:refId — item çıkar
app.delete("/collections/:id/items/:refId", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const col = await Collection.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $pull: { items: { refId: req.params.refId } } },
      { new: true }
    );
    if (!col) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: col } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

app.get("/health", (_, res) => res.json({ status: "ok", service: "library" }));

mongoose.connect(MONGO_URI!).then(() => {
  app.listen(PORT, () => console.log(`[library] Listening on :${PORT}`));
}).catch(err => { console.error("[library] MongoDB failed", err); process.exit(1); });
