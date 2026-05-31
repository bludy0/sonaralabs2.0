# library-service — CLAUDE.md

> ⚠️ **Bu dosya eski mimariyi anlatabilir ve güncel olmayabilir.** Güncel ve doğru
> referans: [`/docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md). Çelişki olursa
> PROJECT-GUIDE.md ve kaynak kod esastır.

Port: 3004 | Prefix: /api/library/*, /api/collections/*
Collection sahibi: `collections`
Not: generations ve uploads collection'larına doğrudan erişmez — HTTP ile ilgili servisten alır.

## Sorumluluk
- Üretimler + yüklemeler birleşik liste (GET /api/library)
- Favori toggle (generations ve uploads üzerinde)
- Koleksiyon CRUD

## Endpoint'ler
```
GET    /api/library
PATCH  /api/library/:id/favorite
DELETE /api/library/:id
GET    /api/collections
POST   /api/collections
PATCH  /api/collections/:id
DELETE /api/collections/:id
POST   /api/collections/:id/items
DELETE /api/collections/:id/items/:refId
```

## GET /api/library akışı
```typescript
const [generations, uploads] = await Promise.all([
  axios.get(`${GENERATION_SERVICE_URL}/internal/generations?userId=...`),
  axios.get(`${UPLOAD_SERVICE_URL}/internal/uploads?userId=...`),
]);
// İkisini birleştir, type alanı ekle ('generation' | 'upload')
// Favoriler için kendi DB'sinden isFavorited bilgisini ekle
// createdAt göre sırala, sayfalandır
```

## Favori yönetimi
Favoriler bu servisin kendi DB'sinde tutulur:
{ userId, refId, refModel: 'Generation'|'Upload' }
İlgili servisin collection'ına doğrudan yazılmaz.

## Silme akışı
- type === 'generation' → DELETE /internal/generations/:id (generation servisi)
- type === 'upload' → DELETE /internal/uploads/:id (upload servisi)

## /internal/* endpoint'leri
x-internal-secret header kontrolü.
