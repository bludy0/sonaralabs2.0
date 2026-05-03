# Sonaralabs 2.0 — Deploy Kılavuzu

## Gereksinimler

| Servis | Kaynak | Not |
|--------|--------|-----|
| MongoDB | MongoDB Atlas (M0 free) | `MONGO_URI` |
| Redis | Railway Redis plugin | `REDIS_URL` |
| PostgreSQL | Railway Postgres plugin | `DATABASE_URL` |
| Dosya depolama | Backblaze B2 (S3-compat) | `MINIO_*` env |
| AI — Müzik | Beatoven API | `BEATOVEN_API_KEY` |
| AI — SFX | ElevenLabs | `ELEVENLABS_API_KEY` |
| AI — Görüntü+Lyria | Google AI Studio | `GEMINI_API_KEY` |
| AI — StableAudio | Stability AI | `STABILITY_API_KEY` |

---

## Railway ile Deploy (önerilen)

### 1. Proje oluştur

```bash
railway login
railway init
```

### 2. Servisleri ekle

Railway dashboard'da her microservis için ayrı service oluştur:

```
gateway      → services/gateway/Dockerfile
auth         → services/auth/Dockerfile
generation   → services/generation/Dockerfile
upload       → services/upload/Dockerfile
library      → services/library/Dockerfile
credit       → services/credit/Dockerfile
admin        → services/admin/Dockerfile
notification → services/notification/Dockerfile
profile      → services/profile/Dockerfile
social       → services/social/Dockerfile
frontend     → apps/web/Dockerfile
```

### 3. Zorunlu environment variables

Her servis için ayarlanması gereken değişkenler:

#### Tüm servisler (shared)
```
ACCESS_JWT_SECRET=<64-byte-hex>        # openssl rand -hex 64
REFRESH_JWT_SECRET=<64-byte-hex>       # farklı olmalı
INTERNAL_JWT_SECRET=<64-byte-hex>      # farklı olmalı
NODE_ENV=production
```

#### Auth servisi
```
MONGO_URI=mongodb+srv://...
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
```

#### Generation servisi
```
MONGO_URI=mongodb+srv://...
REDIS_URL=redis://...
BEATOVEN_API_KEY=...
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...
STABILITY_API_KEY=...
JOB_TIMEOUT_MS=300000
MINIO_ENDPOINT=s3.us-west-004.backblazeb2.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=<b2-key-id>
MINIO_SECRET_KEY=<b2-app-key>
MINIO_BUCKET=sonaralabs-audio
CREDIT_SERVICE_URL=https://credit.railway.internal
NOTIFICATION_SERVICE_URL=https://notification.railway.internal
```

#### Upload servisi
```
MONGO_URI=mongodb+srv://...
MINIO_ENDPOINT=...
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=sonaralabs-audio
STORAGE_QUOTA_BYTES=524288000
MAX_FILE_SIZE_BYTES=52428800
```

#### Library servisi
```
MONGO_URI=mongodb+srv://...
GENERATION_SERVICE_URL=https://generation.railway.internal
UPLOAD_SERVICE_URL=https://upload.railway.internal
```

#### Profile & Social servisleri
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PROFILE_SERVICE_URL=https://profile.railway.internal   # (social için)
```

#### Gateway
```
REDIS_URL=redis://...
CLIENT_URL=https://your-frontend.railway.app
RATE_LIMIT_GENERAL=30
RATE_LIMIT_GENERATION=3
RATE_LIMIT_UPLOAD=10
RATE_LIMIT_AUTH=10
AUTH_SERVICE_URL=https://auth.railway.internal
GENERATION_SERVICE_URL=https://generation.railway.internal
UPLOAD_SERVICE_URL=https://upload.railway.internal
LIBRARY_SERVICE_URL=https://library.railway.internal
CREDIT_SERVICE_URL=https://credit.railway.internal
ADMIN_SERVICE_URL=https://admin.railway.internal
NOTIFICATION_SERVICE_URL=https://notification.railway.internal
PROFILE_SERVICE_URL=https://profile.railway.internal
SOCIAL_SERVICE_URL=https://social.railway.internal
```

#### Generation & Upload servisleri — MINIO_PUBLIC_URL (kritik!)
```
# Backblaze B2 public URL (tarayıcıların sese eriştiği adres)
MINIO_PUBLIC_URL=https://f005.backblazeb2.com/file/sonaralabs-audio
# veya CDN domain'iniz varsa:
# MINIO_PUBLIC_URL=https://cdn.sonaralabs.io
```
Bu değer **boş bırakılırsa** ses dosyalarının URL'leri `http://localhost:9000` olarak kaydedilir
ve production'da ses çalmaz.

