// services/upload/src/index.ts
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import multer from "multer";
import * as Minio from "minio";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import { InternalJwtPayload, ApiResponse } from "@sonaralabs/types";

const app = express();
app.use(express.json());

const {
  PORT = "3003", MONGO_URI, INTERNAL_JWT_SECRET,
  MINIO_ENDPOINT = "minio", MINIO_PORT = "9000",
  MINIO_ACCESS_KEY = "minioadmin", MINIO_SECRET_KEY = "minioadmin",
  MINIO_BUCKET = "sonaralabs-audio",
  STORAGE_QUOTA_BYTES = "524288000",  // 500 MB
  MAX_FILE_SIZE_BYTES = "52428800",   // 50 MB
} = process.env;

if (!MONGO_URI || !INTERNAL_JWT_SECRET) { process.exit(1); }

const QUOTA  = parseInt(STORAGE_QUOTA_BYTES);
const MAX_SZ = parseInt(MAX_FILE_SIZE_BYTES);

// ── MINIO CLIENT ─────────────────────────────────────────────────────────────
const minioClient = new Minio.Client({
  endPoint:  MINIO_ENDPOINT,
  port:      parseInt(MINIO_PORT),
  useSSL:    false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

// ── MODELS ────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({ storageUsed: { type: Number, default: 0 } }, { strict: false });
const User = mongoose.model("User", userSchema);

const uploadSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  originalName: String,
  audioUrl:     String,
  mimeType:     String,
  fileSize:     Number,
  duration:     Number,
  isFavorited:  { type: Boolean, default: false },
}, { timestamps: true });

const Upload = mongoose.model("Upload", uploadSchema);

// ── MULTER (disk storage — heap'e yüklemez, MinIO'ya stream edilir) ──────────
const ALLOWED_MIMES = ["audio/wav", "audio/mpeg", "audio/ogg", "audio/mp3"];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename:    (_req, _file, cb) => cb(null, `upload-${crypto.randomUUID()}`),
  }),
  limits: { fileSize: MAX_SZ },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Allowed: WAV, MP3, OGG"));
  },
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
function getPayload(req: express.Request): InternalJwtPayload {
  const token = req.headers["x-internal-token"] as string;
  if (!token) throw new Error("No internal token");
  return jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// POST / — dosya yükle (atomik quota kontrolü)
app.post("/", upload.single("file"), async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    if (!req.file) return res.status(400).json({ success: false, error: "No file provided" });

    const fileSize = req.file.size;

    // Atomik quota kontrolü: storageUsed + fileSize <= QUOTA ise $inc ile güncelle
    // Race condition koruması — kredi sistemiyle aynı pattern
    const updated = await User.findOneAndUpdate(
      {
        _id: userId,
        $expr: { $lte: [{ $add: ["$storageUsed", fileSize] }, QUOTA] },
      },
      { $inc: { storageUsed: fileSize } },
      { new: true, select: "storageUsed" }
    );

    if (!updated) {
      return res.status(413).json({
        success: false,
        error: "Storage quota exceeded. Maximum 500 MB per user.",
      });
    }

    // MinIO'ya disk'ten stream et — heap'e yükleme
    const ext      = path.extname(req.file.originalname) || ".ogg";
    const key      = `uploads/${userId}/${crypto.randomUUID()}${ext}`;
    const metadata = { "Content-Type": req.file.mimetype };

    const fileStream = fs.createReadStream(req.file.path);
    await minioClient.putObject(MINIO_BUCKET, key, fileStream, fileSize, metadata);
    fs.unlink(req.file.path, () => {}); // temp dosyayı sil (async, hata ignore)
    const audioUrl = `http://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET}/${key}`;

    const doc = await Upload.create({
      userId, originalName: req.file.originalname,
      audioUrl, mimeType: req.file.mimetype, fileSize,
    });

    res.status(201).json({ success: true, data: { id: doc._id, audioUrl, fileSize } } as ApiResponse);
  } catch (err: any) {
    // Multer hataları
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ success: false, error: `File too large. Maximum ${MAX_SZ / 1_048_576} MB.` });
    }
    console.error("upload error", err);
    res.status(500).json({ success: false, error: err.message || "Upload failed" });
  }
});

// DELETE /:id — dosya sil (quota iade et)
app.delete("/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const doc = await Upload.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ success: false, error: "Upload not found" });

    // MinIO'dan sil
    const key = doc.audioUrl!.split(`/${MINIO_BUCKET}/`)[1];
    if (key) await minioClient.removeObject(MINIO_BUCKET, key).catch(() => {});

    // Quota iade et (atomik)
    await User.findByIdAndUpdate(userId, { $inc: { storageUsed: -doc.fileSize! } });
    await Upload.findByIdAndDelete(doc._id);

    res.json({ success: true, message: "Upload deleted" } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Delete failed" });
  }
});

// PATCH /internal/uploads/:id/favorite — library servisi için favori toggle
app.patch("/internal/uploads/:id/favorite", async (req, res) => {
  try {
    getPayload(req);
    const userId = req.query.userId as string;
    const doc = await Upload.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const updated = await Upload.findByIdAndUpdate(
      doc._id,
      { isFavorited: !doc.isFavorited },
      { new: true, select: "isFavorited" }
    );
    res.json({ success: true, data: { isFavorited: updated!.isFavorited } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// GET /internal/uploads — library servisi için
app.get("/internal/uploads", async (req, res) => {
  try {
    getPayload(req);
    const userId = req.query.userId as string;
    const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
    const uploads = await Upload.find({ userId }).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, data: uploads } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", service: "upload" }));

mongoose.connect(MONGO_URI!).then(() => {
  app.listen(PORT, () => console.log(`[upload] Listening on :${PORT}`));
}).catch(err => { console.error("[upload] MongoDB failed", err); process.exit(1); });
