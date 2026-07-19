# Sonaralabs 2.0 — Deploy Kılavuzu

## Production mimarisi

```
Railway web       → React + Vite frontend (nginx)
Railway services  → gateway + 6 downstream servis (Docker)
MongoDB Atlas     → Veritabanı
Railway Redis     → Rate limit, cache ve BullMQ
Backblaze B2      → S3 uyumlu dosya depolama
```

Deploy otomasyonu [`.github/workflows/ci.yml`](.github/workflows/ci.yml) içindedir.
`main` branch push'unda lint, typecheck, unit test, Docker build ve E2E başarılı
olduktan sonra Railway servisleri yeniden deploy edilir. Herhangi bir servis
deploy'u başarısız olursa workflow da başarısız olur.

---

## Lokal geliştirme

```bash
cp .env.example .env
./scripts/dev.sh
```

Alternatif olarak tüm stack: `docker compose up -d`.

- Frontend: http://localhost:5174
- Gateway: http://localhost:3000

---

## Railway servisleri

Railway projesinde şu servis adları CI ile aynı olmalıdır:

- `gateway`
- `auth`
- `generation`
- `upload`
- `library`
- `admin`
- `social`
- `web`

Backend servisleri ilgili `services/<name>/Dockerfile`, frontend ise
`apps/web/Dockerfile` production target'ı ile çalıştırılır. Yalnızca gateway ve
web public domain almalı; downstream servisler private Railway ağı üzerinden
erişilmelidir.

GitHub repository/environment secrets içinde `RAILWAY_TOKEN` tanımlanmalıdır.

---

## Kritik environment değişkenleri

| Değişken | Kullanıldığı yer / açıklama |
|----------|-----------------------------|
| `MONGO_URI` | MongoDB Atlas connection string |
| `REDIS_URL` | Railway Redis private URL |
| `ACCESS_JWT_SECRET` | En az 32 karakter, diğer secret'lardan farklı |
| `REFRESH_JWT_SECRET` | En az 32 karakter, diğer secret'lardan farklı |
| `INTERNAL_JWT_SECRET` | En az 32 karakter, diğer secret'lardan farklı |
| `TRUST_PROXY_HOPS` | Railway gateway için `1`; X-Forwarded-For sağdan okunur |
| `CLIENT_URL` | Public web origin; CORS için tam origin |
| `FRONTEND_URL` | Stripe dönüş URL'lerinin izin verilen origin'i |
| `APP_URL` | Email linkleri için public web URL'i |
| `VITE_API_BASE_URL` | Public gateway URL'i veya aynı-origin proxy kullanılıyorsa boş |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | `/api/credits/webhook` webhook signing secret |
| `MINIO_ENDPOINT` | B2 S3 endpoint'i |
| `MINIO_ACCESS_KEY` | B2 key ID |
| `MINIO_SECRET_KEY` | B2 application key |
| `MINIO_PUBLIC_URL` | Public download/CDN base URL |
| `SMTP_PASS` | Resend/SMTP API key |
| `EMAIL_FROM` | Doğrulanmış gönderici adresi |

AI provider key'leri ve servis bazlı tüm değişkenler için `.env.example` esas
alınmalıdır.

---

## Stripe webhook

Production endpoint:

```text
https://<gateway-domain>/api/credits/webhook
```

Lokal Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/credits/webhook
```

Webhook imzası ham body üzerinden doğrulanır. Checkout session ID kullanıcı
dokümanında atomik işaretlendiğinden tekrar ve eşzamanlı teslimler ikinci kez
kredi vermez; kredi logu unique upsert ile tamamlanır.

---

## JWT secret üretimi

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Komutu üç kez çalıştırın. Gateway ve auth servisleri kısa veya aynı secret ile
başlamayı reddeder.
