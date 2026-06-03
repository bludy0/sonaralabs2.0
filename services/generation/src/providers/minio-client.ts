/**
 * providers/minio-client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tek MinIO client instance'ı — tüm provider'lar buradan import eder.
 * Dev'de localhost:9000 (Homebrew), prod'da Docker/B2.
 */
import * as Minio from "minio";

const MINIO_ENDPOINT   = process.env.MINIO_ENDPOINT  || "localhost";
const MINIO_PORT       = parseInt(process.env.MINIO_PORT || "9000");
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "minioadmin";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "minioadmin";
const MINIO_USE_SSL    = process.env.MINIO_USE_SSL === "true";

// Browser-accessible base URL (bucket has anonymous-download policy).
// Dev: localhost:9000 (Docker port-mapped). Prod: set MINIO_PUBLIC_URL to CDN/B2.
const MINIO_PUBLIC_BASE = process.env.MINIO_PUBLIC_URL
  ?? `http://localhost:${MINIO_PORT}`;

export const MINIO_BUCKET = process.env.MINIO_BUCKET || "sonaralabs-audio";

export const minioClient = new Minio.Client({
  endPoint:  MINIO_ENDPOINT,
  port:      MINIO_PORT,
  useSSL:    MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

/**
 * Audio bucket'ının var olduğundan ve anonim-download policy'sine sahip olduğundan
 * emin olur. Docker'da `createbuckets` init container bunu yapar; host dev'de
 * (scripts/dev.sh) yapılmaz — bu yüzden generation boot'ta çağrılır.
 * Idempotent: bucket varsa yalnızca policy'yi (tekrar) uygular.
 */
export async function ensureAudioBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(MINIO_BUCKET).catch(() => false);
  if (!exists) await minioClient.makeBucket(MINIO_BUCKET, "us-east-1");
  const policy = {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow", Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${MINIO_BUCKET}/*`],
    }],
  };
  await minioClient.setBucketPolicy(MINIO_BUCKET, JSON.stringify(policy));
}

/** Üretilen audio dosyasını MinIO'ya yükler ve public URL döner */
export async function uploadAudioBuffer(
  buffer: Buffer,
  folder: "music" | "sfx",
  ext: "mp3" | "ogg" | "wav" | "flac",
  contentType: string,
): Promise<string> {
  const objectName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await minioClient.putObject(MINIO_BUCKET, objectName, buffer, buffer.length, {
    "Content-Type": contentType,
  });
  return `${MINIO_PUBLIC_BASE}/${MINIO_BUCKET}/${objectName}`;
}
