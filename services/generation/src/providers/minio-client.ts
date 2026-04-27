/**
 * providers/minio-client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tek MinIO client instance'ı — tüm provider'lar buradan import eder.
 * Dev'de localhost:9000 (Homebrew), prod'da Docker/B2.
 */
import * as Minio from "minio";

const MINIO_ENDPOINT  = process.env.MINIO_ENDPOINT  || "localhost";
const MINIO_PORT      = parseInt(process.env.MINIO_PORT || "9000");
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "minioadmin";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "minioadmin";
const MINIO_USE_SSL   = process.env.MINIO_USE_SSL === "true";

export const MINIO_BUCKET = process.env.MINIO_BUCKET || "sonaralabs-audio";

export const minioClient = new Minio.Client({
  endPoint:  MINIO_ENDPOINT,
  port:      MINIO_PORT,
  useSSL:    MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

/** Üretilen audio dosyasını MinIO'ya yükler ve public URL döner */
export async function uploadAudioBuffer(
  buffer: Buffer,
  folder: "music" | "sfx",
  ext: "mp3" | "ogg" | "wav",
  contentType: string,
): Promise<string> {
  const objectName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await minioClient.putObject(MINIO_BUCKET, objectName, buffer, buffer.length, {
    "Content-Type": contentType,
  });
  // Dev: http, Prod: MINIO_USE_SSL=true → https
  const proto = MINIO_USE_SSL ? "https" : "http";
  return `${proto}://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET}/${objectName}`;
}
