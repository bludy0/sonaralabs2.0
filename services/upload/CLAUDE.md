# upload-service — CLAUDE.md

> ⚠️ **Bu dosya eski mimariyi anlatabilir ve güncel olmayabilir.** Güncel ve doğru
> referans: [`/docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md). Çelişki olursa
> PROJECT-GUIDE.md ve kaynak kod esastır.

Port: 3003 | Prefix: /api/upload/*
Collection sahibi: `uploads`

## Sorumluluk
- Ses dosyası yükleme (multer)
- MinIO / Backblaze B2'ye kaydetme (@aws-sdk/client-s3)
- storageUsed güncelleme (auth servise HTTP)
- Dosya silme

## Endpoint'ler
```
POST   /api/upload
DELETE /api/upload/:id

GET    /internal/uploads         ← library servisi kullanır
POST   /internal/store           ← generation servisi (Lyria audio) kullanır
```

## Kurallar
- Kabul: audio/wav, audio/mpeg, audio/ogg — diğerleri 422
- Maks boyut: 50 MB (ses dosyası), 10 MB (görüntü analizi, generation servisi yönetir)
- Kota: 500 MB = 524_288_000 byte
- Upload öncesi: GET /internal/users/:id ile storageUsed oku, limit kontrol et
- Upload sonrası: PATCH /internal/users/:id/storage { delta: +fileSize }
- Silme sonrası: PATCH /internal/users/:id/storage { delta: -fileSize }
- ffprobe ile duration ölç — hata olursa null bırak, işlemi durdurma

## StorageService
@aws-sdk/client-s3 kullan. MinIO ve B2 aynı SDK — sadece env değişir.
Presigned URL üret (1 saatlik) — audioUrl olarak kaydet.

## /internal/* endpoint'leri
x-internal-secret header kontrolü.
