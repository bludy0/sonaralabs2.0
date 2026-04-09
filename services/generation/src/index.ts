// services/generation/src/index.ts
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { Queue, Worker, Job } from "bullmq";
import { createClient } from "redis";
import axios from "axios";
import {
  GenerationRequest, SFXRequest, GenerationStatus, MusicProvider, SFXProvider,
  InternalJwtPayload, ApiResponse, NotifyJobPayload, GenerationType,
} from "@sonaralabs/types";
import { BeatovenProvider } from "./providers/beatoven";
import { analyzeImageWithGemini } from "./providers/gemini-vision";
import { StabilityAudioProvider } from "./providers/stability";
import { ElevenLabsProvider } from "./providers/elevenlabs";

const app = express();
app.use(express.json({ limit: "15mb" }));

const {
  PORT = "3002", MONGO_URI, INTERNAL_JWT_SECRET, REDIS_URL = "redis://localhost:6379",
  JOB_TIMEOUT_MS = "300000",
  CREDIT_SERVICE_URL       = "http://credit:3005",
  NOTIFICATION_SERVICE_URL = "http://notification:3007",
} = process.env;

if (!MONGO_URI || !INTERNAL_JWT_SECRET) { process.exit(1); }

// ── MODELS ────────────────────────────────────────────────────────────────────
const generationSchema = new mongoose.Schema({
  userId:            { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  type:              { type: String, enum: ["music", "sfx"], default: "music" },
  prompt:            { type: String, required: true },
  provider:          { type: String, enum: ["beatoven", "lyria", "stability", "elevenlabs"] },
  status:            { type: String, enum: ["pending","processing","done","failed"], default: "pending" },
  audioUrl:          String,
  duration:          Number,   // music: seconds (15/30/60); sfx: seconds (float)
  style:             String,
  mood:              String,
  bpm:               Number,
  creditCost:        Number,
  isFavorited:       { type: Boolean, default: false },
  isImageGeneration: { type: Boolean, default: false },
  sourceImageUrl:    String,
  jobId:             { type: String, index: true },
  failedAt:          Date,
  failReason:        String,
}, { timestamps: true });

generationSchema.index({ userId: 1, createdAt: -1 });
generationSchema.index({ status: 1 });

const Generation = mongoose.model("Generation", generationSchema);

// ── AI PROVIDER PATTERN ───────────────────────────────────────────────────────

interface IMusicProvider {
  name: MusicProvider;
  generate(prompt: string, duration: number, style: string, mood: string): Promise<string>;
}

class LyriaProvider implements IMusicProvider {
  name = "lyria" as const;
  async generate(_p: string, _d: number, _s: string, _m: string): Promise<string> {
    throw new Error("Lyria provider not yet implemented — API under review");
  }
}

const musicProviders = new Map<MusicProvider, IMusicProvider>([
  ["beatoven",  new BeatovenProvider()],
  ["lyria",     new LyriaProvider()],
  ["stability", new StabilityAudioProvider()],
]);

const sfxProvider = new ElevenLabsProvider();

// ── CREDIT COST TABLES ────────────────────────────────────────────────────────
const MUSIC_CREDIT_COST: Record<MusicProvider, Record<number, number>> = {
  beatoven:  { 15: 3, 30: 5, 60: 8 },
  lyria:     { 15: 2, 30: 3, 60: 5 },
  stability: { 15: 2, 30: 3, 60: 5 }, // Stability: budget tier
};

const SFX_CREDIT_COST: Record<SFXProvider, number> = {
  elevenlabs: 1, // 1 credit per SFX regardless of duration
};

function getMusicCreditCost(provider: MusicProvider, duration: number, isRetry = false): number {
  const base = MUSIC_CREDIT_COST[provider]?.[duration] ?? 5;
  return isRetry ? Math.ceil(base / 2) : base;
}

function getSFXCreditCost(provider: SFXProvider): number {
  return SFX_CREDIT_COST[provider] ?? 1;
}

// ── IMAGE VALIDATION ──────────────────────────────────────────────────────────
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES          = 10 * 1024 * 1024;
const MAX_IMAGE_BASE64_LENGTH  = Math.ceil(MAX_IMAGE_BYTES * 4 / 3);

// ── REDIS + BULLMQ ────────────────────────────────────────────────────────────
const connection = { url: REDIS_URL };

const generationQueue = new Queue("generation", {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 200 },
});

function makeInternalToken(): string {
  return jwt.sign({ sub: "generation-service", role: "user", _internal: true }, INTERNAL_JWT_SECRET!, { expiresIn: "5m" });
}

