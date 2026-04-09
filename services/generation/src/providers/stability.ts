// Stability Audio (StableAudio) — budget music generation
// Docs: https://platform.stability.ai/docs/api-reference#tag/Generate/paths/~1v2beta~1stable-audio~1generate/post
import axios from "axios";
import * as Minio from "minio";
import FormData from "form-data";

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const MINIO_ENDPOINT    = process.env.MINIO_ENDPOINT    || "minio";
const MINIO_PORT        = parseInt(process.env.MINIO_PORT || "9000");
const MINIO_ACCESS_KEY  = process.env.MINIO_ACCESS_KEY  || "minioadmin";
const MINIO_SECRET_KEY  = process.env.MINIO_SECRET_KEY  || "minioadmin";
const MINIO_USE_SSL     = process.env.MINIO_USE_SSL === "true";
const MINIO_BUCKET      = process.env.MINIO_BUCKET      || "sonaralabs-audio";

const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

export class StabilityAudioProvider {
  readonly name = "stability" as const;

  async isAvailable(): Promise<boolean> {
    return Boolean(STABILITY_API_KEY);
  }

  async generate(
    prompt: string,
    duration: number,
    style: string,
    mood: string,
  ): Promise<string> {
    if (!STABILITY_API_KEY) {
      throw new Error("STABILITY_API_KEY not set.");
    }

    const enrichedPrompt = `${prompt} ${style} music, ${mood} atmosphere for game`;

    const form = new FormData();
    form.append("prompt",         enrichedPrompt);
    form.append("seconds_total",  String(duration));
    form.append("steps",          "50");
    form.append("output_format",  "mp3");

    // Stability AI StableAudio endpoint
    const response = await axios.post(
      "https://api.stability.ai/v2beta/stable-audio/generate",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${STABILITY_API_KEY}`,
          Accept: "audio/*",
        },
        responseType: "arraybuffer",
        timeout: parseInt(process.env.JOB_TIMEOUT_MS || "300000"),
      }
    );

    const audioBuffer = Buffer.from(response.data);

    // Upload to MinIO
    const objectName = `music/${Date.now()}-stability-${Math.random().toString(36).slice(2)}.mp3`;
    await minioClient.putObject(MINIO_BUCKET, objectName, audioBuffer, audioBuffer.length, {
      "Content-Type": "audio/mpeg",
    });

    return `http://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET}/${objectName}`;
  }
}
