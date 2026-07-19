# Sonaralabs 2.0 — Proje Kılavuzu

> **Bu dosya kod tabanının gerçek durumundan üretilmiştir ve tek doğru kaynaktır.**
> Servis-içi `services/*/CLAUDE.md` dosyaları bu kılavuza (ilgili §) atıf yapacak
> şekilde güncellenmiştir — onlara güvenebilirsin. Yalnızca üst klasördeki eski
> proje dokümanı (`/Users/bludy/PROJECTS/Sonaralabs/.claude/CLAUDE.md`, eski 8-servisli
> MVP) güncel değildir. Çelişki olursa bu dosya ve kaynak kod esas alınmalıdır.
> Eski ↔ yeni farkları için bkz. [§12 Mimari Geçmişi](#12-mimari-geçmişi--neyin-değiştiği).

---

## 1. Proje Nedir?

Sonaralabs, oyun geliştiriciler için **AI destekli web tabanlı müzik üretim
platformudur**. Kullanıcılar metin promptu veya oyun ekran görüntüsü ile müzik
loopu / ses efekti (SFX) üretir, tarayıcıda çalışan bir DAW'da (Digital Audio
Workstation) düzenler, ve diğer kullanıcılarla sosyal olarak paylaşır.

**Tek cümlelik hedef:** Bir oyun geliştirici 10 dakika içinde oyununa uygun bir
müzik loopu üretip export edebilmeli.

Üç ana yetenek katmanı:
1. **Üretim** — Stable Audio (müzik, HF ZeroGPU ücretsiz; Beatoven/Sonauto geçici kapalı), ElevenLabs (SFX), Gemini (görüntü→prompt, MIDI, mastering önerisi)
2. **DAW Studio** — tarayıcı içi çok kanallı düzenleyici (Web Audio API, MIDI piano roll, efektler, export)
3. **Sosyal** — profil, public track yayını, beğeni, takip, aktivite feed'i

---

## 2. Monorepo Yapısı

pnpm workspace + Turborepo. Üç workspace kökü: `services/*`, `apps/*`, `packages/*`.

```
sonaralabs2.0/
├── package.json              # pnpm@10, turbo script'leri
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml        # tüm stack (dev)
├── .env / .env.example       # tüm servisler tek .env'den okur (--env-file)
├── docs/
│   ├── openapi.yaml          # Swagger spec (gateway /api/docs altında serve edilir)
│   └── PROJECT-GUIDE.md      # ← bu dosya
├── packages/
│   ├── types/                # @sonaralabs/types — tüm servislerin paylaştığı tipler
│   └── daw-studio/           # @sonaralabs/daw-studio — tarayıcı içi DAW (React paketi)
├── apps/
│   └── web/                  # React 18 + Vite frontend (Railway web servisi)
├── services/
│   ├── gateway/              # :3000 — Hono, tüm /api/* tek giriş
│   ├── auth/                 # :3001 — auth + KREDİ + Stripe + email (Express)
│   ├── generation/           # :3002 — AI üretim + BullMQ + Redis Pub/Sub SSE + DAW yardımcıları (Express)
│   ├── upload/               # :3003 — ses yükleme + MinIO + kota (Express)
│   ├── library/              # :3004 — kütüphane + koleksiyon + DAW projeleri (Express)
│   ├── admin/                # :3006 — salt-okuma istatistik paneli (Express)
│   └── social/               # :3009 — profil + track + takip + feed (Hono)
├── scripts/                  # seed-demo, clean-demo, backup-mongodb
└── tests/e2e/                # Playwright smoke testleri
```

**Önemli:** `:3005` (eski credit), `:3007` (eski notification), `:3008` (eski profile)
**artık yok** — başka servislere taşındılar.

---

## 3. Mimari — Genel Bakış

