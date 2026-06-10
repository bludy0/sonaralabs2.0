# gateway — :3000 (Hono)

> Tek doğru kaynak: [`docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md) §5.1.

- Tüm `/api/*` trafiğinin tek girişi. User JWT doğrular → 5dk'lık `x-internal-token` üretir (`INTERNAL_JWT_SECRET`).
- Rate limit (Redis sayaç), CORS, secure headers burada.
- **Path'in herhangi bir segmentinde `internal` geçen istek 403** — bu korumayı zayıflatma (IDOR).
- Routing tablosu `src/createApp.ts` içinde; endpoint eklerken oraya bak. `createApp.ts` saf factory'dir (bağımlılıklar inject edilir), `index.ts` Redis + env'i bağlar.
- Proxy çağrıları `PROXY_TIMEOUT_MS` ile timeout'lu (SSE/stream hariç).
- Swagger: `GET /api/docs` → `docs/openapi.yaml`.
