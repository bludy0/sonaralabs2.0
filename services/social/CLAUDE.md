# social — :3009 (Hono) · collections: `profiles`, `public_tracks`, `follows`, `track_likes`, `feed_events`

> Tek doğru kaynak: [`docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md) §5.7.
> Eski profile servisi (:3008) buraya taşındı; PostgreSQL kaldırıldı — her şey MongoDB.

- Profil: `GET/PUT /profile/me`, avatar (MinIO, 5MB), `GET /profile/:username` (public).
- Track yayını: username **profilden** alınır, client'tan gelene güvenilmez (VULN-11). Like toggle E11000 unique index ile.
- Takip toggle, followers/following, feed (Redis 15dk cache), `GET /sse` sosyal olay akışı.
- `x-internal-token` doğrulaması + `_internal: true` kontrolü.