async function notifyUser(payload: NotifyJobPayload) {
  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL}/internal/notify`, payload, {
      headers: { "x-internal-token": makeInternalToken() },
    });
  } catch (err) {
    console.warn("[generation] Notification failed:", err);
  }
}

async function spendCredit(userId: string, amount: number, jobId: string, reason: string) {
  await axios.post(`${CREDIT_SERVICE_URL}/spend`, {
    userId, amount, reason, relatedId: jobId, relatedModel: "Generation",
  }, { headers: { "x-internal-token": makeInternalToken() } });
}

async function earnCredit(userId: string, amount: number, relatedId: string) {
  try {
    await axios.post(`${CREDIT_SERVICE_URL}/earn`, {
      userId, amount, reason: "queue_failure_refund", relatedId, relatedModel: "Generation",
    }, { headers: { "x-internal-token": makeInternalToken() } });
  } catch {
    console.warn("[generation] Credit refund failed for", relatedId);
  }
}

// ── BULLMQ WORKER ─────────────────────────────────────────────────────────────
const worker = new Worker("generation", async (job: Job) => {
  const { generationId, userId, prompt, provider, style, mood, duration, type } = job.data;

  await Generation.findByIdAndUpdate(generationId, { status: "processing" });
  await notifyUser({ userId, jobId: job.id!, status: "processing" });

  let audioUrl: string;

  if (type === "sfx") {
    const result = await sfxProvider.generate({ prompt, durationSeconds: duration });
    audioUrl = result.audioUrl;
    await Generation.findByIdAndUpdate(generationId, {
      status: "done", audioUrl, duration: result.durationSeconds,
    });
  } else {
    const p = musicProviders.get(provider as MusicProvider);
    if (!p) throw new Error(`Unknown provider: ${provider}`);
    audioUrl = await p.generate(prompt, duration, style, mood);
    await Generation.findByIdAndUpdate(generationId, { status: "done", audioUrl });
  }

  await notifyUser({ userId, jobId: job.id!, status: "done", audioUrl });
  return { audioUrl };
}, {
  connection,
  concurrency: 3,
  lockDuration: parseInt(JOB_TIMEOUT_MS) + 10_000,
});

worker.on("failed", async (job, err) => {
  if (!job) return;
  const { generationId, userId } = job.data;
  await Generation.findByIdAndUpdate(generationId, { status: "failed", failedAt: new Date(), failReason: err.message });
  await notifyUser({ userId, jobId: job.id!, status: "failed", failReason: err.message });
  console.error(`[generation] Job ${job.id} failed:`, err.message);
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function getPayload(req: express.Request): InternalJwtPayload {
  const token = req.headers["x-internal-token"] as string;
  if (!token) throw new Error("No internal token");
  return jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// POST / — music generation
app.post("/", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { prompt, provider, style, mood, duration } = req.body as GenerationRequest;

    if (!prompt || !provider || !style || !mood || !duration) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    if (!musicProviders.has(provider)) {
      return res.status(400).json({ success: false, error: `Unknown music provider: ${provider}` });
    }

    const creditCost = getMusicCreditCost(provider, duration);
    const gen = await Generation.create({
      userId, type: "music", prompt, provider, style, mood, duration, creditCost, status: "pending",
    });

    try {
      await spendCredit(userId, creditCost, String(gen._id), "music_generation");
    } catch (err: any) {
      await Generation.findByIdAndDelete(gen._id);
      return res.status(err.response?.status === 422 ? 422 : 500).json({
        success: false, error: err.response?.data?.error || "Credit error",
      });
    }

    try {
      const job = await generationQueue.add("generate", {
        generationId: String(gen._id), userId, prompt, provider, style, mood, duration, type: "music",
      }, { jobId: String(gen._id) });
      await Generation.findByIdAndUpdate(gen._id, { jobId: job.id });
      res.status(202).json({ success: true, data: { jobId: job.id, generationId: gen._id, creditCost } } as ApiResponse);
    } catch {
      await Generation.findByIdAndDelete(gen._id);
      await earnCredit(userId, creditCost, String(gen._id));
      res.status(500).json({ success: false, error: "Failed to queue generation job" });
    }
  } catch (err) {
    console.error("generate error", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /sfx — SFX generation (ElevenLabs)
app.post("/sfx", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { prompt, provider = "elevenlabs", durationSeconds } = req.body as SFXRequest & { provider?: SFXProvider };

    if (!prompt) return res.status(400).json({ success: false, error: "prompt required" });
    if (provider !== "elevenlabs") {
      return res.status(400).json({ success: false, error: `Unknown SFX provider: ${provider}` });
    }
    if (!await sfxProvider.isAvailable()) {
      return res.status(503).json({ success: false, error: "ElevenLabs not configured (ELEVENLABS_API_KEY missing)" });
    }

    const creditCost = getSFXCreditCost(provider);
    const gen = await Generation.create({
      userId, type: "sfx", prompt, provider, duration: durationSeconds ?? null, creditCost, status: "pending",
    });

    try {
      await spendCredit(userId, creditCost, String(gen._id), "sfx_generation");
    } catch (err: any) {
      await Generation.findByIdAndDelete(gen._id);
      return res.status(err.response?.status === 422 ? 422 : 500).json({
        success: false, error: err.response?.data?.error || "Credit error",
      });
    }

    try {
      const job = await generationQueue.add("generate", {
        generationId: String(gen._id), userId, prompt, provider, type: "sfx",
        duration: durationSeconds,
      }, { jobId: String(gen._id) });
      await Generation.findByIdAndUpdate(gen._id, { jobId: job.id });
      res.status(202).json({ success: true, data: { jobId: job.id, generationId: gen._id, creditCost } } as ApiResponse);
    } catch {
      await Generation.findByIdAndDelete(gen._id);
      await earnCredit(userId, creditCost, String(gen._id));
      res.status(500).json({ success: false, error: "Failed to queue SFX job" });
    }
  } catch (err) {
    console.error("sfx error", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /analyze-image — Gemini Flash image-to-music prompt
app.post("/analyze-image", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ success: false, error: "imageBase64 and mimeType required" });
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({ success: false, error: "Invalid image type. Allowed: jpeg, png, webp, gif" });
    }
    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return res.status(413).json({ success: false, error: "Image too large. Maximum 10 MB" });
    }

    try {
      await spendCredit(userId, 1, "image-analysis", "image_analysis");
    } catch (err: any) {
      return res.status(err.response?.status === 422 ? 422 : 500).json({
        success: false, error: err.response?.data?.error || "Credit error",
      });
    }

    const promptText = await analyzeImageWithGemini(imageBase64, mimeType);
    res.json({ success: true, data: { prompt: promptText } } as ApiResponse);
  } catch (err) {
    console.error("analyze-image error", err);
    res.status(500).json({ success: false, error: "Analysis failed" });
  }
});

// GET /history — generation history
app.get("/history", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(50, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as GenerationStatus | undefined;
    const type   = req.query.type as GenerationType | undefined;

    const filter: Record<string, unknown> = { userId };
    if (status) filter.status = status;
    if (type)   filter.type   = type;

    const [items, total] = await Promise.all([
      Generation.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Generation.countDocuments(filter),
    ]);

    res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// POST /:id/retry — retry failed generation at half cost
app.post("/:id/retry", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const gen = await Generation.findOne({ _id: req.params.id, userId });
    if (!gen) return res.status(404).json({ success: false, error: "Not found" });
    if (gen.status !== "failed") return res.status(400).json({ success: false, error: "Only failed generations can be retried" });

    const genType = (gen.type as GenerationType) || "music";
    const creditCost = genType === "sfx"
      ? getSFXCreditCost(gen.provider as SFXProvider)
      : getMusicCreditCost(gen.provider as MusicProvider, gen.duration!, true);

    const newGen = await Generation.create({
      userId, type: genType, prompt: gen.prompt, provider: gen.provider,
      style: gen.style, mood: gen.mood, duration: gen.duration,
      creditCost, status: "pending",
      isImageGeneration: gen.isImageGeneration, sourceImageUrl: gen.sourceImageUrl,
    });

    try {
      await spendCredit(userId, creditCost, String(newGen._id), `${genType}_retry`);
    } catch (err: any) {
      await Generation.findByIdAndDelete(newGen._id);
      return res.status(err.response?.status === 422 ? 422 : 500).json({
        success: false, error: err.response?.data?.error || "Credit error",
      });
    }

    try {
      const job = await generationQueue.add("generate", {
        generationId: String(newGen._id), userId, prompt: gen.prompt,
        provider: gen.provider, style: gen.style, mood: gen.mood,
        duration: gen.duration, type: genType,
      });
      await Generation.findByIdAndUpdate(newGen._id, { jobId: job.id });
      res.status(202).json({ success: true, data: { jobId: job.id, generationId: newGen._id, creditCost } } as ApiResponse);
    } catch {
      await Generation.findByIdAndDelete(newGen._id);
      await earnCredit(userId, creditCost, String(newGen._id));
      res.status(500).json({ success: false, error: "Failed to queue retry job" });
    }
  } catch (err) {
    console.error("retry error", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// PATCH /internal/generations/:id/favorite
app.patch("/internal/generations/:id/favorite", async (req, res) => {
  try {
    getPayload(req);
    const userId = req.query.userId as string;
    const gen = await Generation.findOne({ _id: req.params.id, userId });
    if (!gen) return res.status(404).json({ success: false, error: "Not found" });
    const updated = await Generation.findByIdAndUpdate(
      gen._id, { isFavorited: !gen.isFavorited }, { new: true, select: "isFavorited" }
    );
    res.json({ success: true, data: { isFavorited: updated!.isFavorited } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// GET /internal/generations — for library service
app.get("/internal/generations", async (req, res) => {
  try {
    getPayload(req);
    const userId = req.query.userId as string;
    const limit  = Math.min(200, parseInt(req.query.limit as string) || 50);
    const type   = req.query.type as GenerationType | undefined;
    const filter: Record<string, unknown> = { userId, status: "done" };
    if (type) filter.type = type;
    const items = await Generation.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, data: items } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

app.get("/health", (_, res) => res.json({
  status: "ok", service: "generation",
  providers: {
    beatoven:  Boolean(process.env.BEATOVEN_API_KEY),
    stability: Boolean(process.env.STABILITY_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    lyria:     Boolean(process.env.GEMINI_API_KEY),
  },
}));

mongoose.connect(MONGO_URI!).then(() => {
  app.listen(PORT, () => console.log(`[generation] Listening on :${PORT}`));
}).catch(err => { console.error("[generation] MongoDB failed", err); process.exit(1); });
