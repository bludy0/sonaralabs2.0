# admin-service — CLAUDE.md

> ⚠️ **Bu dosya eski mimariyi anlatabilir ve güncel olmayabilir.** Güncel ve doğru
> referans: [`/docs/PROJECT-GUIDE.md`](../../docs/PROJECT-GUIDE.md). Çelişki olursa
> PROJECT-GUIDE.md ve kaynak kod esastır.

Port: 3006 | Prefix: /api/admin/*
Collection erişimi: tüm servislerden HTTP ile okuma — hiçbir collection'a doğrudan yazmaz.

## Sorumluluk
- Platform istatistikleri (kullanıcı, üretim, gelir, model dağılımı)
- Kullanıcı listesi ve detayı
- Dönemsel raporlama

## Endpoint'ler
```
GET /api/admin/stats/overview
GET /api/admin/stats/models
GET /api/admin/stats/styles
GET /api/admin/stats/revenue
GET /api/admin/users
GET /api/admin/users/:id
GET /api/admin/generations
```

## Kurallar
- x-user-role !== 'admin' → 403
- Tüm veri HTTP üzerinden ilgili servisten alınır (doğrudan DB sorgusu yok)
- period: '7d' | '30d' | 'all'
- Yanıtta passwordHash asla dönmez

## period → tarih filtresi
```typescript
function getPeriodStart(period: string): Date | null {
  if (period === '7d')  return new Date(Date.now() - 7  * 86400000);
  if (period === '30d') return new Date(Date.now() - 30 * 86400000);
  return null; // all
}
```

## Veri kaynakları
```
stats/overview   → auth, generation, credit servisleri
stats/models     → generation servisi
stats/styles     → generation servisi
stats/revenue    → credit servisi
users            → auth servisi
generations      → generation servisi
```
