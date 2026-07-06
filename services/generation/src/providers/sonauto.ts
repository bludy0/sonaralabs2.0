/**
 * providers/sonauto.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sonauto v2 music generation.
 * API docs: https://sonauto.ai/developers/docs
 *
 * Flow:
 *   1. POST /v1/generations/v2  → { task_id }
 *   2. Poll GET /v1/generations/status/{task_id} until "SUCCESS" | "FAILURE"
 *   3. GET /v1/generations/{task_id}  → { song_paths: [url, ...] }
 *   4. Download audio → upload to MinIO (Sonauto URLs expire in 7 days)
 *
 * Note: Sonauto v2 always generates ~95s regardless of the requested duration.
 * The `duration` param is stored as metadata for the UI only.
 */
import axios from "axios";
import { SONAUTO_CONFIG } from "./config";
import { uploadAudioBuffer } from "./minio-client";
import type { GenerationOptions } from "../index";

const SONAUTO_API_KEY = process.env.SONAUTO_API_KEY;
const JOB_TIMEOUT_MS  = parseInt(process.env.JOB_TIMEOUT_MS || "300000");

function buildTags(style: string, mood: string): string[] {
  const styleTags = SONAUTO_CONFIG.styleTags[style] ?? [];
  const moodTags  = SONAUTO_CONFIG.moodTags[mood]   ?? [];
  // Deduplicate, keep max 8 tags (Sonauto performs better with focused tags)
  return [...new Set([...styleTags, ...moodTags])].slice(0, 8);
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export class SonautoProvider {
  readonly name = "sonauto" as const;

  async generate(prompt: string, _duration: number, style: string, mood: string, options?: GenerationOptions): Promise<string> {
    if (!SONAUTO_API_KEY) throw new Error("SONAUTO_API_KEY not set");

    const cfg     = SONAUTO_CONFIG;
    const headers = { Authorization: `Bearer ${SONAUTO_API_KEY}` };
    const tags    = buildTags(style, mood);

    // Prompt'u metriklerle zenginleştir
    const metricParts: string[] = [];
    if (options?.bpm) metricParts.push(`${options.bpm} BPM`);
    if (options?.key && options?.scale) metricParts.push(`${options.key} ${options.scale}`);
    if (options?.timeSignature) metricParts.push(`${options.timeSignature[0]}/${options.timeSignature[1]} time signature`);
    if (options?.intensity !== undefined) {
      const intensityLabel = options.intensity < 0.35 ? "low intensity" : options.intensity < 0.7 ? "medium intensity" : "high intensity";
      metricParts.push(intensityLabel);
    }
    if (options?.loop === false) metricParts.push("with clear intro and ending");
    else metricParts.push("seamless looping video game music");

    const enrichedPrompt = metricParts.length > 0
      ? `${prompt}. ${metricParts.join(", ")}.`
      : prompt;

    // ── 1. Üretimi başlat ───────────────────────────────────────────────────
    const createRes = await axios.post<{ task_id: string }>(
      `${cfg.baseUrl}/generations/${cfg.modelVersion}`,
      {
        prompt: enrichedPrompt,
        tags: tags.length >= 3 ? tags : undefined, // min 3 tag veya hiç
        instrumental:  true,
        num_songs:     1,
        output_format: cfg.outputFormat,
      },
      { headers },
    );

    const taskId = createRes.data.task_id;
    if (!taskId) throw new Error("Sonauto: no task_id in response");

    // ── 2. Poll ────────────────────────────────────────────────────────────
    const deadline = Date.now() + JOB_TIMEOUT_MS - cfg.pollTimeoutBuffer;

    while (Date.now() < deadline) {
      await sleep(cfg.pollIntervalMs);

      const statusRes = await axios.get<string>(
        `${cfg.baseUrl}/generations/status/${taskId}`,
        { headers },
      );
      const status = statusRes.data;

      if (status === "SUCCESS")  break;
      if (status === "FAILURE")  throw new Error("Sonauto: generation FAILURE");
      // Diğer status'lar (GENERATING, SAVING vb.) → devam et
    }

    if (Date.now() >= deadline) {
      throw new Error("Sonauto: polling timeout");
    }

    // ── 3. Audio URL al ────────────────────────────────────────────────────
    const genRes = await axios.get<{ song_paths: string[]; error_message?: string }>(
      `${cfg.baseUrl}/generations/${taskId}`,
      { headers },
    );

    const sonautoUrl = genRes.data.song_paths?.[cfg.variantIndex];
    if (!sonautoUrl) throw new Error("Sonauto: no audio URL in response");

    // ── 4. İndir → MinIO'ya yükle (Sonauto URL'leri 7 günde silinir) ──────
    const audioRes = await axios.get<ArrayBuffer>(sonautoUrl, { responseType: "arraybuffer" });
    const buffer   = Buffer.from(audioRes.data);

    return uploadAudioBuffer(buffer, "music", cfg.outputFormat, "audio/mpeg");
  }
}
