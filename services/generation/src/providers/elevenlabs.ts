/**
 * providers/elevenlabs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs Sound Effects API — SFX generation.
 * Docs: https://elevenlabs.io/docs/api-reference/sound-generation
 * Plan: Starter ($5/mo) minimum — Free plan doesn't include SFX API.
 */
import axios from "axios";
import { ELEVENLABS_CONFIG } from "./config";
import { uploadAudioBuffer } from "./minio-client";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export interface SFXGenerateParams {
  prompt: string;
  /** 0.5 – 22 saniye; undefined = otomatik */
  durationSeconds?: number;
}

export interface SFXGenerateResult {
  audioUrl: string;
  durationSeconds: number;
}

export class ElevenLabsProvider {
  readonly name = "elevenlabs" as const;

  async isAvailable(): Promise<boolean> {
    return Boolean(ELEVENLABS_API_KEY);
  }

  async generate(params: SFXGenerateParams): Promise<SFXGenerateResult> {
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY not set. Starter plan ($5/mo) required.");
    }

    const cfg = ELEVENLABS_CONFIG;

    const body: Record<string, unknown> = {
      text:             params.prompt,
      prompt_influence: cfg.promptInfluence,
    };
    if (params.durationSeconds) {
      body.duration_seconds = params.durationSeconds;
    }

    // ElevenLabs → binary audio/mpeg
    const response = await axios.post<ArrayBuffer>(
      `${cfg.baseUrl}${cfg.sfxEndpoint}`,
      body,
      {
        headers: {
          "xi-api-key":   ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout:      cfg.timeoutMs,
      },
    );

    const buffer = Buffer.from(response.data);

    // Duration tahmini: bytes / (bitrate_kbps * 1000 / 8)
    const estimatedDuration = params.durationSeconds
      ?? Math.round(buffer.length / (cfg.bitrateKbps * 1000 / 8));

    const audioUrl = await uploadAudioBuffer(buffer, "sfx", cfg.outputFormat, "audio/mpeg");

    return { audioUrl, durationSeconds: estimatedDuration };
  }
}
