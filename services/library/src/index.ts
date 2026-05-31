import { logger } from "./logger"
// services/library/src/index.ts
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import axios from "axios";
import { InternalJwtPayload, ApiResponse } from "@sonaralabs/types";

// Servisler-arası HTTP çağrıları timeout'suz kalırsa bir downstream takıldığında
// bu servisin isteği de askıda kalır. Tüm axios çağrılarına ortak timeout uygula.
axios.defaults.timeout = parseInt(process.env.INTERNAL_HTTP_TIMEOUT_MS ?? "10000");

const app = express();
app.use(express.json({ limit: "3mb" }));

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

// ── DAW PROJECTS ───────────────────────────────────────────────────────────────
const dawProjectSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name:         { type: String, required: true, maxlength: 120, default: "Untitled Project" },
  tracks:       { type: mongoose.Schema.Types.Mixed, default: [] },   // serialized DAWTrack[]
  bpm:          { type: Number, default: 120 },
  masterVolume: { type: Number, default: 0.8 },
  loopStart:    { type: Number, default: 0 },
  loopEnd:      { type: Number, default: 8 },
  loopEnabled:  { type: Boolean, default: false },
  isPublic:     { type: Boolean, default: false },
  shareToken:   { type: String, sparse: true, index: true },
}, { timestamps: true });

const DawProject = mongoose.model("DawProject", dawProjectSchema);

// favorites "Generation" ve "Upload" modellerinde isFavorited flag ile tutulur.
// Library servisi bu verilere internal HTTP ile erişir.

// ── HELPERS ───────────────────────────────────────────────────────────────────
function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function getPayload(req: express.Request): InternalJwtPayload {
  const token = req.headers["x-internal-token"] as string;
  if (!token) throw new Error("No token");
  const payload = jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
  if (!payload._internal) throw new Error("Not an internal token");
  return payload;
}

// Internal token, adına işlem yapılan KULLANICININ id'sini taşır. Böylece
// generation/upload internal endpoint'leri userId'yi token sub'ından alır;
// query param'a güvenmez (IDOR savunması — defense in depth).
function internalToken(userId: string): string {
  return jwt.sign(
    { sub: userId, role: "user", _internal: true },
    INTERNAL_JWT_SECRET!,
    { expiresIn: "5m" }
  );
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// GET / — birleşik kütüphane listesi (generations + uploads)
app.get("/", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const headers = { "x-internal-token": internalToken(userId) };
    const page       = parseInt(req.query.page as string) || 1;
    const limit      = parseInt(req.query.limit as string) || 20;
    const favOnly    = req.query.favorites === "true";
    const typeFilter = req.query.type as string | undefined;
    const q          = (req.query.q as string | undefined)?.toLowerCase().trim();

    // limit=200: tüm itemlar in-memory çekilip sayfalanır (her servis max 200)
    const [genRes, upRes] = await Promise.allSettled([
      axios.get(`${GENERATION_SERVICE_URL}/internal/generations?limit=200`, { headers }),
      axios.get(`${UPLOAD_SERVICE_URL}/internal/uploads?limit=200`, { headers }),
    ]);

    let generations = genRes.status === "fulfilled" ? genRes.value.data.data : [];
    let uploads     = upRes.status  === "fulfilled" ? upRes.value.data.data  : [];

    type LibItem = Record<string, unknown> & { _type: string; createdAt: string; isFavorited?: boolean };

    // Birleştir ve sırala
    const items: LibItem[] = [
      ...generations.map((g: Record<string, unknown>) => ({ ...g, _type: "generation" })),
      ...uploads.map((u: Record<string, unknown>)     => ({ ...u, _type: "upload"     })),
    ].sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

    const filtered = items.filter((i) => {
      if (favOnly && !i.isFavorited) return false;
      if (typeFilter && typeFilter !== "all" && i._type !== typeFilter) return false;
      if (q) {
        const label = ((i.originalName ?? i.prompt ?? "") as string).toLowerCase();
        if (!label.includes(q)) return false;
      }
      return true;
    });
    const total     = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    res.json({ success: true, data: { items: paginated, total, page, pages: Math.ceil(total / limit) } } as ApiResponse);
  } catch (err) {
    logger.error("library list error", { message: String(err) });
    res.status(500).json({ success: false, error: "Failed to fetch library" });
  }
});

// DELETE /collections/:id — must be defined BEFORE /:model/:id to avoid shadowing
app.delete("/collections/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, error: "Invalid ID" });
    const result = await Collection.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, message: "Collection deleted" } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// PATCH /:model/:id/favorite — favori toggle
app.patch("/:model/:id/favorite", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, error: "Invalid ID" });
    const { model, id } = req.params;
    const headers = { "x-internal-token": internalToken(userId) };

    if (model === "generation") {
      await axios.patch(`${GENERATION_SERVICE_URL}/internal/generations/${id}/favorite`, {}, { headers });
    } else if (model === "upload") {
      await axios.patch(`${UPLOAD_SERVICE_URL}/internal/uploads/${id}/favorite`, {}, { headers });
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
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, error: "Invalid ID" });
    const { model, id } = req.params;
    const headers = { "x-internal-token": internalToken(userId) };

    if (model === "upload") {
      await axios.delete(`${UPLOAD_SERVICE_URL}/internal/uploads/${id}`, { headers });
    } else if (model === "generation") {
      await axios.delete(`${GENERATION_SERVICE_URL}/internal/generations/${id}`, { headers });
    } else {
      return res.status(400).json({ success: false, error: "Model must be 'generation' or 'upload'." });
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
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, error: "Invalid ID" });
    const col = await Collection.findOne({ _id: req.params.id, userId });
    if (!col) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: col } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// PATCH /collections/:id — isim güncelle
