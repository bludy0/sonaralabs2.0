// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yunus Emre Aslan

import { logger } from "./logger"
// services/admin/src/index.ts
// Defense in depth: Gateway /api/admin/* rotalarını önce role:admin filtreden geçirir.
// Bu servis de her handler'da ayrıca rol kontrolü yapar — iki katman.
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import axios from "axios";
import { InternalJwtPayload, ApiResponse } from "@sonaralabs/types";

axios.defaults.timeout = parseInt(process.env.INTERNAL_HTTP_TIMEOUT_MS ?? "10000");

const app = express();
app.use(express.json());

const {
  PORT = "3006",
  MONGO_URI,
  INTERNAL_JWT_SECRET,
  GENERATION_SERVICE_URL = "http://generation:3002",
} = process.env;
if (!MONGO_URI || !INTERNAL_JWT_SECRET) { process.exit(1); }

// ── MODELS (read-only views — kendi collection'larına dokunmaz) ───────────────
// Admin servisi sadece okuma yapar; bu modeller diğer servislerin oluşturduğu
// collection'ları aynı MongoDB üzerinden okur. Yazma YAPILMAZ.
const User       = mongoose.model("User",       new mongoose.Schema({}, { strict: false, collection: "users"        }));
const Generation = mongoose.model("Generation", new mongoose.Schema({}, { strict: false, collection: "generations"  }));
const Upload     = mongoose.model("Upload",     new mongoose.Schema({}, { strict: false, collection: "uploads"      }));
const CreditLog  = mongoose.model("CreditLog",  new mongoose.Schema({}, { strict: false, collection: "credit_logs" }));

// ── ADMIN GUARD (servis içi ikinci katman) ────────────────────────────────────
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const token = req.headers["x-internal-token"] as string;
    if (!token) return res.status(401).json({ success: false, error: "Unauthorized" });
    const payload = jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
    if (payload.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }
    (req as any).adminId = payload.sub;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
}

app.get("/health", (_, res) => res.json({
  status: "ok",
  service: "admin",
  note: "double-layer admin guard active",
}));

// Tüm admin route'larına uygula
app.use(requireAdmin);

// ── ROUTES ────────────────────────────────────────────────────────────────────

// GET /stats — platform genel metrikleri
app.get("/stats", async (_req, res) => {
  try {
    const [
      totalUsers, totalGenerations, totalUploads,
      doneGenerations, failedGenerations,
      providerCounts, styleCounts,
    ] = await Promise.all([
      User.countDocuments(),
      Generation.countDocuments(),
      Upload.countDocuments(),
      Generation.countDocuments({ status: "done" }),
      Generation.countDocuments({ status: "failed" }),
      Generation.aggregate([
        { $group: { _id: "$provider", count: { $sum: 1 } } },
      ]),
      Generation.aggregate([
        { $match: { status: "done" } },
        { $group: { _id: "$style", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        users: { total: totalUsers },
        generations: {
          total: totalGenerations,
          done: doneGenerations,
          failed: failedGenerations,
          successRate: totalGenerations > 0
            ? ((doneGenerations / totalGenerations) * 100).toFixed(1) + "%"
            : "0%",
        },
        uploads: { total: totalUploads },
        providers: providerCounts.reduce((acc: any, p: any) => { acc[p._id] = p.count; return acc; }, {}),
        topStyles: styleCounts,
      },
    } as ApiResponse);
  } catch (err) {
    logger.error("admin stats error", { message: String(err) });
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

// GET /stats/queue — BullMQ üretim kuyruğu durumu (generation servisinden çekilir)
app.get("/stats/queue", async (req, res) => {
  try {
    // Gateway'in ürettiği admin-rollü internal token aynen iletilir;
    // generation tarafı da role:admin kontrolü yapar (defense in depth).
    const { data } = await axios.get(`${GENERATION_SERVICE_URL}/internal/queue-stats`, {
      headers: { "x-internal-token": req.headers["x-internal-token"] as string },
    });
    res.json(data);
  } catch (err) {
    logger.error("admin queue stats error", { message: String(err) });
    res.status(502).json({ success: false, error: "Queue stats unavailable" });
  }
});

// GET /stats/daily — son 30 günlük günlük üretim sayısı (dashboard chart için)
app.get("/stats/daily", async (_req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const daily = await Generation.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: "done" } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
        credits: { $sum: "$creditCost" },
      }},
      { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data: daily } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Failed" });
  }
});

// GET /users — kullanıcı listesi (sayfalı)
app.get("/users", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const search = req.query.search as string;

    const filter: any = {};
    if (search) filter.email = { $regex: search, $options: "i" };

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("email role creditBalance storageUsed createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({ success: true, data: { users, total, page, pages: Math.ceil(total / limit) } } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Failed" });
  }
});

// GET /users/:id — kullanıcı detay
app.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("email role creditBalance storageUsed preferences createdAt updatedAt");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const [genCount, uploadCount, totalSpent] = await Promise.all([
      Generation.countDocuments({ userId: req.params.id, status: "done" }),
      Upload.countDocuments({ userId: req.params.id }),
      CreditLog.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(req.params.id), type: "spend" } },
        { $group: { _id: null, total: { $sum: { $abs: "$amount" } } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        ...((user as any).toObject()),
        stats: {
          generations: genCount,
          uploads: uploadCount,
          creditsSpent: totalSpent[0]?.total || 0,
        },
      },
    } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Failed" });
  }
});

// PATCH /users/:id/role — rol değiştir (admin ↔ user)
app.patch("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ success: false, error: "Role must be 'user' or 'admin'" });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("email role");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: user } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Failed" });
  }
});

// GET /generations — son üretimler (monitoring)
app.get("/generations", async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string;

    const filter: any = {};
    if (status) filter.status = status;

    const [items, total] = await Promise.all([
      Generation.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Generation.countDocuments(filter),
    ]);

    res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Failed" });
  }
});

mongoose.connect(MONGO_URI!).then(() => {
  app.listen(PORT, () => logger.info(`[admin] Listening on :${PORT}`));
}).catch(err => { logger.error("[admin] MongoDB failed", err); process.exit(1); });
