# generation — :3002 (Express) · collection: `generations`

> Tek doğru kaynak: [`docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md) §5.3.
> Eski notification servisi (:3007) buraya taşındı — SSE (`GET /stream`) burada.

- Üretim: müzik (`POST /`), SFX (`/sfx`, ElevenLabs), görüntü→prompt (`/analyze-image`, Gemini), MIDI (`/midi`), mastering önerisi (`/master`), export (`/export`, `/export/file` → FFmpeg `execFile`).
- **Provider Pattern** (`src/providers/`): `IMusicProvider` + Map kaydı. Aktif: `stableaudio` (HF ZeroGPU, ücretsiz ama site-geneli ~3-4 üretim/gün). `beatoven`/`sonauto` key geçersiz → kapalı; `lyria` kapalı. Yeni provider = yeni dosya + map'e 1 satır.
- BullMQ: kuyruk `generation`, `attempts: 1` (retry manuel, `POST /:id/retry` yarı kredi, atomik status geçişi), worker concurrency 3.
- Kredi iadesi: yalnızca altyapı hatalarında (`isInfrastructureError` — 401/402/403/404/429/5xx, ECONNREFUSED). Prompt/içerik hatasında iade yok.
- Export SSRF guard: yalnızca kendi MinIO/bucket URL'leri (`isOwnAudioUrl`).
- `x-internal-token` doğrulaması: `getPayload(req)` + `_internal: true` kontrolü.
