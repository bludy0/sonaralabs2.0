# Sonaralabs 2.0

Oyun geliştiriciler için **AI destekli, web tabanlı müzik üretim ve düzenleme platformu.**
Kullanıcılar metin promptu ya da oyun ekran görüntüsünden müzik loopu / ses efekti üretir,
tarayıcıda çalışan bir DAW'da düzenler ve diğer kullanıcılarla paylaşır.

> **Hedef:** Bir oyun geliştirici 10 dakika içinde oyununa uygun bir müzik loopu üretip export edebilmeli.

---

## Tanıtım Videosu

[https://youtu.be/-enEN-Us5RQ](https://youtu.be/-enEN-Us5RQ)

---

## Yetenekler

- **Üretim** — Stable Audio (müzik, HF ZeroGPU ücretsiz), ElevenLabs (SFX), Gemini (görüntü→prompt, MIDI, mastering önerisi)
- **DAW Studio** — tarayıcı içi çok kanallı düzenleyici (Web Audio API, MIDI piano roll, efektler, export)
- **Sosyal** — profil, public track yayını, beğeni, takip, aktivite feed'i

---

## Mimari

```
            Tarayıcı (apps/web — React 18 + Vite)
                │  withCredentials (httpOnly cookie)
                ▼
        API Gateway :3000 (Hono)  ← TÜM /api/* trafiği buradan geçer
                │  x-internal-token (5dk, INTERNAL_JWT_SECRET)
   ┌────────┬───┴────┬────────┬────────┬────────┐
   ▼        ▼        ▼        ▼        ▼        ▼
 auth   generation upload  library  admin    social
 :3001    :3002    :3003   :3004    :3006    :3009
 (+kredi  (+SSE    (MinIO) (+DAW    (salt-   (Hono,
 +Stripe  +BullMQ          proje)  okuma)   +profil)
 +email)  +Gemini)

Altyapı: MongoDB 7 | Redis 7 + BullMQ | MinIO (dev) / Backblaze B2 (prod)
```

**Teknolojiler:** pnpm workspace + Turborepo · TypeScript · Express / Hono · React 18 + Vite +
Tailwind + Zustand · MongoDB (Mongoose) · Redis + BullMQ · Stripe · Playwright

---

## Monorepo Yapısı

```
sonaralabs2.0/
├── apps/web/             # React + Vite frontend (Railway web servisi)
├── packages/
│   ├── types/            # @sonaralabs/types — paylaşılan tipler
│   └── daw-studio/       # @sonaralabs/daw-studio — tarayıcı içi DAW
├── services/
│   ├── gateway/          # :3000 — tüm /api/* tek giriş (Hono)
│   ├── auth/             # :3001 — auth + kredi + Stripe + email
│   ├── generation/       # :3002 — AI üretim + BullMQ + Redis Pub/Sub SSE
│   ├── upload/           # :3003 — ses yükleme + MinIO + kota
│   ├── library/          # :3004 — kütüphane + koleksiyon + DAW projeleri
│   ├── admin/            # :3006 — salt-okuma istatistik paneli
│   └── social/           # :3009 — profil + track + takip + feed
├── scripts/              # seed-demo, clean-demo, backup-mongodb, dev.sh
├── tests/e2e/            # Playwright smoke testleri
└── docs/                 # PROJECT-GUIDE.md (geliştirici referansı), openapi.yaml
```

---

## Hızlı Başlangıç

```bash
# 1. Ortam değişkenleri
cp .env.example .env      # .env'i doldur (JWT secret'ları, AI key'leri vb.)

# 2. Tek komutla başlat (önerilen)
./scripts/dev.sh          # veya: pnpm start
```

`scripts/dev.sh` her şeyi tek komutta yapar: altyapıyı (MongoDB / Redis / MinIO)
ayağa kaldırır, bağımlılıkları kurar (`pnpm install`), tüm servisleri + frontend'i
`turbo dev --concurrency=15` ile başlatır ve hazır olunca tarayıcıyı açar.

```bash
# Durdurmak için (servisler + MinIO)
./scripts/stop.sh         # veya: pnpm stop   ·   altyapı dahil: ./scripts/stop.sh --infra
```

- Frontend: <http://localhost:5174>
- API: <http://localhost:3000>

> Lokal MongoDB host-native `mongod` (localhost:27017, auth yok) bekler.
> Demo verisi için: `pnpm demo:seed` (temizlik: `pnpm demo:clean`).
> Tüm scriptlerin ayrıntısı: [`scripts/README.md`](scripts/README.md).

> **Alternatifler:** `pnpm dev` (sadece servisler, altyapıyı sen başlatırsın) ·
> `docker compose up -d` (tüm stack konteynerde).

---

## Komutlar

| Komut | Açıklama |
|-------|----------|
| `./scripts/dev.sh` / `pnpm start` | **Tek komutla başlat:** altyapı + bağımlılık + tüm servisler + frontend |
| `./scripts/stop.sh` / `pnpm stop` | Servisleri (ve MinIO'yu) durdur (`--infra` ile brew mongo/redis dahil) |
| `pnpm dev` | Sadece servisleri `turbo dev` ile çalıştır (altyapıyı sen başlatırsın) |
| `pnpm build` | Tüm workspace'leri derle (Turbo) |
| `pnpm typecheck` | Tip kontrolü |
| `pnpm lint` | Lint |
| `pnpm test` | Birim testleri |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm demo:seed` / `pnpm demo:clean` | Demo verisi yükle / temizle |

---

## Güvenlik İlkeleri (asla ihlal etme)

1. **Inter-servis auth:** Gateway user JWT'yi doğrular → 5dk'lık `x-internal-token` üretir. Downstream servisler `getPayload(req)` ile doğrular. 3 JWT secret birbirinden farklı olmalı.
2. **`/internal/*` dışarıya kapalı:** Gateway, path'in herhangi bir segmentinde `internal` geçen isteği 403'ler.
3. **Collection sahipliği:** Her servis yalnızca kendi MongoDB collection'larına yazar (admin istisna — salt-okuma).
4. **Atomik işlemler:** Kredi harcama ve storage kotası tek `findOneAndUpdate` ile.
5. **Stripe webhook ham body ister** (`express.raw()`); checkout session atomik/idempotent işlenir.

---

## Deploy

- **Frontend + backend** → Railway (CI, `main` push sonrası otomatik)
- **Veritabanı** → MongoDB Atlas · **Depolama** → Backblaze B2

Ayrıntılar için → [`DEPLOY.md`](DEPLOY.md)

---

## Dokümantasyon

- **[`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md)** — tek doğru kaynak (servis detayları, env vars, güvenlik modeli, DAW, deploy)
- **[`docs/openapi.yaml`](docs/openapi.yaml)** — API spec (gateway `/api/docs` altında serve edilir)

---

## Lisans

Bu proje **GNU Affero General Public License v3.0 (AGPL-3.0)** ile lisanslanmıştır — bkz. [`LICENSE`](LICENSE).

Özetle: kodu kullanabilir ve değiştirebilirsin, ancak değiştirilmiş bir sürümü
**ağ üzerinden bir hizmet olarak sunsan bile** kaynak kodunu aynı lisansla
açık tutmak zorundasın.

© 2026 Yunus Emre Aslan
