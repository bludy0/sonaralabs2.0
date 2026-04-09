// ElevenLabs Sound Effects API — SFX generation
// Requires Starter plan ($5/mo) or higher.
// Docs: https://elevenlabs.io/docs/api-reference/sound-generation
import axios from "axios";
import * as Minio from "minio";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const MINIO_ENDPOINT     = process.env.MINIO_ENDPOINT     || "minio";
const MINIO_PORT         = parseInt(process.env.MINIO_PORT || "9000");
const MINIO_ACCESS_KEY   = process.env.MINIO_ACCESS_KEY   || "minioadmin";
const MINIO_SECRET_KEY   = process.env.MINIO_SECRET_KEY   || "minioadmin";
const MINIO_USE_SSL      = process.env.MINIO_USE_SSL === "true";
const MINIO_BUCKET       = process.env.MINIO_BUCKET       || "sonaralabs-audio";

const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

export interface SFXGenerateParams {
  prompt: string;
  durationSeconds?: number; // 0.5 – 22 seconds, defaults to auto
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

    const body: Record<string, unknown> = {
      text: params.prompt,
      prompt_influence: 0.3,
    };
    if (params.durationSeconds) {
      body.duration_seconds = params.durationSeconds;
    }

    // API returns audio/mpeg binary
    const response = await axios.post(
      "https://api.elevenlabs.io/v1/sound-generation",
      body,
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 60_000,
      }
    );

    const audioBuffer = Buffer.from(response.data);

    // Estimate duration from content-length if not known
    // ElevenLabs returns mp3 at 44.1kHz, ~128kbps → bytes / (128000 / 8)
    const estimatedDuration = params.durationSeconds
      ?? Math.round(audioBuffer.length / (128000 / 8));

    // Upload to MinIO
    const objectName = `sfx/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    await minioClient.putObject(MINIO_BUCKET, objectName, audioBuffer, audioBuffer.length, {
      "Content-Type": "audio/mpeg",
    });

    const audioUrl = `http://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET}/${objectName}`;
    return { audioUrl, durationSeconds: estimatedDuration };
  }
}