```
                Tarayıcı (apps/web, React+Vite)
                    │  withCredentials: true (httpOnly cookie)
                    ▼
        ┌───────────────────────────┐
        │  API Gateway :3000 (Hono)  │  ← TÜM /api/* trafiği buradan geçer
        │  - user JWT doğrula        │
        │  - internal JWT üret (5dk) │
        │  - rate limit, CORS        │
        │  - /internal/* → 403       │
        └───────────────────────────┘
            │ x-internal-token (5dk INTERNAL_JWT_SECRET)
   ┌────────┼─────────┬──────────┬──────────┬──────────┐
   ▼        ▼         ▼          ▼          ▼          ▼
 auth   generation  upload    library    admin      social
 :3001    :3002     :3003      :3004      :3006      :3009
 (+kredi  (+SSE     (MinIO)   (+DAW      (salt-     (Hono,
 +Stripe  +BullMQ            projeleri) okuma)     +avatar
 +email)  +Gemini)                                  MinIO)

Altyapı: MongoDB 7 (Atlas) | Redis 7 + BullMQ | MinIO (dev) / Backblaze B2 (prod)
AI:      Stable Audio (HF ZeroGPU) · ElevenLabs · Gemini (Flash/vision/midi/mastering) · Beatoven/Sonauto (kapalı)
Ödeme:   Stripe Checkout (auth servisinde)
```

### Veri akışı kuralı
Her servis **yalnızca kendi MongoDB collection'larına** yazar. Başka servisin
verisine `/internal/*` HTTP endpoint'leri üzerinden, `x-internal-token` ile erişir.
**İstisna:** `admin` servisi tüm collection'ları `strict:false` salt-okuma model
ile doğrudan okur (yazmaz — sadece `PATCH /users/:id/role` yazar).

---

## 4. Güvenlik Modeli — Kritik Kurallar

### 4.1 İki katmanlı JWT
```
Client → [access_token cookie, 15dk, ACCESS_JWT_SECRET]  → Gateway
Gateway → [x-internal-token, 5dk, INTERNAL_JWT_SECRET]    → downstream servis
```
- **3 ayrı secret, asla aynı olamaz:** `ACCESS_JWT_SECRET`, `REFRESH_JWT_SECRET`, `INTERNAL_JWT_SECRET`
- Her downstream servis `getPayload(req)` helper'ı ile `x-internal-token`'ı doğrular
- Internal token'da `_internal: true` flag'i var; servisler bunu kontrol eder (VULN-13)

