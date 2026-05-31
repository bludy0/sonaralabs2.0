import { logger } from "./logger"
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
  MINIO_USE_SSL = "false",
  // MINIO_PUBLIC_URL: browser-accessible base URL for stored files.
  // Dev default = localhost (bucket policy = anonymous download, port 9000 exposed).
  // Prod: set to CDN / Backblaze public URL.
  MINIO_PUBLIC_URL,
  STORAGE_QUOTA_BYTES = "524288000",  // 500 MB
  MAX_FILE_SIZE_BYTES = "52428800",   // 50 MB
} = process.env;

// URL that browsers can reach — falls back to localhost when running outside Docker
const MINIO_PUBLIC_BASE = MINIO_PUBLIC_URL ?? `http://localhost:${MINIO_PORT}`;

if (!MONGO_URI || !INTERNAL_JWT_SECRET) { process.exit(1); }

if (process.env.NODE_ENV === "production" && !process.env.MINIO_PUBLIC_URL) {
  logger.error("[upload] FATAL: MINIO_PUBLIC_URL is not set in production. Uploaded file URLs will point to localhost and be inaccessible.");
  process.exit(1);
}

const QUOTA  = parseInt(STORAGE_QUOTA_BYTES);
const MAX_SZ = parseInt(MAX_FILE_SIZE_BYTES);

// ── MINIO CLIENT ─────────────────────────────────────────────────────────────
const minioClient = new Minio.Client({
  endPoint:  MINIO_ENDPOINT,
  port:      parseInt(MINIO_PORT),
  useSSL:    MINIO_USE_SSL === "true",
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
const ALLOWED_MIMES = ["audio/wav", "audio/mpeg", "audio/ogg"];

// VULN-15: Derive file extension from MIME type — never trust originalname
const MIME_TO_EXT: Record<string, string> = {
  "audio/wav":  ".wav",
  "audio/mpeg": ".mp3",
  "audio/ogg":  ".ogg",
};

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

// ── HELPERS ───────────────────────────────────────────────────────────────────
function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function getPayload(req: express.Request): InternalJwtPayload {
  const token = req.headers["x-internal-token"] as string;
  if (!token) throw new Error("No internal token");
  const payload = jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
  if (!payload._internal) throw new Error("Not an internal token");
  return payload;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// POST / — dosya yükle (atomik quota kontrolü)
app.post("/", (req, res) => {
  // Multer callback form — middleware hatalarını JSON olarak döndürür (HTML 500 yerine)
  upload.single("file")(req, res, async (multerErr: any) => {
    if (multerErr) {
      if (multerErr.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, error: `File too large. Maximum ${MAX_SZ / 1_048_576} MB.` });
      }
      // fileFilter'dan gelen "Invalid file type" veya diğer Multer hataları
      return res.status(400).json({ success: false, error: multerErr.message || "File upload error" });
    }

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
      // VULN-15: Use MIME-derived extension, never originalname (path traversal / spoofing)
      const ext      = MIME_TO_EXT[req.file.mimetype] ?? ".ogg";
      const key      = `uploads/${userId}/${crypto.randomUUID()}${ext}`;
      const metadata = { "Content-Type": req.file.mimetype };

      try {
        const fileStream = fs.createReadStream(req.file.path);
        await minioClient.putObject(MINIO_BUCKET, key, fileStream, fileSize, metadata);
      } catch (minioErr) {
        // MinIO failed after storageUsed was already incremented — roll back quota
        fs.unlink(req.file.path, () => {});
        await User.findByIdAndUpdate(userId, { $inc: { storageUsed: -fileSize } }).catch(() => {});
        logger.error("upload minio error", { message: String(minioErr) });
        return res.status(502).json({ success: false, error: "Storage backend error. Please try again." });
      }
      fs.unlink(req.file.path, () => {}); // temp dosyayı sil (async, hata ignore)
      const audioUrl = `${MINIO_PUBLIC_BASE}/${MINIO_BUCKET}/${key}`;

      const doc = await Upload.create({
        userId, originalName: req.file.originalname,
        audioUrl, mimeType: req.file.mimetype, fileSize,
      });

      res.status(201).json({ success: true, data: { id: doc._id, audioUrl, fileSize } } as ApiResponse);
    } catch (err: any) {
      logger.error("upload error", { message: String(err) });
      res.status(500).json({ success: false, error: err.message || "Upload failed" });
    }
  });
});

// DELETE /:id — dosya sil (quota iade et)
app.delete("/:id", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, error: "Invalid ID" });
    const doc = await Upload.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ success: false, error: "Upload not found" });

    // MinIO'dan sil
    const key = doc.audioUrl!.split(`/${MINIO_BUCKET}/`)[1];
    if (key) await minioClient.removeObject(MINIO_BUCKET, key).catch(e =>
      logger.warn("[upload] MinIO removeObject failed — file may be orphaned", { key, message: String(e) })
    );

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

// DELETE /internal/uploads/:id — library servisi için (userId query param olarak gelir)
app.delete("/internal/uploads/:id", async (req, res) => {
  try {
    getPayload(req);
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });

    const doc = await Upload.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ success: false, error: "Upload not found" });

    const key = doc.audioUrl!.split(`/${MINIO_BUCKET}/`)[1];
    if (key) await minioClient.removeObject(MINIO_BUCKET, key).catch(e =>
      logger.warn("[upload] MinIO removeObject failed — file may be orphaned", { key, message: String(e) })
    );

    await Upload.deleteOne({ _id: doc._id });
    await User.findByIdAndUpdate(userId, { $inc: { storageUsed: -doc.fileSize! } });

    res.json({ success: true, message: "Deleted" } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Delete failed" });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", service: "upload" }));

mongoose.connect(MONGO_URI!).then(() => {
  app.listen(PORT, () => logger.info(`[upload] Listening on :${PORT}`));
}).catch(err => { logger.error("[upload] MongoDB failed", err); process.exit(1); });
