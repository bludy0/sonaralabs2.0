// services/generation/src/index.ts
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { Queue, Worker, Job } from "bullmq";
import { createClient } from "redis";
import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import multer from "multer";
import {
  GenerationRequest, SFXRequest, GenerationStatus, MusicProvider, SFXProvider,
  InternalJwtPayload, ApiResponse, NotifyJobPayload, GenerationType,
  getMusicCreditCost, getSFXCreditCost,
} from "@sonaralabs/types";
import { BeatovenProvider } from "./providers/beatoven";
import { SonautoProvider }  from "./providers/sonauto";
import { ElevenLabsProvider } from "./providers/elevenlabs";
import { analyzeImageWithGemini } from "./providers/gemini-vision";
import { GEMINI_MASTERING_CONFIG, GEMINI_MIDI_CONFIG } from "./providers/config";

const execFileAsync = promisify(execFile);
// 25 MB cap — a 60-second 48kHz stereo WAV is ≈10 MB; 200 MB would hold the entire file in heap
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
app.use(express.json({ limit: "15mb" }));

const {
  PORT = "3002", MONGO_URI, INTERNAL_JWT_SECRET, REDIS_URL = "redis://localhost:6379",
  JOB_TIMEOUT_MS = "300000",
  CREDIT_SERVICE_URL       = "http://credit:3005",
  NOTIFICATION_SERVICE_URL = "http://notification:3007",
} = process.env;

if (!MONGO_URI || !INTERNAL_JWT_SECRET) { process.exit(1); }

if (process.env.NODE_ENV === "production" && !process.env.MINIO_PUBLIC_URL) {
  console.error("[generation] FATAL: MINIO_PUBLIC_URL is not set in production. Audio URLs will point to localhost and be inaccessible.");
  process.exit(1);
}

// ── MODELS ────────────────────────────────────────────────────────────────────
const generationSchema = new mongoose.Schema({
  userId:            { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  type:              { type: String, enum: ["music", "sfx"], default: "music" },
  prompt:            { type: String, required: true },
  provider:          { type: String, enum: ["beatoven", "lyria", "sonauto", "elevenlabs"] },
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

// ── PROVIDER REGISTRY ─────────────────────────────────────────────────────────
// Yeni provider eklemek için: providers/ altında dosya oluştur + buraya 1 satır ekle.
// "lyria" henüz stabil değil — Gemini Audio API hazır olunca eklenecek.
const musicProviders = new Map<MusicProvider, IMusicProvider>([
  ["beatoven", new BeatovenProvider()],
  ["sonauto",  new SonautoProvider()],
]);

const sfxProvider = new ElevenLabsProvider();


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
      await spendCredit(userId, 1, `img-${Date.now()}`, "image_analysis");
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

// DELETE /internal/generations/:id — for library service
app.delete("/internal/generations/:id", async (req, res) => {
  try {
    getPayload(req);
    const userId = req.query.userId as string;
    const result = await Generation.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, message: "Deleted" } as ApiResponse);
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
    // Library şu an sadece "done" gösteriyor; status parametresi eklenerek genişletilebilir
    const filter: Record<string, unknown> = { userId, status: "done" };
    if (type) filter.type = type;
    const items = await Generation.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, data: items } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// POST /export/ogg — server-side WAV → OGG conversion via FFmpeg
app.post("/export/ogg", (req, res, next) => {
  // Run multer middleware first, then handle with async function
  uploadMem.single("wav")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "File upload error: " + err.message });
    }
    try {
      getPayload(req);
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!req.file) return res.status(400).json({ error: "No WAV file provided" });

    const tmpDir = os.tmpdir();
    const id = randomUUID();
    const wavPath = path.join(tmpDir, `${id}.wav`);
    const oggPath = path.join(tmpDir, `${id}.ogg`);

    try {
      await fs.promises.writeFile(wavPath, req.file.buffer);
      // execFile (args array) — no shell, no injection risk even with unusual paths
      await execFileAsync("ffmpeg", ["-i", wavPath, "-c:a", "libvorbis", "-q:a", "6", oggPath]);

      const ogg = await fs.promises.readFile(oggPath);
      res.setHeader("Content-Type", "audio/ogg");
      res.setHeader("Content-Disposition", 'attachment; filename="export.ogg"');
      res.send(ogg);
    } catch (err) {
      console.error("[export/ogg]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "OGG conversion failed. Ensure ffmpeg is installed." });
      }
    } finally {
      // Always clean up temp files regardless of success or error
      fs.promises.unlink(wavPath).catch(() => {});
      fs.promises.unlink(oggPath).catch(() => {});
    }
  });
});