### 4.2 /internal/* dışarıya kapalı
Gateway, path'in herhangi bir segmentinde `internal` geçen istekleri 403'le reddeder
(regex: `/(^|\/)internal(\/|$)/`). Bu, prefix-stripping catch-all route'ların
(`/api/generate/*`) bir internal endpoint'e geçerli token ile proxy yapmasını
engeller — **IDOR koruması** (en son commit'te eklendi).

### 4.3 Cookie'ler
- `access_token` (15dk) ve `refresh_token` (7gün) — ikisi de `httpOnly`
- Prod'da `secure: true` + `sameSite: "none"` (web↔gateway farklı domain ise)
- Dev'de `secure: false` + `sameSite: "strict"`
- `refresh_token` cookie `path: /api/auth` ile sınırlı

### 4.4 Rate limit (gateway, Redis sayaç)
| Endpoint | Limit | Pencere | Key |
|----------|-------|---------|-----|
| Genel | 30 | 1 dk | userId (yoksa IP) |
| POST /api/generate, /sfx, /analyze-image | 3 | 1 dk | userId |
| POST /api/upload | 10 | 1 dk | userId |
| /api/auth/* (public) | 10 | 15 dk | gerçek bağlantı IP'si |
| POST /api/generate/export(/file) | 3 | 1 dk | userId |

IP, local/doğrudan bağlantıda `getConnInfo` ile gerçek soketten alınır. Production'da
`TRUST_PROXY_HOPS` kadar trusted proxy varsa `X-Forwarded-For` zinciri sağdan okunur;
client'ın zincirin soluna eklediği sahte değer rate-limit key olamaz. Redis kesilirse
gateway tamamen limitsiz kalmak yerine instance-içi fallback sayaç kullanır.

### 4.5 Diğer önemli korumalar
- **Brute-force:** 5 başarısız login → 15 dk hesap kilidi (`lockoutUntil`)
- **Timing oracle:** kullanıcı yoksa bile bcrypt dummy hash karşılaştırılır (VULN-19)
- **Enumeration:** register/forgot/resend hep generic yanıt döner
- **Open redirect:** Stripe success/cancel URL'leri `FRONTEND_URL` ile başlamalı (VULN-12)
- **Dosya uzantısı:** MIME tipinden türetilir, `originalname`'e güvenilmez (VULN-15)
- **Body limit:** auth 16kb, generation 15mb, library 3mb
- **waveformData:** max 2000 eleman cap (VULN-09)
- **ObjectId doğrulama:** tüm `/:id` route'larda 24-hex regex
- **FFmpeg:** `execFile` (shell yok) — komut enjeksiyonu yok
- Detaylı liste: kökteki `SECURITY-NOTES.md` (gitignore'da, commit edilmez)

---

## 5. Servisler — Detaylı

### 5.1 gateway — :3000 (Hono)
`services/gateway/src/createApp.ts` saf, test edilebilir app factory'dir
(bağımlılıklar inject edilir). `index.ts` Redis + env'i bağlar.

- **Sorumluluk:** routing, user JWT doğrula → internal JWT üret, rate limit, CORS, secure headers, `/internal/*` engelle
- **Public route'lar (JWT gerekmez):** register, login, refresh, verify-email, resend-verification, forgot/reset-password, `/api/generate/capabilities`, public profil/track/explore, share token'lı projeler
- **API dokümanı:** `GET /api/docs` (Swagger UI) → `GET /api/openapi.yaml`
- Tüm routing tablosu `createApp.ts` içindedir — endpoint eklerken oraya bak.

### 5.2 auth — :3001 (Express) · collection: `users`, `refresh_tokens`, `credit_logs`
**Eski auth + credit servislerinin birleşimi.** Stripe + email burada.

Auth/kullanıcı:
- `POST /register` → user oluştur, email onay token'ı, `INITIAL_CREDIT_BALANCE` (default 100) kredi
- `GET /verify-email?token=` → onayla + otomatik giriş (cookie set)
- `POST /resend-verification`, `/forgot-password`, `/reset-password`
- `POST /login` → brute-force + email-onay kontrolü; giriş bildirim maili
- `POST /refresh` → token rotation (eski sil, yeni üret)
- `POST /logout` / `POST /logout-all` (internal token ile, tüm cihazlar)
- `GET /me`, `PATCH /me/preferences` (accentColor hex), `PATCH /me/password`, `DELETE /me`
- `GET /internal/users/:id` → diğer servisler için

Kredi (eski credit servisi):
- `GET /credits/balance`, `GET /credits/history` (sayfalı)
- `POST /credits/spend` (atomik `findOneAndUpdate` + `$gte` — race-condition'sız), `POST /credits/earn`
- `POST /credits/purchase` → Stripe Checkout session
- `POST /credits/webhook` → Stripe imza doğrulama (**raw body**); checkout session ID atomik/idempotent işlenir
- `GET /credits/packages`, `GET /internal/credit-logs`

Kredi paketleri: `pack_100` ($4.99), `pack_500` ($19.99), `pack_1200` ($39.99).

Email: nodemailer; SMTP yapılandırılmamışsa console'a yazar (dev). SMTP varsa
email onayı login için **zorunlu** olur (`EMAIL_ENABLED`).

### 5.3 generation — :3002 (Express) · collection: `generations`
**Eski generation + notification servislerinin birleşimi.** SSE burada.

- `POST /` → müzik üretimi başlat (202, jobId döner). Gövdede artık müzik metrikleri gönderilebilir: `bpm`, `key`, `scale`, `timeSignature`, `intensity`, `loop`.
- `POST /sfx` → ElevenLabs SFX üretimi
- `POST /analyze-image` → Gemini Flash görüntü→prompt (1 kredi, hata olursa iade)
- `POST /midi` → Gemini ile MIDI melodi üret (1 kredi, max 32 nota)
- `POST /master` → Gemini mastering önerileri (kredisiz, DAW Studio kullanır)
- `POST /export` → `{ audioUrl, format }` (MinIO kaynağı → FFmpeg). Format: wav/mp3/ogg/flac/aac. SSRF guard: yalnızca kendi MinIO/bucket URL'leri (`isOwnAudioUrl`)
- `POST /export/file` → multipart `wav` + `format` (editörde kırpılmış buffer → FFmpeg dönüşümü, 25MB)
- `GET /history` → üretim geçmişi (sayfalı, status/type filtre)
- `GET /stats` → kişisel dashboard istatistikleri (aggregate'ler)
- `GET /capabilities` → hangi provider'lar aktif (frontend disable için, 60s cache)
- `POST /:id/retry` → başarısız üretimi yarı kredi ile tekrar (atomik status geçişi)
- `PATCH /:id/analysis` → frontend'in hesapladığı `bpm`, `waveformData` (max 2000 eleman) ve isteğe bağlı `key`/`scale` güncellemesi
- `DELETE /:id` → kendi üretimini sil (aktif job silinemez)
- `GET /stream` → **SSE** (gateway `/api/notify/stream` → buraya proxy). Instance'lar Redis Pub/Sub üzerinden olay paylaşır; Redis bus hazır değilse local fallback kullanılır.
- internal: `GET/DELETE /internal/generations`, `PATCH /internal/generations/:id/favorite`

**Provider Pattern** (`providers/`): `IMusicProvider` arayüzü, `Map`'te kayıt.
Çalışan: **`stableaudio`** — Stability AI'ın `stabilityai/stable-audio-3` HF Space'i,
Gradio `/call` REST API + SSE ile, HF **ZeroGPU** günlük ücretsiz kotasından (HF token gerekir,
ek ücret yok). `prompt` style/mood/**metrikler** ile zenginleştirilir (`buildGameMusicPrompt`,
`GenerationOptions` ile `bpm`/`key`/`scale`/`timeSignature`/`intensity`/`loop` bilgisi sağlanır).
`beatoven`/`sonauto` map'te kayıtlı ama .env key'leri geçersiz → frontend'de "Geçici olarak
kapalı". `lyria` kapalı (Gemini Lyria-3 erişilebilir ama ücretsiz kota = 0, billing ister).
SFX: `ElevenLabsProvider`. Yeni provider = yeni dosya + map'e 1 satır.

> ⚠️ **ZeroGPU limiti:** ücretsiz kota ~210 GPU-sn/gün, çağrı başına ~60sn rezerve →
> **günde ~3-4 üretim, tüm site için paylaşımlı** (tek HF token). Çok kullanıcılı üretim için
> HF PRO, kullanıcı-başına token veya ücretli API gerekir. Kota dolunca space `error` döner →
> `providerErrorMessage` net "Günlük ücretsiz GPU kotası doldu" mesajı verir, kredi iade edilir.

**BullMQ:** kuyruk `generation`, `{ attempts: 1, removeOnComplete: 100, removeOnFail: 200 }`,
worker concurrency 3, lock = `JOB_TIMEOUT_MS + 10s`. Retry manueldir.

**Kredi iadesi mantığı** (`isInfrastructureError`):
- Altyapı hatası (401/402/403/404/429/5xx, ECONNREFUSED vb.) → **kredi iade edilir**
- Prompt/içerik hatası → iade **yok**

### 5.4 upload — :3003 (Express) · collection: `uploads` (+ `users.storageUsed` yazar)
- `POST /` → multer **disk** storage → MinIO'ya stream (heap'e yüklemez)
- Kabul: WAV/MP3/OGG, max 50MB, kullanıcı kotası 500MB
- **Atomik kota:** `findOneAndUpdate` + `$expr: $lte` tek sorguda (race-condition'sız)
- MinIO başarısızsa kota geri alınır (rollback)
- `PATCH /:id/analysis` → frontend'in hesapladığı `bpm` ve `waveformData` (max 2000 eleman) güncellemesi
- `DELETE /:id` → MinIO'dan sil + kota iade
- internal: `GET /internal/uploads`, `DELETE /internal/uploads/:id`, `PATCH /internal/uploads/:id/favorite`

### 5.5 library — :3004 (Express) · collection: `collections`, `daw_projects`
Kendi generations/uploads'a **yazmaz** — HTTP internal ile çeker.

- `GET /` → generations + uploads birleşik liste (her servisten max 200 çek, in-memory birleştir/filtrele/sayfala). favorites/type/q filtreleri.
- `PATCH /:model/:id/favorite`, `DELETE /:model/:id` → ilgili servise proxy
- Koleksiyonlar: `GET/POST /collections`, `GET/PATCH/DELETE /collections/:id`, `POST/DELETE /collections/:id/items[/:refId]`
- **DAW Projeleri** (`daw_projects`): `GET/POST /projects`, `GET/PUT/DELETE /projects/:id`, `POST /projects/:id/share` (public share token toggle), `GET /projects/share/:token` (public). Serialize limit 2MB.

### 5.6 admin — :3006 (Express) · salt-okuma
İki katmanlı koruma: gateway `requireAdmin` + servis içi `requireAdmin` middleware.
Tüm collection'ları `strict:false` salt-okuma model ile okur.
- `GET /stats`, `GET /stats/daily`, `GET /users`, `GET /users/:id`, `GET /generations`
- `PATCH /users/:id/role` → tek yazma işlemi (user ↔ admin)

### 5.7 social — :3009 (Hono) · collection: `profiles`, `public_tracks`, `follows`, `track_likes`, `feed_events`
**Eski profile + social servislerinin birleşimi.** PostgreSQL kaldırıldı, hepsi MongoDB.

- Profil: `GET /profile/me` (yoksa oluştur), `PUT /profile/me`, `POST /profile/me/avatar` (MinIO, 5MB), `GET /profile/:username` (public), `GET /profile/internal/:userId`
- Track: `POST /tracks` (yayınla — username **profilden** alınır, client'a güvenilmez, VULN-11), `GET /tracks` (explore, filtre), `GET/DELETE /tracks/:id`, `POST /tracks/:id/like` (toggle, E11000 ile)
- Takip: `POST /follow/:userId` (toggle), `GET /followers`, `/following`, `GET /follow/:userId/status`
- Feed: `GET /feed` (Redis 15dk cache), `GET /my-tracks`
- `GET /sse` → sosyal olaylar SSE (follow/like/publish fan-out); yatay ölçeklemede Redis Pub/Sub tüm instance'lara dağıtır

---

## 6. Paylaşılan Tipler — `packages/types`

`@sonaralabs/types` tüm servislerin import ettiği tek kaynak. İçerir:
JWT payload'lar, `ApiResponse<T>`, generation/SFX request tipleri, SSE event'leri,
social tipleri (`UserProfile`, `PublicTrack`, `FeedEvent`), ve **kredi maliyet tabloları**:

```
MUSIC_CREDIT_COST   stableaudio: hep 1 (flat) | beatoven: 15→3 30→5 60→8 | lyria: 15→2 30→3 60→5 | sonauto: hep 5
MusicStyle (18)     ambient action adventure puzzle horror platformer orchestral chiptune synthwave fantasy boss racing scifi lofi medieval cyberpunk western jrpg
MusicMood (12)      tense calm epic mysterious cheerful heroic melancholic dark energetic dreamy playful triumphant
MusicKey (12)       C C# D D# E F F# G G# A A# B
MusicScale (6)      Major Minor Dorian Phrygian Lydian Mixolydian
TimeSignature       [number, number]
SFX_CREDIT_COST     elevenlabs: 1
getMusicCreditCost(provider, duration, isRetry)  → retry = Math.ceil(base/2)
```

`GenerationRequest` ayrıca isteğe bağlı `loop` (default true), `bpm` (40-300), `key`,
`scale`, `timeSignature` ve `intensity` (0-1) alanlarını içerir. Üretim dökümanı ve upload
dökümanı `waveformData?: number[]` ile `bpm?: number` saklayabilir; backend bunları sadece
günceller, hesaplamaz.

`INTERNAL_TOKEN_HEADER = "x-internal-token"`.

---

## 7. Frontend — `apps/web`

React 18 + Vite + TypeScript + Tailwind + Zustand + react-router + WaveSurfer.js.

- **`lib/api.ts`** — Axios, `withCredentials`, 401 interceptor: otomatik `/api/auth/refresh` + istek kuyruğu; refresh başarısızsa public sayfa değilse `/login`'e yönlendirir.
- **Store'lar:** `useAuthStore`, `useGenerationStore`, `useLibraryStore`, `useThemeStore`, `useI18nStore`
- **Hook'lar:** `useGenerationSSE` (EventSource → onopen'da pending job recovery), `useFixedTheme`
- **Sayfalar:** Welcome, Login, Register, VerifyEmail, Forgot/ResetPassword, **Generate** (müzik metrikleri + SFX formu + waveform önizleme), Library, Dashboard (chart'lar), Admin, **Studio** (DAW, `?projectId=` ile yükleme), Explore, Profile, Feed, Settings
- **Route koruması** (`App.tsx`): `ProtectedRoute` (login gerekli) ve `AdminRoute` (role=admin). `fetchMe()` bitene kadar karar verilmez.
- Public route'lar: `/`, `/login`, `/register`, `/explore`, `/profile/:username`, `/studio/share/:token`
- i18n: `lib/i18n` (TR/EN destekli görünüyor)

---

## 8. DAW Studio — `packages/daw-studio`

Tarayıcıda çalışan tam bir **çok kanallı DAW**, React paketi olarak `apps/web`'in
`/studio` sayfasında kullanılır. Web Audio API tabanlı, sunucu render'ı yok.

- **Engine** (`src/engine/`): `AudioEngine`, `SynthEngine`, `SamplerEngine`, `AutomationEngine`, `TrackNode`, `instruments.ts`
- **Efektler** (`engine/effects/`): EQ, Reverb, Delay, Chorus, Compressor, Limiter
- **UI** (`src/components/`): Timeline (audio/midi clip'ler), PianoRoll (MIDI), Mixer (channel/master strip), EffectsChain panelleri, LoopEditor + WaveformView, AutomationLane, Mastering paneli, Transport
- **Export** (`src/lib/`): `exportMix`, `exportMp3` (lamejs), `renderMixWorker` (web worker). AudioEditor + kuyruk kartı: WAV (client-side) + MP3/OGG/FLAC (`/export` veya `/export/file` üzerinden gateway→FFmpeg)
- **Audio analizi** (`src/lib/audioAnalysis.ts`): `analyzeAudio`, `computeWaveformData` (RMS), `detectBPM`, `mixToMono`. Frontend üretim/upload seslerini tarayıcıda analiz eder.
- **State:** `useDAWStore`, `useAudioEngine` (zustand)
- Projeler library servisinin `daw_projects` collection'ında saklanır (serialize edilmiş track'ler, max 2MB).
- AI yardımcıları: `/api/generate/midi` (MIDI üret), `/api/generate/master` (mastering önerisi)
- Üretim kartından "DAW'da Aç" ile generation sesi otomatik `daw_projects` kaydı oluşturularak
  Studio'ya yüklenir; URL `?projectId=` ile proje ön yüklenebilir.

---

## 9. Altyapı & Ortam Değişkenleri

### Servisler (docker-compose dev)
| Servis | Port (host) | Not |
|--------|-------------|-----|
| gateway | 3000 | dışarıya açık |
| frontend | 5174 | dev |
| mongo | 27017 | dev only — prod'da kapalı |
| redis | 6379 | dev only — prod'da kapalı, `--requirepass` |
| minio | 9000 (S3), 9001 (konsol) | prod'da B2'ye geçilir |

auth/generation/upload/library/admin/social portları host'a bağlanmaz (Docker network içi).

### Kritik env vars (`.env.example`'a bak)
```
ACCESS_JWT_SECRET / REFRESH_JWT_SECRET / INTERNAL_JWT_SECRET   # 3 ayrı 64+ byte hex
MONGO_URI / REDIS_URL
MINIO_ENDPOINT / _PORT / _ACCESS_KEY / _SECRET_KEY / _BUCKET / _PUBLIC_URL / _USE_SSL
STORAGE_QUOTA_BYTES=524288000  MAX_FILE_SIZE_BYTES=52428800
HUGGINGFACE_API_KEY (Stable Audio/ZeroGPU, zorunlu) / GEMINI_API_KEY / ELEVENLABS_API_KEY
BEATOVEN_API_KEY / SONAUTO_API_KEY (opsiyonel; geçerli key gelince frontend'de açılır)
STABLE_AUDIO_SPACE_URL (opsiyonel override, varsayılan stabilityai/stable-audio-3)
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
SMTP_HOST/_PORT/_SECURE/_USER/_PASS  EMAIL_FROM  APP_URL
CLIENT_URL / FRONTEND_URL            # CORS + redirect güvenliği
TRUST_PROXY_HOPS=1                    # Railway gateway reverse proxy hop sayısı
INITIAL_CREDIT_BALANCE=100  JOB_TIMEOUT_MS=300000
RATE_LIMIT_GENERAL/_GENERATION/_UPLOAD/_AUTH
VITE_API_BASE_URL (frontend)  VITE_SENTRY_DSN
```
Prod'da `MINIO_PUBLIC_URL` set edilmezse generation ve upload servisleri başlamayı reddeder.

---

## 10. Geliştirme & Komutlar

```bash
# Lokal — TEK KOMUT (önerilen): altyapı + bağımlılık + tüm servisler + frontend
cp .env.example .env          # düzenle
./scripts/dev.sh              # = pnpm start  (turbo dev --concurrency=15, tarayıcıyı açar)
./scripts/stop.sh             # durdur (--infra ile brew mongo/redis dahil)

# Lokal — Docker ile tüm stack (alternatif)
docker compose up -d          # frontend :5174, api :3000

# Monorepo (turbo) — sadece servisler (altyapıyı sen başlatırsın)
pnpm install
pnpm dev          # tüm servisleri tsx watch ile (her servis --env-file=../../.env)
pnpm build        # turbo build
pnpm typecheck
pnpm lint
pnpm test         # her serviste jest
pnpm test:e2e     # Playwright (tests/e2e)

# Demo verisi
pnpm demo:seed    # scripts/seed-demo.sh
pnpm demo:clean
```

Her servis kendi `jest.config.js` + `src/__tests__/*.test.ts` ile test edilir.
Gateway'in ayrıca `rateLimit.test.ts`'i var.

---

## 11. Deploy

- **Frontend + backend → Railway:** `.github/workflows/ci.yml`, `main` push sonrasında lint/typecheck/test/build/E2E kapılarından geçerek `web`, gateway ve 6 downstream servisi deploy eder.
- Yalnızca `web` ve `gateway` public olmalı; downstream servisler Railway private network'te kalır.
- **DB:** MongoDB Atlas. **Cache/Queue:** Redis. **Storage:** Backblaze B2 (MinIO SDK uyumlu).
- **Email:** Resend (SMTP). Ayrıntı: `DEPLOY.md`.

---

## 12. Mimari Geçmişi — Neyin Değiştiği

Son commit'ler (`git log`) "10 servis → 7'ye konsolidasyon, PostgreSQL kaldırma"
ve "analytics dashboard + güvenlik düzeltmeleri" gösterir. Eski CLAUDE.md'lere
göre değişenler:

| Eski (CLAUDE.md'lerde anlatılan) | Şimdi (gerçek kod) |
|----------------------------------|--------------------|
| `credit` servisi :3005 | **auth** servisine taşındı (`/credits/*`) |
| `notification` servisi :3007 | **generation** servisine taşındı (`/stream` SSE) |
| `profile` servisi :3008 | **social** servisine taşındı |
| PostgreSQL kullanımı | **kaldırıldı** — her şey MongoDB |
| Gateway: `http-proxy-middleware` | **Hono** + native `fetch` proxy |
| Provider: Beatoven + Lyria | **Stable Audio (HF ZeroGPU, ücretsiz)** aktif; Beatoven/Sonauto key geçersiz→kapalı; Lyria ücretli→kapalı; **ElevenLabs SFX** |
| Sadece müzik üretimi | + **SFX, MIDI, mastering, görüntü analizi, DAW Studio** |
| Ödeme yok (stub) | **Stripe Checkout** aktif (auth servisinde) |
| Email yok | **nodemailer** + onay/reset/bildirim mailleri |
| admin "sadece HTTP ile okur" | admin **DB'yi doğrudan salt-okuma** model ile okur |

> **Not:** Kök `CLAUDE.md` ve servis-içi `CLAUDE.md` dosyaları bu gerçekliği
> (7 servis, kredi→auth, notification→generation, profile→social, PostgreSQL yok)
> yansıtacak şekilde güncellenmiştir.
