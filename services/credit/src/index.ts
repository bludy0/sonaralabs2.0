// services/credit/src/index.ts
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { InternalJwtPayload, SpendCreditPayload, ApiResponse } from "@sonaralabs/types";

const app = express();
app.use(express.json());

const { PORT = "3005", MONGO_URI, INTERNAL_JWT_SECRET } = process.env;
if (!MONGO_URI || !INTERNAL_JWT_SECRET) { console.error("Missing env"); process.exit(1); }

// ── MODELS ────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  creditBalance: { type: Number, default: 100 },
}, { strict: false, timestamps: true });

const User = mongoose.model("User", userSchema);

const creditLogSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  amount:       { type: Number, required: true },
  type:         { type: String, enum: ["earn", "spend", "refund"], required: true },
  reason:       String,
  relatedId:    String,
  relatedModel: String,
  balanceAfter: Number,
}, { timestamps: true });

const CreditLog = mongoose.model("CreditLog", creditLogSchema);

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function getInternalPayload(req: express.Request): InternalJwtPayload {
  const token = req.headers["x-internal-token"] as string;
  if (!token) throw new Error("No internal token");
  return jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// GET /balance — kullanıcının kredi bakiyesi
app.get("/balance", async (req, res) => {
  try {
    const { sub: userId } = getInternalPayload(req);
    const user = await User.findById(userId).select("creditBalance");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: { creditBalance: user.creditBalance } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// GET /history — kredi harcama geçmişi (sayfalı)
app.get("/history", async (req, res) => {
  try {
    const { sub: userId } = getInternalPayload(req);
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    const [logs, total] = await Promise.all([
      CreditLog.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      CreditLog.countDocuments({ userId }),
    ]);

    res.json({ success: true, data: { logs, total, page, pages: Math.ceil(total / limit) } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// POST /spend — INTERNAL: generation/upload servisleri çağırır
// Atomik: bakiye kontrolü + düşme tek sorguda
app.post("/spend", async (req, res) => {
  try {
    getInternalPayload(req); // internal token doğrula

    const { userId, amount, reason, relatedId, relatedModel } = req.body as SpendCreditPayload;
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid payload" });
    }

    // Atomik kredi düşme: creditBalance >= amount ise $inc ile düş
    const updated = await User.findOneAndUpdate(
      { _id: userId, creditBalance: { $gte: amount } },
      { $inc: { creditBalance: -amount } },
      { new: true, select: "creditBalance" }
    );

    if (!updated) {
      return res.status(422).json({ success: false, error: "Insufficient credits" });
    }

    await CreditLog.create({
      userId, amount: -amount, type: "spend",
      reason, relatedId, relatedModel,
      balanceAfter: updated.creditBalance,
    });

    res.json({ success: true, data: { newBalance: updated.creditBalance } } as ApiResponse);
  } catch (err) {
    console.error("spend error", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /earn — INTERNAL: auth servisi kayıt bonusu için çağırır
app.post("/earn", async (req, res) => {
  try {
    getInternalPayload(req);

    const { userId, amount, reason } = req.body;
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid payload" });
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $inc: { creditBalance: amount } },
      { new: true, select: "creditBalance" }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    await CreditLog.create({
      userId, amount, type: "earn",
      reason: reason || "bonus",
      balanceAfter: updated.creditBalance,
    });

    res.json({ success: true, data: { newBalance: updated.creditBalance } } as ApiResponse);
  } catch (err) {
    console.error("earn error", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /purchase — MVP'de stub
app.post("/purchase", (_req, res) => {
  res.status(503).json({ success: false, error: "Payment system not yet available. Coming in v1.1." });
});

// GET /internal/credit-logs — diğer servislerin internal erişimi
app.get("/internal/credit-logs", async (req, res) => {
  try {
    getInternalPayload(req);
    const userId = req.query.userId as string;
    const logs = await CreditLog.find({ userId }).sort({ createdAt: -1 }).limit(10);
    res.json({ success: true, data: logs } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", service: "credit" }));

mongoose.connect(MONGO_URI!).then(() => {
  app.listen(PORT, () => console.log(`[credit] Listening on :${PORT}`));
}).catch(err => { console.error("[credit] MongoDB failed", err); process.exit(1); });
