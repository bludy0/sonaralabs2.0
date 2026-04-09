# credit-service — CLAUDE.md

Port: 3005 | Prefix: /api/credits/*, /internal/*
Collection sahibi: `credit_logs`
Not: creditBalance users collection'ında — bu servis atomik günceller.

## Sorumluluk
- Kredi bakiyesi sorgulama
- Atomik kredi düşme ve kazanma
- Kullanım geçmişi

## Endpoint'ler
```
GET  /api/credits/balance
GET  /api/credits/history
POST /api/credits/purchase

POST /internal/deduct    ← generation servisi çağırır
POST /internal/earn      ← auth servisi çağırır (kayıt bonusu)
```

## Atomik kredi düşme (ZORUNLU PATTERN)
```typescript
// /internal/deduct
const user = await User.findOneAndUpdate(
  { _id: userId, creditBalance: { $gte: amount } },
  { $inc: { creditBalance: -amount } },
  { new: true }
);
if (!user) throw new AppError('Yetersiz kredi', 422);

await CreditLog.create({
  userId, amount: -amount, type: 'spend',
  reason, relatedId, relatedModel, balanceAfter: user.creditBalance
});

return { newBalance: user.creditBalance };
```

## /internal/* koruması
x-internal-secret header kontrolü — dışarıdan gelen istekler gateway'de engellenir.
