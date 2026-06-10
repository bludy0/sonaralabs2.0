# admin — :3006 (Express) · salt-okuma

> Tek doğru kaynak: [`docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md) §5.6.

- Tüm collection'ları `strict: false` **salt-okuma** mongoose modelleriyle doğrudan okur (collection sahipliği kuralının tek istisnası).
- Tek yazma işlemi: `PATCH /users/:id/role` (user ↔ admin).
- **Çift katman koruma:** gateway `requireAdmin` + servis içi `requireAdmin` middleware — ikisini de koru.
- `x-internal-token` doğrulaması: `getPayload(req)` + `_internal: true` kontrolü.
