# CLAUDE.md — Sonaralabs 2.0

> **Tek doğru kaynak: [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md).**
> Kod tabanının gerçek durumundan üretilmiştir. Servis-içi `services/*/CLAUDE.md`
> dosyaları **eski mimariyi** (10 servis, PostgreSQL, ayrı credit/notification/profile)
> anlatır ve güvenilmez — çelişki olursa PROJECT-GUIDE.md ve kaynak kod esastır.

Her oturumda önce `docs/PROJECT-GUIDE.md`'yi oku.

---

## Hızlı Gerçek (özet)

- **Monorepo:** pnpm workspace + Turborepo. `services/*`, `apps/web`, `packages/{types,daw-studio}`.
- **7 servis:** gateway :3000 (Hono) · auth :3001 (+kredi/Stripe/email) · generation :3002 (+SSE/BullMQ) · upload :3003 (MinIO) · library :3004 (+DAW projeleri) · admin :3006 (salt-okuma) · social :3009 (Hono, +profil).
- **Yok artık:** credit :3005 → auth · notification :3007 → generation · profile :3008 → social. PostgreSQL kaldırıldı (her şey MongoDB).
- **AI:** Beatoven + Sonauto (müzik aktif), ElevenLabs (SFX), Gemini (görüntü/MIDI/mastering). Lyria kapalı.
- **Ödeme:** Stripe Checkout (auth servisinde).

## Asla İhlal Etme (kritik invariantlar)

1. **Inter-servis auth:** Gateway user JWT'yi doğrular → 5dk'lık `x-internal-token` (INTERNAL_JWT_SECRET) üretir. Downstream her servis `getPayload(req)` ile doğrular + `_internal:true` kontrol eder. 3 JWT secret birbirinden **farklı** olmalı.
2. **`/internal/*` dışarıya kapalı:** Gateway, path'in herhangi bir segmentinde `internal` geçen isteği 403'ler (regex `/(^|\/)internal(\/|$)/`). Prefix-stripping catch-all'ların IDOR'a yol açmasını engeller. **Bu korumayı zayıflatma.**
3. **Collection sahipliği:** Her servis yalnızca kendi MongoDB collection'larına yazar; başka servisin verisine `/internal/*` HTTP ile erişir. (İstisna: admin salt-okuma.)
4. **Atomik işlemler:** Kredi harcama ve storage kotası tek `findOneAndUpdate` (`$gte`/`$expr:$lte`) ile — ayrı find+save yapma (race condition).
5. **Stripe webhook ham body ister:** `/credits/webhook` global `express.json()`'ı atlar; route-içi `express.raw()` kullanılır.
6. **Admin çift koruma:** gateway `requireAdmin` + servis-içi `requireAdmin`.
7. **Servisler-arası HTTP çağrıları timeout'lu olmalı** (askıda kalmayı önler): gateway proxy `PROXY_TIMEOUT_MS` (SSE/stream hariç), iç axios çağrıları `INTERNAL_HTTP_TIMEOUT_MS`.

## Komutlar

```bash
pnpm install
pnpm dev          # tüm servisler tsx watch
pnpm build | pnpm typecheck | pnpm lint | pnpm test
pnpm test:e2e     # Playwright
```

Ayrıntı için → **[`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md)** (servis detayları, env vars, güvenlik modeli, DAW, deploy).