// POST /master — AI mastering assistant (Gemini)
app.post("/master", async (req, res) => {
  try {
    getPayload(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { bpm, tracks } = req.body as {
      bpm: number;
      tracks: Array<{
        id: string;
        name: string;
        type: "audio" | "midi";
        volume: number;
        pan: number;
        muted: boolean;
        effects: {
          eq: { lowGain: number; loMidGain: number; hiMidGain: number; highGain: number; enabled: boolean };
          reverb: { roomSize: number; wet: number; enabled: boolean };
          delay: { time: number; feedback: number; wet: number; enabled: boolean };
          compressor: { threshold: number; ratio: number; attack: number; release: number; enabled: boolean };
        };
      }>;
    };

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) return res.status(503).json({ error: "Gemini API not configured" });

    const masterCfg = GEMINI_MASTERING_CONFIG;
    const trackDescriptions = tracks.map((t, i) => {
      const e = t.effects;
      return `Track ${i + 1} "${t.name}" (${t.type}):
  - Volume: ${(t.volume * 100).toFixed(0)}%, Pan: ${t.pan > 0 ? "R" : t.pan < 0 ? "L" : "C"}${(Math.abs(t.pan) * 100).toFixed(0)}%
  - EQ: ${e.eq.enabled ? `Low ${e.eq.lowGain}dB, LoMid ${e.eq.loMidGain}dB, HiMid ${e.eq.hiMidGain}dB, High ${e.eq.highGain}dB` : "OFF"}
  - Reverb: ${e.reverb.enabled ? `room=${e.reverb.roomSize.toFixed(2)}, wet=${(e.reverb.wet * 100).toFixed(0)}%` : "OFF"}
  - Delay: ${e.delay.enabled ? `time=${e.delay.time.toFixed(2)}s, wet=${(e.delay.wet * 100).toFixed(0)}%` : "OFF"}
  - Compressor: ${e.compressor.enabled ? `thresh=${e.compressor.threshold}dB, ratio=${e.compressor.ratio}:1` : "OFF"}`;
    }).join("\n\n");

    const prompt = `You are a professional audio mastering engineer analyzing a game music mix.

BPM: ${bpm}
Tracks (${tracks.length} total):
${trackDescriptions}

Provide 3-6 specific, actionable mastering suggestions to improve this mix for game use.
Focus on: clarity, punch, spatial depth, loop-readiness.

Return ONLY a valid JSON array, no other text:
[
  {
    "trackIndex": 0,
    "parameter": "reverb.wet",
    "currentValue": 0.2,
    "suggestedValue": 0.35,
    "reason": "Brief reason (max 80 chars)"
  }
]`;

    const geminiResp = await fetch(
      `${masterCfg.baseUrl}/models/${masterCfg.model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: masterCfg.temperature, maxOutputTokens: masterCfg.maxOutputTokens },
        }),
      }
    );

    if (!geminiResp.ok) throw new Error("Gemini API error");

    const geminiData = await geminiResp.json() as any;
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    res.json({ data: { suggestions } });
  } catch (err) {
    console.error("[master]", err);
    res.status(500).json({ error: "Mastering analysis failed" });
  }
});

// POST /midi — AI MIDI melody generation via Gemini Flash (1 credit)
app.post("/midi", async (req, res) => {
  let userId: string;
  try {
    userId = getPayload(req).sub;
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { prompt, bars = 4, bpm = 120, key = "C", scale = "Major", durationBeats } = req.body as {
      prompt:         string;
      bars?:          number;
      bpm?:           number;
      key?:           string;
      scale?:         string;
      durationBeats?: number;
    };

    if (!prompt) return res.status(400).json({ error: "prompt required" });

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) return res.status(503).json({ error: "Gemini API not configured" });

    const midiCfg = GEMINI_MIDI_CONFIG;
    // Charge 1 credit
    try {
      await spendCredit(userId, 1, `midi-${Date.now()}`, "midi_generation");
    } catch (err: any) {
      return res.status(err.response?.status === 422 ? 422 : 500).json({
        error: err.response?.data?.error || "Credit error",
      });
    }

    const totalBeats = durationBeats ?? bars * 4;

    const systemPrompt = `You are a professional MIDI composer for game music.
Generate a melody in ${key} ${scale} with ${bars} bars at ${bpm} BPM.
Style: ${prompt}

Rules:
- Use pitches MIDI 48-84 (C3-C6)
- Each note: { "pitch": <0-127>, "velocity": <40-110>, "startBeat": <0 to ${totalBeats - 0.25}>, "durationBeats": <0.25-2> }
- Total duration: ${totalBeats} beats (${bars} bars of 4/4)
- 8-20 notes for a good melody
- No overlapping notes on same pitch
- Fit the style and key described

Return ONLY valid JSON array, no markdown, no explanation:
[{"pitch":60,"velocity":80,"startBeat":0,"durationBeats":0.5},...]`;

    const geminiResp = await fetch(
      `${midiCfg.baseUrl}/models/${midiCfg.model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: midiCfg.temperature, maxOutputTokens: midiCfg.maxOutputTokens },
        }),
      }
    );

    if (!geminiResp.ok) throw new Error(`Gemini error: ${geminiResp.status}`);

    const geminiData = await geminiResp.json() as any;
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

    // Extract JSON array from response (handle potential markdown wrapping)
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No valid JSON array in Gemini response");

    const notes = JSON.parse(jsonMatch[0]) as Array<{
      pitch: number; velocity: number; startBeat: number; durationBeats: number;
    }>;

    // Sanitize: clamp values, filter invalid entries
    const sanitized = notes
      .filter(n => typeof n.pitch === "number" && typeof n.startBeat === "number" && typeof n.durationBeats === "number")
      .map(n => ({
        pitch:         Math.max(21, Math.min(108, Math.round(n.pitch))),
        velocity:      Math.max(1,  Math.min(127, Math.round(n.velocity ?? 80))),
        startBeat:     Math.max(0,  Math.round(n.startBeat * 4) / 4),
        durationBeats: Math.max(0.25, Math.min(4, Math.round(n.durationBeats * 4) / 4)),
      }))
      .filter(n => n.startBeat < totalBeats)
      .slice(0, 32);  // cap at 32 notes

    res.json({ notes: sanitized, bpm, key, scale, bars, totalBeats });
  } catch (err) {
    console.error("[generate/midi]", err);
    res.status(500).json({ error: "MIDI generation failed" });
  }
});

// GET /capabilities — public, frontend uses to disable unavailable providers
app.get("/capabilities", (_, res) => res.json({
  music: {
    beatoven:  Boolean(process.env.BEATOVEN_API_KEY),
    sonauto:   Boolean(process.env.SONAUTO_API_KEY),
    lyria:     false,
  },
  sfx: {
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
  },
  vision: {
    gemini: Boolean(process.env.GEMINI_API_KEY),
  },
}));

app.get("/health", (_, res) => res.json({
  status: "ok", service: "generation",
  providers: {
    music: {
      beatoven:  Boolean(process.env.BEATOVEN_API_KEY),
      sonauto:   Boolean(process.env.SONAUTO_API_KEY),
      lyria:     false, // not yet — Gemini Audio API stabil değil
    },
    sfx: {
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    },
    vision: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
    },
  },
}));

mongoose.connect(MONGO_URI!).then(() => {
  app.listen(PORT, () => console.log(`[generation] Listening on :${PORT}`));
}).catch(err => { console.error("[generation] MongoDB failed", err); process.exit(1); });
