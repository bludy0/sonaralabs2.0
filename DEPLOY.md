# Sonaralabs 2.0 — Deploy Kılavuzu

## Mimari

```
Vercel          → Frontend (React + Vite)
Render          → Backend microservices (Docker)
MongoDB Atlas   → Veritabanı
Redis           → Cache + BullMQ
MinIO / B2      → Dosya depolama
```

---

## Lokal Geliştirme

```bash
cp .env.example .env   # .env'i düzenle
docker compose up -d   # Tüm servisleri başlat
```

Frontend: http://localhost:5174
API: http://localhost:3000

---

## Production — Render (Backend)

> **Not:** `render.yaml` blueprint dosyası kaldırıldı. Her servis Render dashboard'ından
> **manuel** kurulur: 7 web servisi (gateway, auth, generation, upload, library, admin, social),
> her biri kendi Dockerfile'ı ile. Build/start ayarlarını ve aşağıdaki env vars'ı dashboard'dan gir.

**Gerekli env vars (Render dashboard → servis → Environment):**

| Değişken | Açıklama |
|----------|----------|
| `MONGO_URI` | MongoDB Atlas connection string |
| `REDIS_URL` | Redis URL |
| `ACCESS_JWT_SECRET` | Rastgele 64+ byte hex |
| `REFRESH_JWT_SECRET` | Rastgele 64+ byte hex (farklı) |
| `INTERNAL_JWT_SECRET` | Rastgele 64+ byte hex (farklı) |
| `GEMINI_API_KEY` | Google AI Studio |
| `BEATOVEN_API_KEY` | Beatoven müzik üretimi |
| `ELEVENLABS_API_KEY` | ElevenLabs SFX |
| `MINIO_ENDPOINT` | B2: `s3.us-east-005.backblazeb2.com` |
| `MINIO_ACCESS_KEY` | B2 key ID |
| `MINIO_SECRET_KEY` | B2 application key |
| `MINIO_PUBLIC_URL` | B2 public download URL |
| `SMTP_PASS` | Resend API key |
| `EMAIL_FROM` | `Sonaralabs <noreply@yourdomain.com>` |
| `APP_URL` | Vercel frontend URL |
| `CLIENT_URL` | Vercel frontend URL |

---

## Production — Vercel (Frontend)

> **Not:** `vercel.json` dosyası kaldırıldı. Aşağıdaki ayarları Vercel dashboard'ından
> (Project → Settings) **manuel** olarak gir:

- **Install:** `pnpm install --frozen-lockfile`
- **Build:** `pnpm --filter @sonaralabs/types build && pnpm --filter sonaralabs-frontend build`
- **Output directory:** `apps/web/dist`
- **Rewrites:** `/api/*` → Render gateway'e proxy · `/*` → `index.html` (SPA routing)

**Gerekli env var:**
```
VITE_API_BASE_URL=https://sonaralabs-gateway.onrender.com
```

---

## JWT Secret Üretimi

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

3 farklı secret üret — asla aynı değeri kullanma.