#### Frontend
```
VITE_API_BASE_URL=https://gateway.railway.app
# Sentry hata izleme (ücretsiz 5k error/ay — https://sentry.io)
VITE_SENTRY_DSN=https://xxxx@yyy.ingest.sentry.io/zzz
VITE_APP_VERSION=1.0.0
```

### 4. Backblaze B2 bucket ayarları

```bash
# B2 bucket oluştur
b2 create-bucket sonaralabs-audio allPublic

# CORS kuralı ekle (ses dosyaları için)
b2 update-bucket --corsRules '[{
  "corsRuleName": "allowGet",
  "allowedOrigins": ["https://your-frontend.railway.app"],
  "allowedHeaders": ["*"],
  "allowedOperations": ["b2_download_file_by_name"],
  "maxAgeSeconds": 3600
}]' sonaralabs-audio
```

### 5. PostgreSQL (Railway plugin)

Railway dashboard → "Add Plugin" → PostgreSQL seç.
`DATABASE_URL` otomatik olarak `profile` ve `social` servislerine enjekte edilir.
Tablolar ilk çalışmada otomatik oluşturulur (`migrate()` fonksiyonu).

### 6. MongoDB Atlas — Yedek (backup)

M0 (free tier) otomatik backup **içermez**. Seçenekler:

| Yöntem | Maliyet | Açıklama |
|--------|---------|----------|
| Atlas M10+ | $57/ay | Continuous backup + point-in-time restore |
| `mongodump` cron (Railway) | Ücretsiz | Günlük `mongodump \| gzip` → B2'ye yükle |
| Atlas Scheduled Snapshots | M2/M5'te | Günlük snapshot, 7 gün saklama |

**Minimum önerilen:** Atlas M2 ($9/ay) — snapshot backup dahil.

Backup cron script:
```bash
# services/backup/backup.sh (Railway cron service olarak eklenebilir)
#!/bin/sh
DATE=$(date +%Y%m%d_%H%M)
mongodump --uri="$MONGO_URI" --archive | gzip > /tmp/backup_$DATE.gz
b2 upload-file sonaralabs-backups /tmp/backup_$DATE.gz backup_$DATE.gz
rm /tmp/backup_$DATE.gz
```

### 7. Monitoring (Sentry)

1. [sentry.io](https://sentry.io) → New Project → React
2. DSN'i kopyala
3. Frontend Railway servisine `VITE_SENTRY_DSN` olarak ekle
4. (Opsiyonel) Gateway için `@sentry/node` eklenebilir

### 8. Sağlık kontrolü

```bash
curl https://gateway.railway.app/health
# → {"status":"ok","service":"gateway"}
```

---

## Docker Compose (local geliştirme)

```bash
cp .env.example .env
# .env dosyasını düzenle (JWT secret'larını generate et)

docker compose up -d
# Gateway: http://localhost:3000
# Frontend: http://localhost:5173 (vite dev server)
```

---

## Notlar

- Üç JWT secret **birbirinden farklı** olmalı (`openssl rand -hex 64` ile üret)
- `INTERNAL_JWT_SECRET` hiçbir zaman frontend'e expose edilmemeli
- `/api/credits/purchase` → 503 stub — production'da ödeme entegrasyonu gerekli
- Lyria 3 provider → API stable olduğunda `LyriaProvider` sınıfı implemente edilmeli
