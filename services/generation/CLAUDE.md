# generation-service — CLAUDE.md

> ⚠️ **Bu dosya eski mimariyi anlatabilir ve güncel olmayabilir.** Güncel ve doğru
> referans: [`/docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md). Çelişki olursa
> PROJECT-GUIDE.md ve kaynak kod esastır.

Port: 3002 | Prefix: `/api/generate/*`
Collection sahibi: `generations`

## Sorumluluk
- AI müzik üretimi (**Stable Audio** / HF ZeroGPU aktif; Beatoven/Sonauto key geçersiz→kapalı, Lyria ücretli→kapalı — Provider Pattern)
- Format dönüşümü + indirme (`/export`, `/export/file` — FFmpeg: wav/mp3/ogg/flac/aac)
- Görüntü analizi (Gemini Flash → müzik promptu)
- BullMQ job kuyruğu ve worker
- SSE durum akışı
- Yeniden üretim (yarı kredi)

## Endpoint'ler
```
POST  /api/generate/analyze-image     ← görüntü analizi, 1 kredi
POST  /api/generate                   ← müzik üretimi başlat
GET   /api/generate/status/:jobId     ← SSE stream
GET   /api/generate/history           ← üretim geçmişi
POST  /api/generate/:id/retry         ← yeniden üret (yarı kredi)
POST  /api/generate/export            ← { audioUrl, format } MinIO kaynağı → FFmpeg (SSRF guard)
POST  /api/generate/export/file       ← multipart wav + format (editör kırpılmış buffer)

GET   /internal/generations           ← library servisi kullanır
```

## Provider Pattern

```typescript
interface IMusicProvider {
  name: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
  isAvailable(): Promise<boolean>;
}

// providers/stableaudio.ts → stabilityai/stable-audio-3 HF Space (Gradio /call + SSE, ZeroGPU)
//   prompt'u style/mood ile zenginleştirir (buildGameMusicPrompt)
//   ⚠️ ücretsiz ZeroGPU kotası ~günde 3-4 üretim (tüm site paylaşımlı, tek HF token)
// providers/beatoven.ts, sonauto.ts → kayıtlı ama .env key geçersiz (kapalı)
// Yeni model = yeni adapter + map'e tek satır
```

## Müzik üretim akışı

```
POST /api/generate
  1. credit servise POST /internal/deduct (kredi düş)
  2. generations kaydı oluştur (status: pending)
  3. BullMQ'ya job ekle
  4. { jobId, generationId, creditCost } döndür (202)

Worker (ayrı process):
  5. adapter.generate() çağır
  6. audioUrl → MinIO/B2'ye yükle (upload servisine HTTP)
  7. generations kaydını güncelle (status: done, audioUrl)
  8. notification servise POST /internal/emit
```

## Image-to-music akışı

```
POST /api/generate/analyze-image
  1. Görüntü formatı ve boyut kontrolü (PNG/JPG/WEBP, ≤10 MB)
  2. credit servise POST /internal/deduct { amount: 1, reason: 'Image analiz' }
  3. Gemini Flash ile analiz → müzik promptu
  4. { suggestedPrompt, creditCost: 1 } döndür
```

## Gemini Flash implementasyonu

```typescript
import { GoogleGenAI } from '@google/genai';

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function analyzeImage(base64: string, mimeType: string): Promise<string> {
  const response = await client.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: `You are a game music director. Analyze this game screenshot.
Interpret the scene's atmosphere, color palette, genre, and emotional tone.
Return ONLY a music generation prompt (max 100 words, English).
No explanations, no labels — just the prompt.` }
      ]
    }]
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}
```

## Lyria implementasyonu

```typescript
// Audio base64 gelir → Buffer → upload servise gönder
const response = await client.models.generateContent({
  model: 'lyria-3',
  contents: [{ parts: [{ text: prompt }] }],
});
const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
const buffer = Buffer.from(base64Audio, 'base64');
// POST http://upload-service:3003/internal/store ile MinIO/B2'ye yükle
```

## Beatoven implementasyonu

```typescript
// Async polling: track oluştur → compose → poll (~15-30s)
// 1. POST /tracks → trackId
// 2. POST /tracks/:id/compose
// 3. GET /tracks/:id → status === 'composed' → download_url
```

## SSE stream

```typescript
// GET /api/generate/status/:jobId
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders();

const interval = setInterval(async () => {
  const state = await job.getState();
  if (state === 'completed') {
    res.write(`data: ${JSON.stringify({ status: 'done', audioUrl, generationId })}\n\n`);
    clearInterval(interval); res.end();
  } else if (state === 'failed') {
    res.write(`data: ${JSON.stringify({ status: 'failed', error: '...' })}\n\n`);
    clearInterval(interval); res.end();
  } else {
    res.write(`data: ${JSON.stringify({ status: 'processing' })}\n\n`);
  }
}, 2000);

req.on('close', () => clearInterval(interval));
```

## Kredi maliyetleri

```typescript
const MUSIC_CREDIT_COST = {
  stableaudio: { 15: 1, 30: 1, 60: 1 },   // flat 1 (ücretsiz ZeroGPU)
  beatoven:    { 15: 3, 30: 5, 60: 8 },
  lyria:       { 15: 2, 30: 3, 60: 5 },
  sonauto:     { 15: 5, 30: 5, 60: 5 },
} as const;
// image-analyze = 1 | retry = Math.ceil(normal / 2)
```

## Desteklenen image formatları
- `image/png`, `image/jpeg`, `image/webp`
- Maks: 10 MB
