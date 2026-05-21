import { logger } from "./logger"
// services/notification/src/index.ts
import express from "express";
import jwt from "jsonwebtoken";
import { QueueEvents } from "bullmq";
import { InternalJwtPayload, SseStatusEvent, NotifyJobPayload } from "@sonaralabs/types";

const app = express();
app.use(express.json({ limit: "4kb" }));

const { PORT = "3007", INTERNAL_JWT_SECRET, REDIS_URL = "redis://localhost:6379" } = process.env;
if (!INTERNAL_JWT_SECRET) { process.exit(1); }

// ── SSE BAĞLANTI YÖNETİMİ ─────────────────────────────────────────────────────
// userId → Set<Response> (bir kullanıcının birden fazla sekmesi olabilir)
const connections = new Map<string, Set<express.Response>>();

function addConnection(userId: string, res: express.Response) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId)!.add(res);
}

function removeConnection(userId: string, res: express.Response) {
  connections.get(userId)?.delete(res);
  if (connections.get(userId)?.size === 0) connections.delete(userId);
}

function sendToUser(userId: string, event: SseStatusEvent) {
  const userConns = connections.get(userId);
  if (!userConns) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of userConns) {
    try { res.write(data); }
    catch { removeConnection(userId, res); }
  }
}

// ── BULLMQ QUEUE EVENTS (Redis Pub/Sub) ───────────────────────────────────────
const queueEvents = new QueueEvents("generation", { connection: { url: REDIS_URL } });

queueEvents.on("completed", async ({ jobId, returnvalue }) => {
  // returnvalue = worker'ın döndürdüğü { audioUrl }
  // userId ve diğer bilgileri job data'dan almak için Generation koleksiyonuna
  // HTTP çağrısı yapmak yerine, generation servisi /internal/notify endpoint'i çağırır.
  // (Bu event'te sadece jobId var; gerçek data generation servisinden HTTP ile gelir.)
  logger.info(`[notification] Job ${jobId} completed`);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.info(`[notification] Job ${jobId} failed: ${failedReason}`);
});

// ── ROUTES ────────────────────────────────────────────────────────────────────

// GET /stream — SSE bağlantısı (frontend EventSource ile bağlanır)
app.get("/stream", (req, res) => {
  try {
    // Yalnızca header kabul edilir — query string'e JWT koymak log'lara sızar
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).end();

    const payload = jwt.verify(internalToken, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
    if (!payload._internal) return res.status(401).end(); // internal token zorunlu
    const userId = payload.sub;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");  // nginx buffering'i devre dışı bırak
    res.flushHeaders();

    // Bağlantı kaydı
    addConnection(userId, res);
    logger.info(`[notification] SSE connected: ${userId} (total: ${connections.size} users)`);

    // Ping — bağlantıyı canlı tutar (30sn)
    const pingInterval = setInterval(() => {
      try { res.write(": ping\n\n"); }
      catch { clearInterval(pingInterval); }
    }, 30_000);

    // Bağlantı kapanınca temizle
    req.on("close", () => {
      clearInterval(pingInterval);
      removeConnection(userId, res);
      logger.info(`[notification] SSE disconnected: ${userId}`);
    });
  } catch {
    res.status(401).end();
  }
});

// POST /internal/notify — generation servisi bu endpoint'i çağırır
app.post("/internal/notify", (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ error: "Unauthorized" });
    jwt.verify(internalToken, INTERNAL_JWT_SECRET!);

    const { userId, jobId, status, audioUrl, failReason } = req.body as NotifyJobPayload;
    if (!userId || !jobId || !status) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const event: SseStatusEvent = { type: "status", jobId, status, audioUrl, failReason };
    sendToUser(userId, event);

    res.json({ success: true, sent: connections.has(userId) });
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
});

// GET /health
app.get("/health", (_, res) => res.json({
  status: "ok",
  service: "notification",
  connectedUsers: connections.size,
  totalConnections: [...connections.values()].reduce((s, c) => s + c.size, 0),
}));

app.listen(PORT, () => logger.info(`[notification] Listening on :${PORT}`));
