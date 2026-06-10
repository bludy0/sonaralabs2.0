# auth — :3001 (Express) · collections: `users`, `refresh_tokens`, `credit_logs`

> Tek doğru kaynak: [`docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md) §5.2.
> Eski credit servisi (:3005) buraya taşındı — ayrı credit servisi YOK.

- Auth: register (email onay + `INITIAL_CREDIT_BALANCE` kredi), login (brute-force kilidi, timing-safe), refresh (token rotation), logout/logout-all, me/preferences/password.
- Kredi: `/credits/balance|history|spend|earn|purchase|packages`. Harcama **atomik** `findOneAndUpdate` + `$gte` — asla find+save yapma.
- Stripe: `/credits/purchase` Checkout session; `/credits/webhook` **raw body** ister (global `express.json()` bu path'i atlar — bozma).
- Email: nodemailer, SMTP yoksa console'a yazar; mailler fire-and-forget gönderilir (register'ı bloklamasın).
- `x-internal-token` doğrulaması: `getPayload(req)` + `_internal: true` kontrolü.
