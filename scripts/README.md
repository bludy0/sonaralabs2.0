# scripts/

Sonaralabs yardımcı scriptleri. **Tümü repo kökünden** çalıştırılmalıdır
(scriptler kendi içinde köke `cd` eder).

## Başlatma / Durdurma

| Script | pnpm karşılığı | Ne yapar |
|--------|----------------|----------|
| `dev.sh` | `pnpm start` | **Tek komutla lokal başlatma.** Altyapıyı (MongoDB / Redis / MinIO) ayağa kaldırır, gerekiyorsa `pnpm install` çalıştırır, tüm servisleri + frontend'i `turbo dev --concurrency=15` ile başlatır ve hazır olunca tarayıcıyı açar. Durdurmak için `Ctrl+C`. |
| `stop.sh` | `pnpm stop` | `dev.sh`'in başlattığı süreçleri (turbo/tsx servisleri + MinIO) kapatır. `--infra` bayrağıyla brew `mongod` + `redis` de durdurulur. |

```bash
./scripts/dev.sh              # başlat (= pnpm start)
./scripts/stop.sh             # durdur (servisler + MinIO)
./scripts/stop.sh --infra     # ayrıca brew mongo + redis'i de durdur
```

**Gereksinimler (macOS):** `brew` ile kurulu `mongodb-community` ve `redis`; yükleme/avatar
özellikleri için `minio` (`brew install minio`). MinIO yoksa gerisi yine çalışır.

## Demo Verisi

| Script | pnpm karşılığı | Ne yapar |
|--------|----------------|----------|
| `seed-demo.sh` | `pnpm demo:seed` | Demo kullanıcılar + üretim/yükleme verisi yükler. |
| `clean-demo.sh` | `pnpm demo:clean` | Demo verisini temizler. |
| `seed-social.ts` | — | Sosyal mock veri (profil/track/takip/feed). `pnpm tsx scripts/seed-social.ts`. |

> `seed-demo` çalışınca üretilen test/admin kimlikleri `scripts/seed-credentials.txt`
> dosyasına yazılır — bu dosya gitignore'ludur, paylaşılmaz/commit edilmez.

## Bakım

| Script | Ne yapar |
|--------|----------|
| `backup-mongodb.sh` | Yerel MongoDB veritabanının yedeğini alır. |
| `clean-admin-seed.js` | Admin seed kayıtlarını temizler. |

---

> Çalıştırma/komut dokümantasyonu: kökteki [`README.md`](../README.md) ve
> [`docs/PROJECT-GUIDE.md`](../docs/PROJECT-GUIDE.md) §10.
