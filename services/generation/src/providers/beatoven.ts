/**
 * providers/beatoven.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Beatoven.ai music generation — async polling flow.
 * API: https://beatoven.ai
 *
 * Flow:
 *   1. POST /tracks          → trackId
 *   2. POST /tracks/:id/compose
 *   3. Poll GET /tracks/:id  → status === "composed" → download_url
 */
import axios from "axios";
import { BEATOVEN_CONFIG } from "./config";
import type { GenerationOptions } from "../index";

const BEATOVEN_API_KEY = process.env.BEATOVEN_API_KEY;
const JOB_TIMEOUT_MS   = parseInt(process.env.JOB_TIMEOUT_MS || "300000");

export class BeatovenProvider {
  readonly name = "beatoven" as const;

  async generate(prompt: string, duration: number, style: string, mood: string, options?: GenerationOptions): Promise<string> {
    if (!BEATOVEN_API_KEY) throw new Error("BEATOVEN_API_KEY not set");

    const cfg     = BEATOVEN_CONFIG;
    const headers = { Authorization: `Bearer ${BEATOVEN_API_KEY}` };

    // Prompt'u metriklerle zenginleştir
    const metricParts: string[] = [];
    if (options?.bpm) metricParts.push(`${options.bpm} BPM`);
    if (options?.key && options?.scale) metricParts.push(`${options.key} ${options.scale}`);
    if (options?.timeSignature) metricParts.push(`${options.timeSignature[0]}/${options.timeSignature[1]} time signature`);
    if (options?.intensity !== undefined) {
      const intensityLabel = options.intensity < 0.35 ? "low intensity" : options.intensity < 0.7 ? "medium intensity" : "high intensity";
      metricParts.push(intensityLabel);
    }
    if (options?.loop === false) metricParts.push("with clear intro and ending, not a loop");
    else metricParts.push("seamless looping");

    const enrichedPrompt = `${prompt}, style: ${style}, mood: ${mood}${metricParts.length > 0 ? ", " + metricParts.join(", ") : ""}`;

    // ── 1. Track oluştur ───────────────────────────────────────────────────
    const createRes = await axios.post(
      `${cfg.baseUrl}/tracks`,
      {
        prompt:   { text: enrichedPrompt },
        format:   cfg.outputFormat,
        duration: duration * 1000, // ms
      },
      { headers },
    );

    const trackId = createRes.data.tracks?.[0];
    if (!trackId) throw new Error("Beatoven: no trackId in response");

    // ── 2. Compose başlat ──────────────────────────────────────────────────
    await axios.post(`${cfg.baseUrl}/tracks/${trackId}/compose`, {}, { headers });

    // ── 3. Poll ────────────────────────────────────────────────────────────
    const deadline = Date.now() + JOB_TIMEOUT_MS - cfg.pollTimeoutBuffer;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, cfg.pollIntervalMs));

      const statusRes = await axios.get(`${cfg.baseUrl}/tracks/${trackId}`, { headers });
      const { status, meta } = statusRes.data;

      if (status === "composed" && meta?.audio?.url) return meta.audio.url as string;
      if (status === "failed") throw new Error("Beatoven: track composition failed");
    }

    throw new Error("Beatoven: polling timeout");
  }
}
