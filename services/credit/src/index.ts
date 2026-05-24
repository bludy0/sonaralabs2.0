import { logger } from "./logger"
// services/credit/src/index.ts
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import { InternalJwtPayload, SpendCreditPayload, ApiResponse } from "@sonaralabs/types";

const app = express();

const { PORT = "3005", MONGO_URI, INTERNAL_JWT_SECRET } = process.env;
if (!MONGO_URI || !INTERNAL_JWT_SECRET) { logger.error("Missing env"); process.exit(1); }

// ── STRIPE ───────────────────────────────────────────────────────────────────
const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" })
  : null;

// ── CREDIT PACKAGES ──────────────────────────────────────────────────────────
const CREDIT_PACKAGES = [
  { id: "pack_100",  credits: 100,  price: 499,  label: "100 credits" },
  { id: "pack_500",  credits: 500,  price: 1999, label: "500 credits" },
  { id: "pack_1200", credits: 1200, price: 3999, label: "1200 credits" },
] as const;

// ── WEBHOOK route — MUST be before express.json() ────────────────────────────
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeClient || !webhookSecret) {
    return res.status(503).json({ error: "Webhook not configured" });
  }

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    logger.error("[webhook] Signature verification failed", { message: String(err) });
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId  = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits ?? "0");

    if (!userId || credits <= 0) {
      logger.error("[webhook] checkout.session.completed: missing/invalid metadata", { sessionId: session.id, userId, credits });
      return res.status(400).json({ error: "Invalid session metadata" });
    } else {
      try {
        const user = await User.findByIdAndUpdate(
          userId,
          { $inc: { creditBalance: credits } },
          { new: true, select: "creditBalance" }
        );
        if (user) {
          await CreditLog.create({
            userId,
            amount: credits,
            type: "earn",
            reason: `stripe_purchase:${session.metadata?.packageId}`,
            relatedId: session.id,
            relatedModel: "stripe_session",
            balanceAfter: user.creditBalance,
          });
          logger.info(`[webhook] Added ${credits} credits to user ${userId}`);
        } else {
          logger.error("[webhook] User not found", { userId, sessionId: session.id });
        }
      } catch (err) {
        logger.error("[webhook] Failed to add credits", { message: String(err) });
        return res.status(500).json({ error: "Failed to process payment" });
      }
    }
  }

  res.json({ received: true });
});

// ── JSON middleware (after webhook raw route) ─────────────────────────────────
app.use(express.json({ limit: "8kb" }));

// ── MODELS ────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  creditBalance: { type: Number, default: 0 },  // auth servisiyle senkron; earn endpoint ile 100 verilir
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
  const payload = jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
  if (!payload._internal) throw new Error("Not an internal token");
  return payload;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// GET /packages — available credit packages (no auth required)
app.get("/packages", (_req, res) => {
  res.json({ success: true, data: CREDIT_PACKAGES });
});

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
    logger.error("spend error", { message: String(err) });
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
    logger.error("earn error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /purchase — Stripe Checkout session oluştur
app.post("/purchase", async (req, res) => {
  if (!stripeClient) {
    return res.status(503).json({ success: false, error: "Payment system not configured" });
  }
  try {
    const { sub: userId } = getInternalPayload(req);
    const { packageId, successUrl, cancelUrl } = req.body as {
      packageId: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!pkg) return res.status(400).json({ success: false, error: "Invalid package" });

    const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:5173";
    const safeSuccessUrl = (successUrl?.startsWith(FRONTEND)) ? successUrl : `${FRONTEND}/dashboard?purchase=success`;
    const safeCancelUrl  = (cancelUrl?.startsWith(FRONTEND))  ? cancelUrl  : `${FRONTEND}/dashboard?purchase=cancelled`;

    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: pkg.price,
          product_data: {
            name: `Sonaralabs — ${pkg.label}`,
            description: `${pkg.credits} AI generation credits`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        userId,
        packageId: pkg.id,
        credits: String(pkg.credits),
      },
      success_url: safeSuccessUrl,
      cancel_url: safeCancelUrl,
    });

    res.json({ success: true, data: { checkoutUrl: session.url, sessionId: session.id } });
  } catch (err) {
    logger.error("[purchase] error", { message: String(err) });
    res.status(500).json({ success: false, error: "Failed to create checkout session" });
  }
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
  app.listen(PORT, () => logger.info(`[credit] Listening on :${PORT}`));
}).catch(err => { logger.error("[credit] MongoDB failed", { message: String(err) }); process.exit(1); });
