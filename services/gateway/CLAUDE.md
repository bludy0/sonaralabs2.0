# gateway — CLAUDE.md

> ⚠️ **Bu dosya eski mimariyi anlatabilir ve güncel olmayabilir.** Güncel ve doğru
> referans: [`/docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md). Çelişki olursa
> PROJECT-GUIDE.md ve kaynak kod esastır.

Port: 3000 | Tüm `/api/*` isteklerinin tek giriş noktası.

## Sorumluluk
- İstekleri ilgili mikroservise yönlendir
- JWT cookie doğrulama (auth servisi ile)
- Rate limiting (100 req/dk per IP)
- CORS (yalnızca CLIENT_URL)
- `/internal/*` path'lerini dışarıya engelle (403)

## Yönlendirme tablosu
```typescript
const ROUTES = [
  { prefix: '/api/auth',         target: AUTH_SERVICE_URL },
  { prefix: '/api/users',        target: AUTH_SERVICE_URL },
  { prefix: '/api/generate',     target: GENERATION_SERVICE_URL },
  { prefix: '/api/upload',       target: UPLOAD_SERVICE_URL },
  { prefix: '/api/library',      target: LIBRARY_SERVICE_URL },
  { prefix: '/api/collections',  target: LIBRARY_SERVICE_URL },
  { prefix: '/api/credits',      target: CREDIT_SERVICE_URL },
  { prefix: '/api/admin',        target: ADMIN_SERVICE_URL },
  { prefix: '/api/notify',       target: NOTIFICATION_SERVICE_URL },
];
```

## Middleware sırası
1. CORS
2. Rate limit
3. `/internal/*` → 403
4. JWT doğrulama (korumasız route'lar hariç)
5. `x-user-id`, `x-user-role`, `x-request-id` header ekle
6. `http-proxy-middleware` ile servise ilet

## Korumasız route'lar (JWT gerekmez)
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/refresh

## SSE proxy ayarı
SSE endpoint'leri için `changeOrigin: true`.
`proxyRes` eventinde `Cache-Control: no-cache` ve `Connection: keep-alive` koru.

## Paket
`http-proxy-middleware` v3
