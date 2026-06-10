# upload — :3003 (Express) · collection: `uploads` (+ `users.storageUsed` yazar)

> Tek doğru kaynak: [`docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md) §5.4.

- Multer **disk** storage → MinIO'ya stream (heap'e yükleme yok). Kabul: WAV/MP3/OGG, max 50MB.
- Kota (500MB/kullanıcı) **atomik**: `findOneAndUpdate` + `$expr: $lte` tek sorgu — asla ayrı find+save yapma. MinIO yazımı başarısızsa kota rollback edilir.
- Dosya uzantısı MIME tipinden türetilir — `originalname`'e güvenme.
- DELETE: MinIO'dan sil + kota iade.
- `x-internal-token` doğrulaması: `getPayload(req)` + `_internal: true` kontrolü.
