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

const BEATOVEN_API_KEY = process.env.BEATOVEN_API_KEY;
const JOB_TIMEOUT_MS   = parseInt(process.env.JOB_TIMEOUT_MS || "300000");

export class BeatovenProvider {
  readonly name = "beatoven" as const;

  async generate(prompt: string, duration: number, style: string, mood: string): Promise<string> {
    if (!BEATOVEN_API_KEY) throw new Error("BEATOVEN_API_KEY not set");

    const cfg     = BEATOVEN_CONFIG;
    const headers = { Authorization: `Bearer ${BEATOVEN_API_KEY}` };

    // ── 1. Track oluştur ───────────────────────────────────────────────────
    const createRes = await axios.post(
      `${cfg.baseUrl}/tracks`,
      {
        prompt:   { text: `${prompt}, style: ${style}, mood: ${mood}` },
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
