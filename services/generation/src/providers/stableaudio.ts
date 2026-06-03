/**
 * providers/stableaudio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stable Audio via the official HuggingFace Space (stabilityai/stable-audio-3),
 * çağrılır Gradio /call REST API + SSE ile. ZeroGPU üzerinde çalışır.
 *
 * Neden bu yol: HF serverless inference müzik modeli barındırmıyor; ücretsiz
 * API'ler (Segmind/Replicate/Suno) kredi/kart istiyor. Bu Space ise geçerli bir
 * HF token'la ZeroGPU günlük ücretsiz kotasından çalışır — ek ücret yok.
 *
 * Flow:
 *   1. POST {spaceUrl}/gradio_api/call/infer  body {data:[variant,prompt,dur,steps,cfg,sampler,seed]}
 *        Header: Authorization: Bearer <HF token>  → { event_id }
 *   2. GET  {spaceUrl}/gradio_api/call/infer/{event_id}  (SSE)
 *        "event: complete" → data:[{ url|path }]  → WAV dosya URL'i
 *   3. WAV'ı indir → MinIO'ya yükle → public URL döndür
 *
 * Hata politikası: tüm Space/HTTP/kota hataları `.response.status` taşıyacak
 * şekilde fırlatılır → isInfrastructureError bunları yakalar → kredi iade edilir.
 */
import axios from "axios";
import { STABLEAUDIO_CONFIG, STYLE_PROMPTS, MOOD_PROMPTS } from "./config";
import { uploadAudioBuffer } from "./minio-client";

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

/**
 * Kullanıcı prompt'unu + seçilen tür/mood'u + oyun-müziği çerçevesini birleştirip
 * Stable Audio için zengin, betimleyici bir prompt üretir. Boş/yinelenen parçalar
 * atlanır; çıktı ~500 karaktere kısaltılır (Stable Audio uzun prompt'ta zayıflar).
 */
export function buildGameMusicPrompt(prompt: string, style: string, mood: string): string {
  const lower = prompt.toLowerCase();
  const parts = [prompt.trim()];
  const styleDesc = STYLE_PROMPTS[style];
  const moodDesc  = MOOD_PROMPTS[mood];
  // Aynı kelime promptta zaten varsa tekrar ekleme (örn. "ambient ambient")
  if (styleDesc && !lower.includes(style)) parts.push(styleDesc);
  if (moodDesc  && !lower.includes(mood))  parts.push(moodDesc);
  parts.push(STABLEAUDIO_CONFIG.promptSuffix);
  return parts.filter(Boolean).join(". ").replace(/\s+/g, " ").trim().slice(0, 500);
}

/** isInfrastructureError'ın yakalaması için `.response.status` taşıyan hata üretir. */
function infraError(status: number, msg: string): Error {
  const e = new Error(`StableAudio: ${msg}`) as Error & { response?: { status: number } };
  e.response = { status };
  return e;
}

/** İç içe yanıtta ilk url/path alanını bulur (Gradio FileData). */
function findFile(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const v of node) { const r = findFile(v); if (r) return r; }
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.url === "string" && o.url) return o.url;
    if (typeof o.path === "string" && o.path) return o.path;
    for (const v of Object.values(o)) { const r = findFile(v); if (r) return r; }
  }
  return null;
}

export class StableAudioProvider {
  readonly name = "stableaudio" as const;

  async isAvailable(): Promise<boolean> {
    return Boolean(HF_API_KEY);
  }

  async generate(prompt: string, duration: number, style: string, mood: string): Promise<string> {
    if (!HF_API_KEY) throw new Error("HUGGINGFACE_API_KEY not set");

    const cfg  = STABLEAUDIO_CONFIG;
    const base = process.env.STABLE_AUDIO_SPACE_URL || cfg.spaceUrl;
    const auth = { Authorization: `Bearer ${HF_API_KEY}` };
    const dur  = Math.min(Math.max(Math.round(duration) || 30, 1), cfg.maxDuration);
    const fullPrompt = buildGameMusicPrompt(prompt, style, mood);

    // ── 1. Üretimi başlat → event_id ─────────────────────────────────────────
    const data = [cfg.variant, fullPrompt, dur, cfg.steps, cfg.cfgScale, cfg.sampler, 0];
    const postRes = await fetch(`${base}/gradio_api/call/${cfg.fn}`, {
      method:  "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body:    JSON.stringify({ data }),
    });
    if (!postRes.ok) throw infraError(postRes.status, `submit failed (HTTP ${postRes.status})`);
    const submitBody = await postRes.json().catch(() => ({})) as { event_id?: string };
    const eventId = submitBody.event_id;
    if (!eventId) throw infraError(502, "no event_id in response");

    // ── 2. Sonucu SSE ile bekle → dosya URL'i ────────────────────────────────
    const fileRef = await this.streamResult(`${base}/gradio_api/call/${cfg.fn}/${eventId}`, auth);

    // ── 3. WAV'ı indir → MinIO'ya yükle ──────────────────────────────────────
    const dlUrl = fileRef.startsWith("http") ? fileRef : `${base}/gradio_api/file=${fileRef}`;
    let buffer: Buffer;
    try {
      const audioRes = await axios.get<ArrayBuffer>(dlUrl, {
        responseType: "arraybuffer", headers: auth, timeout: cfg.timeoutMs,
      });
      buffer = Buffer.from(audioRes.data);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status ?? 502;
      throw infraError(status, "audio download failed");
    }
    if (buffer.length < 1024) throw infraError(502, "downloaded file too small to be audio");

    return uploadAudioBuffer(buffer, "music", cfg.outputFormat, cfg.contentType);
  }

  /** Gradio SSE akışını okur; "complete" → dosya URL'i, "error" → infra hata. */
  private async streamResult(url: string, auth: Record<string, string>): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STABLEAUDIO_CONFIG.timeoutMs);
    try {
      const res = await fetch(url, { headers: auth, signal: controller.signal });
      if (!res.ok || !res.body) throw infraError(res.status || 502, `stream failed (HTTP ${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let event = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (event === "complete") {
              const file = findFile(JSON.parse(payload));
              if (file) return file;
              throw infraError(502, "complete event had no audio file");
            }
            if (event === "error") {
              // ZeroGPU kota/Space hatası → 503 (geçici/infra) → kredi iade
              throw infraError(503, `space error ${payload.slice(0, 160)}`);
            }
          }
        }
      }
      throw infraError(504, "stream ended without result (timeout/queue)");
    } catch (err) {
      if ((err as Error).name === "AbortError") throw infraError(504, "timeout");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
