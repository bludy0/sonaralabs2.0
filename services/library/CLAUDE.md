# library — :3004 (Express) · collections: `collections`, `daw_projects`

> Tek doğru kaynak: [`docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md) §5.5.

- Generations/uploads'a **yazmaz** — generation ve upload servislerinin `/internal/*` endpoint'lerinden HTTP ile çeker (timeout'lu axios), birleşik liste sunar.
- Favori/silme: ilgili servise proxy (`PATCH /:model/:id/favorite`, `DELETE /:model/:id`).
- Koleksiyon CRUD + item ekle/çıkar.
- **DAW projeleri** (`daw_projects`): CRUD + public share token (`POST /projects/:id/share`, `GET /projects/share/:token`). Serialize limit 2MB.
- `x-internal-token` doğrulaması: `getPayload(req)` + `_internal: true` kontrolü.