app.patch("/collections/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, error: "Invalid ID" });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: "Name required" });
    const col = await Collection.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name: name.trim() },
      { new: true }
    );
    if (!col) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: col } as ApiResponse);
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

// ── DAW PROJECT ROUTES ────────────────────────────────────────────────────────

const MAX_PROJECT_BYTES = 2 * 1024 * 1024; // 2 MB serialized limit

// GET /projects/share/:token — public (no auth required)
app.get("/projects/share/:token", async (req, res) => {
  try {
    const project = await DawProject.findOne({ shareToken: req.params.token, isPublic: true });
    if (!project) return res.status(404).json({ success: false, error: "Project not found" });
    res.json({ success: true, data: project });
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// GET /projects — list my projects (with trackCount, without full tracks payload)
app.get("/projects", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const projects = await DawProject.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $project: { _id: 1, name: 1, bpm: 1, isPublic: 1, shareToken: 1,
                    createdAt: 1, updatedAt: 1,
                    trackCount: { $size: { $ifNull: ["$tracks", []] } } } },
      { $sort: { updatedAt: -1 } },
    ]);
    res.json({ success: true, data: projects } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// POST /projects — create new project
app.post("/projects", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { name, tracks, bpm, masterVolume, loopStart, loopEnd, loopEnabled } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: "name required" });
    if (tracks !== undefined && JSON.stringify(tracks).length > MAX_PROJECT_BYTES)
      return res.status(413).json({ success: false, error: "Project data too large (max 2 MB)" });

    const project = await DawProject.create({
      userId,
      name: name.trim(),
      tracks: tracks ?? [],
      bpm: bpm ?? 120,
      masterVolume: masterVolume ?? 0.8,
      loopStart: loopStart ?? 0,
      loopEnd: loopEnd ?? 8,
      loopEnabled: loopEnabled ?? false,
    });
    res.status(201).json({ success: true, data: project } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// GET /projects/:id — load project (owner or public)
app.get("/projects/:id", async (req, res) => {
  try {
    const hasToken = !!req.headers["x-internal-token"];
    if (hasToken) {
      // Authenticated request — only the owner can load their project
      const { sub: userId } = getPayload(req); // throws 401 on bad/expired token
      const project = await DawProject.findOne({ _id: req.params.id, userId });
      if (!project) return res.status(404).json({ success: false, error: "Not found" });
      return res.json({ success: true, data: project } as ApiResponse);
    } else {
      // Unauthenticated — only public projects
      const project = await DawProject.findOne({ _id: req.params.id, isPublic: true });
      if (!project) return res.status(404).json({ success: false, error: "Not found" });
      return res.json({ success: true, data: project } as ApiResponse);
    }
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// PUT /projects/:id — save (update) project
app.put("/projects/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { name, tracks, bpm, masterVolume, loopStart, loopEnd, loopEnabled } = req.body;
    if (tracks !== undefined && JSON.stringify(tracks).length > MAX_PROJECT_BYTES)
      return res.status(413).json({ success: false, error: "Project data too large (max 2 MB)" });

    const project = await DawProject.findOneAndUpdate(
      { _id: req.params.id, userId },
      {
        ...(name && { name: name.trim() }),
        ...(tracks !== undefined && { tracks }),
        ...(bpm !== undefined && { bpm }),
        ...(masterVolume !== undefined && { masterVolume }),
        ...(loopStart !== undefined && { loopStart }),
        ...(loopEnd !== undefined && { loopEnd }),
        ...(loopEnabled !== undefined && { loopEnabled }),
      },
      { new: true }
    );
    if (!project) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: project } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// DELETE /projects/:id
app.delete("/projects/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const result = await DawProject.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, message: "Project deleted" } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

// POST /projects/:id/share — toggle public share link
app.post("/projects/:id/share", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const project = await DawProject.findOne({ _id: req.params.id, userId });
    if (!project) return res.status(404).json({ success: false, error: "Not found" });

    if (project.isPublic && project.shareToken) {
      // Toggle off
      project.isPublic   = false;
      project.shareToken = undefined;
    } else {
      // Generate new token and make public
      const crypto = await import("crypto");
      project.shareToken = crypto.randomBytes(16).toString("hex");
      project.isPublic   = true;
    }
    await project.save();

    res.json({
      success: true,
      data: {
        isPublic:   project.isPublic,
        shareToken: project.shareToken ?? null,
      }
    } as ApiResponse);
  } catch { res.status(500).json({ success: false, error: "Failed" }); }
});

app.get("/health", (_, res) => res.json({ status: "ok", service: "library" }));

mongoose.connect(MONGO_URI!).then(() => {
  app.listen(PORT, () => logger.info(`[library] Listening on :${PORT}`));
}).catch(err => { logger.error("[library] MongoDB failed", err); process.exit(1); });
