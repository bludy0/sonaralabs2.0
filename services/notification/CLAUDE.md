# notification-service — CLAUDE.md

Port: 3007 | Prefix: /api/notify/*, /internal/*
Collection sahibi: yok (stateless — bağlantı Map'te tutulur)

## Sorumluluk
- SSE bağlantı yönetimi (kullanıcı başına Map)
- generation servisinden olayları alıp SSE ile iletme

## Endpoint'ler
```
GET  /api/notify/stream    ← client SSE ile bağlanır
POST /internal/emit        ← generation servisi çağırır
```

## Implementasyon
```typescript
const connections = new Map<string, Response>();

// GET /api/notify/stream
router.get('/stream', (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  connections.set(userId, res);
  req.on('close', () => connections.delete(userId));
});

// POST /internal/emit
router.post('/emit', (req, res) => {
  const { userId, type, payload } = req.body;
  const conn = connections.get(userId);
  if (conn) {
    conn.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  }
  res.json({ success: true });
});
```

## SSE event formatı
```
data: {"type":"generation_done","jobId":"...","audioUrl":"...","generationId":"..."}

data: {"type":"generation_failed","jobId":"...","error":"Üretim başarısız oldu"}
```
