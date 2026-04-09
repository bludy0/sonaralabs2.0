# auth-service — CLAUDE.md

Port: 3001 | Prefix: /api/auth/*, /api/users/*
Collection sahibi: `users`

## Sorumluluk
- Kullanıcı kayıt ve giriş
- JWT access + refresh token (httpOnly cookie)
- Kullanıcı profili ve tercih güncelleme
- storageUsed atomik güncelleme (/internal/users/:id/storage)
- Kayıt sonrası credit servise 100 kredi bildirimi

## Endpoint'ler
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/users/me
PATCH  /api/users/me/preferences

GET    /internal/users/:id              ← diğer servisler kullanır
PATCH  /internal/users/:id/storage     ← upload servisi kullanır (delta: ±bytes)
```

## Cookie ayarları
```typescript
res.cookie('accessToken', token, {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000,
});
res.cookie('refreshToken', token, {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth/refresh',
});
```

## Kurallar
- bcrypt min 10 round
- passwordHash: select: false — yanıtta asla dönmez
- /internal/* endpoint'leri x-internal-secret header kontrolü
- Kayıtta credit servise POST /internal/earn { userId, amount: 100, reason: 'Kayıt bonusu' }
