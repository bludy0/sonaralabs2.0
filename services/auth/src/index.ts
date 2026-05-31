import { logger } from "./logger"
// services/auth/src/index.ts
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import axios from "axios";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import { UserJwtPayload, InternalJwtPayload, SpendCreditPayload, ApiResponse } from "@sonaralabs/types";

const app = express();
// Stripe webhook needs the raw, unparsed body for signature verification —
// skip JSON parsing for that path so the route-level express.raw() gets the stream.
app.use((req, res, next) => {
  if (req.path === "/credits/webhook") return next();
  express.json({ limit: "16kb" })(req, res, next);
});
app.use(cookieParser());

// ── ENV ───────────────────────────────────────────────────────────────────────
const {
  PORT = "3001",
  MONGO_URI,
  ACCESS_JWT_SECRET,
  REFRESH_JWT_SECRET,
  INTERNAL_JWT_SECRET,
  ACCESS_TOKEN_TTL    = "15m",
  REFRESH_TOKEN_TTL_DAYS = "7",
  // Email
  SMTP_HOST           = "",
  SMTP_PORT           = "465",
  SMTP_SECURE         = "true",
  SMTP_USER           = "",
  SMTP_PASS           = "",
  EMAIL_FROM          = "Sonaralabs <noreply@sonaralabs.io>",
  APP_URL             = "http://localhost:5174",
} = process.env;

if (!MONGO_URI || !ACCESS_JWT_SECRET || !REFRESH_JWT_SECRET || !INTERNAL_JWT_SECRET) {
  logger.error("Missing required env vars");
  process.exit(1);
}

const REFRESH_TTL_MS        = parseInt(REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS   = 24 * 60 * 60 * 1000; // 24 saat
const RESET_TOKEN_TTL_MS    = 60 * 60 * 1000;       // 1 saat
const EMAIL_ENABLED         = Boolean(SMTP_HOST && SMTP_PASS);
const MAX_LOGIN_ATTEMPTS    = 5;
const LOCKOUT_DURATION_MS   = 15 * 60 * 1000; // 15 dakika

// ── NODEMAILER ────────────────────────────────────────────────────────────────
const transporter = EMAIL_ENABLED
  ? nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   parseInt(SMTP_PORT),
      secure: SMTP_SECURE === "true",
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

// ── EMAIL TEMPLATES ───────────────────────────────────────────────────────────

/** Tüm mailler için paylaşılan wrapper */
function emailWrapper(body: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#111118;border-radius:12px;border:1px solid #1e1e2e;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #1e1e2e">
            <span style="font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#888">AI_CORE_v2.0</span>
            <span style="display:inline-block;margin-left:12px;font-size:18px;font-weight:800;color:#fff;letter-spacing:-.01em">SONARALABS</span>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px">${body}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #1e1e2e">
            <p style="margin:0;font-size:11px;color:#555">
              Bu email <a href="https://sonaralabs.io" style="color:#888;text-decoration:none">sonaralabs.io</a> tarafından gönderildi.
              Hesabınızla ilgili sorunlar için <a href="mailto:support@bludy.com.tr" style="color:#888;text-decoration:none">support@bludy.com.tr</a> adresine yazabilirsiniz.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const ACCENT = "#ffdc73";
const ACCENT_ON = "#624e00";
const BTN = `display:inline-block;padding:12px 28px;background:${ACCENT};color:${ACCENT_ON};font-weight:700;border-radius:8px;text-decoration:none;letter-spacing:.05em;font-size:14px`;

/** Ortak mail gönderici — dev'de console'a yazar */
async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!transporter) {
    logger.info(`\n[auth] 📧  ${subject}\n  To: ${to}\n  ${text}\n`);
    return;
  }
  await transporter.sendMail({ from: EMAIL_FROM, to, subject, html, text });
}

// ── EMAIL FONKSİYONLARI ───────────────────────────────────────────────────────

async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${token}`;
  await sendMail(
    email,
    "Sonaralabs — Email adresinizi onaylayın",
    emailWrapper(`
      <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:-.01em">
        Email Onayı
      </h2>
      <p style="margin:0 0 24px;color:#888;font-size:14px;line-height:1.6">
        Sonaralabs hesabınızı aktif etmek için aşağıdaki butona tıklayın.<br>
        Link <strong style="color:#ccc">24 saat</strong> geçerlidir.
      </p>
      <a href="${link}" style="${BTN}">Email'i Onayla →</a>
      <p style="margin:28px 0 0;font-size:12px;color:#555">
        Bu emaili siz istemediyseniz görmezden gelebilirsiniz — hesabınız oluşturulmayacak.
      </p>`),
    `Email onay linkiniz: ${link}`,
  );
}

async function sendLoginNotificationEmail(
  email: string,
  ip: string,
  userAgent: string,
): Promise<void> {
  const now = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  const device = userAgent.length > 80 ? userAgent.slice(0, 80) + "…" : userAgent;
  await sendMail(
    email,
    "Sonaralabs — Yeni giriş tespit edildi",
    emailWrapper(`
      <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:-.01em">
        Yeni Giriş
      </h2>
      <p style="margin:0 0 20px;color:#888;font-size:14px;line-height:1.6">
        Hesabınıza yeni bir giriş yapıldı.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#0d0d16;border-radius:8px;padding:16px;margin-bottom:24px">
        <tr><td style="padding:6px 0;color:#555;font-size:12px;width:90px">Zaman</td>
            <td style="padding:6px 0;color:#ccc;font-size:13px">${now}</td></tr>
        <tr><td style="padding:6px 0;color:#555;font-size:12px">IP Adresi</td>
            <td style="padding:6px 0;color:#ccc;font-size:13px;font-family:monospace">${ip || "bilinmiyor"}</td></tr>
        <tr><td style="padding:6px 0;color:#555;font-size:12px">Tarayıcı</td>
            <td style="padding:6px 0;color:#ccc;font-size:13px">${device || "bilinmiyor"}</td></tr>
      </table>
      <p style="margin:0 0 20px;color:#888;font-size:14px;line-height:1.6">
        Bu girişi <strong style="color:#fff">siz yaptıysanız</strong> bu emaili görmezden gelebilirsiniz.
        <strong style="color:#ff6b6b">Siz yapmadıysanız</strong> hemen şifrenizi değiştirin.
      </p>
      <a href="${APP_URL}/settings" style="${BTN}">Hesabımı Güvene Al →</a>`),
    `Sonaralabs hesabınıza ${now} tarihinde ${ip} IP adresinden giriş yapıldı.`,
  );
}

async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = `${APP_URL}/reset-password?token=${token}`;
  await sendMail(
    email,
    "Sonaralabs — Şifre sıfırlama talebi",
    emailWrapper(`
      <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:-.01em">
        Şifre Sıfırlama
      </h2>
      <p style="margin:0 0 24px;color:#888;font-size:14px;line-height:1.6">
        Şifrenizi sıfırlamak için aşağıdaki butona tıklayın.<br>
        Link <strong style="color:#ccc">1 saat</strong> geçerlidir.
      </p>
      <a href="${link}" style="${BTN}">Şifremi Sıfırla →</a>
      <p style="margin:28px 0 0;font-size:12px;color:#555">
        Bu talebi siz yapmadıysanız bu emaili görmezden gelebilirsiniz — şifreniz değişmeyecek.
      </p>`),
    `Şifre sıfırlama linkiniz: ${link}`,
  );
}

async function sendPasswordChangedEmail(email: string, ip: string): Promise<void> {
  const now = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  await sendMail(
    email,
    "Sonaralabs — Şifreniz değiştirildi",
    emailWrapper(`
      <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:-.01em">
        Şifre Değişikliği
      </h2>
      <p style="margin:0 0 20px;color:#888;font-size:14px;line-height:1.6">
        Hesabınızın şifresi başarıyla değiştirildi. Tüm aktif oturumlarınız sonlandırıldı.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#0d0d16;border-radius:8px;padding:16px;margin-bottom:24px">
        <tr><td style="padding:6px 0;color:#555;font-size:12px;width:90px">Zaman</td>
            <td style="padding:6px 0;color:#ccc;font-size:13px">${now}</td></tr>
        <tr><td style="padding:6px 0;color:#555;font-size:12px">IP Adresi</td>
            <td style="padding:6px 0;color:#ccc;font-size:13px;font-family:monospace">${ip || "bilinmiyor"}</td></tr>
      </table>
      <p style="margin:0 0 20px;color:#ff6b6b;font-size:14px;line-height:1.6;font-weight:600">
        ⚠️  Bu değişikliği siz yapmadıysanız lütfen hemen destek ekibimize bildirin.
      </p>
      <a href="mailto:support@bludy.com.tr" style="${BTN}">Destek ile İletişime Geç →</a>`),
    `Sonaralabs şifreniz ${now} tarihinde ${ip} IP adresinden değiştirildi. Siz yapmadıysanız support@bludy.com.tr adresine yazın.`,
  );
}

// ── MONGOOSE MODELS ───────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  email:               { type: String, required: true, unique: true, lowercase: true },
  passwordHash:        { type: String, required: true, select: false },
  role:                { type: String, enum: ["user", "admin"], default: "user" },
  creditBalance:       { type: Number, default: 0 },
  storageUsed:         { type: Number, default: 0 },
  preferences:         { accentColor: { type: String, default: "#0F3460" } },
  // ── Email onayı ──────────────────────────────────────────────────────────
  isEmailVerified:     { type: Boolean, default: false },
  emailVerifyToken:    { type: String, select: false },
  emailVerifyExpires:  { type: Date,   select: false },
  // ── Şifre sıfırlama ──────────────────────────────────────────────────────
  passwordResetToken:  { type: String, select: false },
  passwordResetExpires:{ type: Date,   select: false },
  // ── Brute-force koruması ─────────────────────────────────────────────────
  failedLoginAttempts: { type: Number, default: 0 },
  lockoutUntil:        { type: Date,   select: false },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const refreshTokenSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  userAgent: String,
  ip:        String,
}, { timestamps: true });

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

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

// ── STRIPE ────────────────────────────────────────────────────────────────────
const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

const CREDIT_PACKAGES = [
  { id: "pack_100",  credits: 100,  price: 499,  label: "100 credits" },
  { id: "pack_500",  credits: 500,  price: 1999, label: "500 credits" },
  { id: "pack_1200", credits: 1200, price: 3999, label: "1200 credits" },
] as const;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makeAccessToken(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, role } as Omit<UserJwtPayload, "iat" | "exp">,
    ACCESS_JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_TTL as any }
  );
}

function makeRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

function makeVerifyToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Vercel (frontend) → Render (backend) cross-domain deploy için
// sameSite: "none" + secure: true gerekir. Local'de "strict" + secure: false.
const IS_PROD = process.env.NODE_ENV === "production";

function setRefreshCookie(res: express.Response, token: string) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? "none" : "strict",
    maxAge:   REFRESH_TTL_MS,
    path:     "/api/auth",
  });
}

function setAccessCookie(res: express.Response, token: string) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? "none" : "strict",
    maxAge:   15 * 60 * 1000,
  });
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// POST /register
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const strongPassword = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
    if (!email || !password || !strongPassword.test(password)) {
      return res.status(400).json({ success: false,
        error: "Password must be at least 8 characters with an uppercase letter and a number" });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ success: false, error: "Email already registered" });

    const passwordHash    = await bcrypt.hash(password, 12);
    const verifyToken     = makeVerifyToken();
    const verifyTokenHash = hashToken(verifyToken);

    const user = await User.create({
      email,
      passwordHash,
      isEmailVerified:    false,
      emailVerifyToken:   verifyTokenHash,
      emailVerifyExpires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    });

    // Email gönder (SMTP yoksa console'a yazar)
    await sendVerificationEmail(email, verifyToken).catch(err =>
      logger.error("[auth] Email gönderilemedi:", { message: String(err) })
    );

    // Kayıt bonusu — direkt DB, HTTP round-trip yok
    const INITIAL_CREDIT = parseInt(process.env.INITIAL_CREDIT_BALANCE ?? "100");
    if (INITIAL_CREDIT > 0) {
      User.findByIdAndUpdate(user._id, { $inc: { creditBalance: INITIAL_CREDIT } }, { new: true })
        .then(updated => updated && CreditLog.create({
          userId: user._id, amount: INITIAL_CREDIT, type: "earn",
          reason: "register_bonus", balanceAfter: updated.creditBalance,
        }))
        .catch(err => logger.error("[auth] Register bonus failed", { userId: String(user._id), message: String(err) }));
    }

    res.status(201).json({
      success: true,
      data: {
        requiresVerification: true,
        email: user.email,
        message: "Kayıt başarılı. Email adresinize gönderilen onay linkine tıklayın.",
      },
    } as ApiResponse);
  } catch (err) {
    logger.error("register error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// GET /verify-email?token=xxx  (public)
app.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query as { token?: string };
    if (!token) return res.status(400).json({ success: false, error: "Token required" });

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      emailVerifyToken:   tokenHash,
      emailVerifyExpires: { $gt: new Date() },
      isEmailVerified:    false,
    }).select("+emailVerifyToken +emailVerifyExpires");

    if (!user) {
      return res.status(400).json({ success: false,
        error: "Geçersiz veya süresi dolmuş onay linki." });
    }

    await User.findByIdAndUpdate(user._id, {
      $set:   { isEmailVerified: true },
      $unset: { emailVerifyToken: 1, emailVerifyExpires: 1 },
    });

    // Otomatik giriş yaptır
    const accessToken  = makeAccessToken(String(user._id), user.role);
    const refreshToken = makeRefreshToken();
    await RefreshToken.create({
      userId:    user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      data: {
        userId:        user._id,
        email:         user.email,
        role:          user.role,
        creditBalance: user.creditBalance,
        storageUsed:   user.storageUsed,
        preferences:   user.preferences,
      },
    } as ApiResponse);
  } catch (err) {
    logger.error("verify-email error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /resend-verification  (public)
app.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "Email required" });

    const user = await User.findOne({ email, isEmailVerified: false })
      .select("+emailVerifyExpires");

    // Güvenlik: kullanıcı yoksa veya zaten onaylıysa aynı yanıtı dön (enumeration önle)
    if (!user) {
      return res.json({ success: true,
        message: "Onay emaili gönderildi (eğer kayıtlı ve onaysız bir hesap varsa)." });
    }

    // Throttle: son 60 saniyede gönderilmişse beklet
    if (user.emailVerifyExpires &&
        user.emailVerifyExpires.getTime() > Date.now() + VERIFY_TOKEN_TTL_MS - 60_000) {
      return res.status(429).json({ success: false,
        error: "Lütfen 60 saniye bekleyin." });
    }

    const verifyToken     = makeVerifyToken();
    const verifyTokenHash = hashToken(verifyToken);
    user.emailVerifyToken   = verifyTokenHash;
    user.emailVerifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
    await user.save();

    await sendVerificationEmail(email, verifyToken).catch(err =>
      logger.error("[auth] Resend email hatası:", { message: String(err) })
    );

    res.json({ success: true, message: "Onay emaili tekrar gönderildi." });
  } catch (err) {
    logger.error("resend-verification error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// VULN-19: Dummy hash for constant-time comparison when user doesn't exist
// Generated once with bcrypt.hashSync("dummy", 12) — prevents timing oracle attacks
const DUMMY_HASH = "$2a$12$LGnCnc./bhN1q.AMCRZXaOgBIQ3N5pnFRbE1pOQ8GRpNqBSSLOjsK";

// POST /login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+passwordHash +lockoutUntil");
    if (!user) {
      // VULN-19: Run bcrypt anyway to prevent timing-based user enumeration
      await bcrypt.compare(password ?? "", DUMMY_HASH);
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Brute-force: hesap kilitli mi?
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const remaining = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60_000);
      return res.status(429).json({
        success: false,
        error: `account_locked`,
        message: `Çok fazla başarısız giriş. Hesabınız ${remaining} dakika kilitli.`,
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      // Başarısız deneme sayacını artır
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const update: Record<string, unknown> = { failedLoginAttempts: attempts };
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        update.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        update.failedLoginAttempts = 0;
      }
      await User.findByIdAndUpdate(user._id, update);
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Email onayı kontrolü (SMTP yapılandırılmışsa zorunlu)
    if (EMAIL_ENABLED && !user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        error:   "email_not_verified",
        message: "Email adresinizi onaylamanız gerekiyor. Onay emaili için giriş sayfasındaki linki kullanın.",
      });
    }

    // Başarılı giriş — sayacı sıfırla
    if (user.failedLoginAttempts > 0) {
      await User.findByIdAndUpdate(user._id, { failedLoginAttempts: 0, lockoutUntil: null });
    }

    const accessToken  = makeAccessToken(String(user._id), user.role);
    const refreshToken = makeRefreshToken();
    await RefreshToken.create({
      userId:    user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: req.headers["user-agent"],
      ip:        req.ip,
    });

    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    // Giriş bildirim maili — non-blocking, hata olursa sessizce devam et
    sendLoginNotificationEmail(
      user.email,
      req.ip ?? req.headers["x-forwarded-for"] as string ?? "",
      req.headers["user-agent"] ?? "",
    ).catch(err => logger.warn("[auth] Login notification email failed:", { message: String(err) }));

    res.json({
      success: true,
      data: {
        userId:        user._id,
        email:         user.email,
        role:          user.role,
        creditBalance: user.creditBalance,
      },
    } as ApiResponse);
  } catch (err) {
    logger.error("login error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /forgot-password  (public)
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "Email required" });

    // Enumeration önleme: kullanıcı yoksa bile aynı yanıtı dön
    const genericOk = { success: true, message: "Şifre sıfırlama emaili gönderildi (hesap kayıtlıysa)." };

    const user = await User.findOne({ email });
    if (!user) return res.json(genericOk);

    // Throttle: son 60 saniyede gönderilmişse beklet
    if (user.passwordResetExpires &&
        user.passwordResetExpires.getTime() > Date.now() + RESET_TOKEN_TTL_MS - 60_000) {
      return res.status(429).json({ success: false, error: "Lütfen 60 saniye bekleyin." });
    }

    const resetToken     = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashToken(resetToken);
    await User.findByIdAndUpdate(user._id, {
      passwordResetToken:   resetTokenHash,
      passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    await sendPasswordResetEmail(email, resetToken).catch(err =>
      logger.error("[auth] Reset email gönderilemedi:", { message: String(err) })
    );

    res.json(genericOk);
  } catch (err) {
    logger.error("forgot-password error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /reset-password  (public)
app.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword)
      return res.status(400).json({ success: false, error: "token and newPassword required" });

    const strongPassword = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
    if (!strongPassword.test(newPassword))
      return res.status(400).json({
        success: false,
        error: "Password must be at least 8 characters with an uppercase letter and a number",
      });

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      passwordResetToken:   tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select("+passwordResetToken +passwordResetExpires");

    if (!user) {
      return res.status(400).json({ success: false, error: "Geçersiz veya süresi dolmuş link." });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(user._id, {
      $set:   { passwordHash: newHash, failedLoginAttempts: 0 },
      $unset: { passwordResetToken: 1, passwordResetExpires: 1, lockoutUntil: 1 },
    });

    // Tüm oturumları sonlandır
    await RefreshToken.deleteMany({ userId: user._id });

    sendPasswordChangedEmail(user.email, req.ip ?? "").catch(() => {});

    res.json({ success: true, message: "Şifreniz başarıyla sıfırlandı. Lütfen tekrar giriş yapın." });
  } catch (err) {
    logger.error("reset-password error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /refresh
app.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ success: false, error: "No refresh token" });

    const record = await RefreshToken.findOne({ tokenHash: hashToken(token) });
    if (!record || record.expiresAt < new Date()) {
      res.clearCookie("refresh_token", { path: "/api/auth", sameSite: IS_PROD ? "none" : "strict", secure: IS_PROD });
      return res.status(401).json({ success: false, error: "Refresh token invalid or expired" });
    }

    const user = await User.findById(record.userId);
    if (!user) return res.status(401).json({ success: false, error: "User not found" });

    await RefreshToken.findByIdAndDelete(record._id);
    const newRefresh = makeRefreshToken();
    await RefreshToken.create({
      userId:    user._id,
      tokenHash: hashToken(newRefresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: req.headers["user-agent"],
      ip:        req.ip,
    });

    const newAccess = makeAccessToken(String(user._id), user.role);
    setAccessCookie(res, newAccess);
    setRefreshCookie(res, newRefresh);

    res.json({ success: true, message: "Tokens refreshed" } as ApiResponse);
  } catch (err) {
    logger.error("refresh error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /logout
app.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (token) await RefreshToken.findOneAndDelete({ tokenHash: hashToken(token) });
    res.clearCookie("access_token", { sameSite: IS_PROD ? "none" : "strict", secure: IS_PROD });
    res.clearCookie("refresh_token", { path: "/api/auth", sameSite: IS_PROD ? "none" : "strict", secure: IS_PROD });
    res.json({ success: true, message: "Logged out" } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /logout-all
app.post("/logout-all", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });
    const payload = jwt.verify(internalToken, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
    await RefreshToken.deleteMany({ userId: payload.sub });
    res.clearCookie("access_token", { sameSite: IS_PROD ? "none" : "strict", secure: IS_PROD });
    res.clearCookie("refresh_token", { path: "/api/auth", sameSite: IS_PROD ? "none" : "strict", secure: IS_PROD });
    res.json({ success: true, message: "All sessions terminated" } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// GET /me
app.get("/me", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });
    const payload = jwt.verify(internalToken, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
    const user = await User.findById(payload.sub);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: {
      userId: user._id, email: user.email, role: user.role,
      creditBalance: user.creditBalance, storageUsed: user.storageUsed,
      preferences: user.preferences, isEmailVerified: user.isEmailVerified,
    } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// PATCH /me/preferences
app.patch("/me/preferences", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });
    const payload = jwt.verify(internalToken, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
    const { accentColor } = req.body;
    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor ?? "")) {
      return res.status(400).json({ success: false, error: "accentColor must be a valid hex color" });
    }
    const user = await User.findByIdAndUpdate(
      payload.sub, { "preferences.accentColor": accentColor }, { new: true }
    );
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: { preferences: user.preferences } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// PATCH /me/password
app.patch("/me/password", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });
    const payload = jwt.verify(internalToken, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword)
      return res.status(400).json({ success: false, error: "oldPassword and newPassword required" });
    if (newPassword.length < 8)
      return res.status(400).json({ success: false, error: "New password must be at least 8 characters" });
    const user = await User.findById(payload.sub).select("+passwordHash");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, error: "Current password is incorrect" });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    await RefreshToken.deleteMany({ userId: user._id });

    // Şifre değişikliği bildirim maili — non-blocking
    sendPasswordChangedEmail(
      user.email,
      req.ip ?? req.headers["x-forwarded-for"] as string ?? "",
    ).catch(err => logger.warn("[auth] Password changed email failed:", { message: String(err) }));

    res.json({ success: true, message: "Password updated. Please log in again." } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// DELETE /me
app.delete("/me", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });
    const payload = jwt.verify(internalToken, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
    await RefreshToken.deleteMany({ userId: payload.sub });
    await User.findByIdAndDelete(payload.sub);
    res.clearCookie("access_token", { sameSite: IS_PROD ? "none" : "strict", secure: IS_PROD });
    res.clearCookie("refresh_token", { path: "/api/auth", sameSite: IS_PROD ? "none" : "strict", secure: IS_PROD });
    res.json({ success: true, message: "Account deleted" } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// GET /internal/users/:id
app.get("/internal/users/:id", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });
    jwt.verify(internalToken, INTERNAL_JWT_SECRET!);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: {
      id: user._id, email: user.email, role: user.role,
      creditBalance: user.creditBalance, isEmailVerified: user.isEmailVerified,
    } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// ── CREDIT ROUTES (credit servisi buraya taşındı) ─────────────────────────────

// Webhook: raw body — global JSON parser skips this path (see middleware above),
// so express.raw() here receives the untouched body Stripe signature check needs.
app.post("/credits/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig           = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeClient || !webhookSecret)
    return res.status(503).json({ error: "Webhook not configured" });

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    logger.error("[webhook] Signature failed", { message: String(err) });
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId  = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits ?? "0");

    if (!userId || credits <= 0) {
      logger.error("[webhook] Missing/invalid metadata", { sessionId: session.id });
      return res.status(400).json({ error: "Invalid session metadata" });
    }
    try {
      const user = await User.findByIdAndUpdate(
        userId, { $inc: { creditBalance: credits } }, { new: true, select: "creditBalance" }
      );
      if (user) {
        await CreditLog.create({
          userId, amount: credits, type: "earn",
          reason: `stripe_purchase:${session.metadata?.packageId}`,
          relatedId: session.id, relatedModel: "stripe_session",
          balanceAfter: user.creditBalance,
        });
        logger.info(`[webhook] Added ${credits} credits to ${userId}`);
      } else {
        logger.error("[webhook] User not found", { userId });
      }
    } catch (err) {
      logger.error("[webhook] Failed to add credits", { message: String(err) });
      return res.status(500).json({ error: "Failed to process payment" });
    }
  }
  res.json({ received: true });
});

app.get("/credits/packages", (_req, res) => {
  res.json({ success: true, data: CREDIT_PACKAGES });
});

// ── credit helper ─────────────────────────────────────────────────────────────
function getPayload(req: express.Request): InternalJwtPayload {
  const token = req.headers["x-internal-token"] as string;
  if (!token) throw new Error("No internal token");
  return jwt.verify(token, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
}

app.get("/credits/balance", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const user = await User.findById(userId).select("creditBalance");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: { creditBalance: user.creditBalance } } as ApiResponse);
  } catch { res.status(401).json({ success: false, error: "Unauthorized" }); }
});

app.get("/credits/history", async (req, res) => {
  try {
    const { sub: userId } = getPayload(req);
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const [logs, total] = await Promise.all([
      CreditLog.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      CreditLog.countDocuments({ userId }),
    ]);
    res.json({ success: true, data: { logs, total, page, pages: Math.ceil(total / limit) } } as ApiResponse);
  } catch { res.status(401).json({ success: false, error: "Unauthorized" }); }
});

// POST /credits/spend — INTERNAL: generation/upload çağırır (atomik)
app.post("/credits/spend", async (req, res) => {
  try {
    getPayload(req);
    const { userId, amount, reason, relatedId, relatedModel } = req.body as SpendCreditPayload;
    if (!userId || !amount || amount <= 0)
      return res.status(400).json({ success: false, error: "Invalid payload" });

    const updated = await User.findOneAndUpdate(
      { _id: userId, creditBalance: { $gte: amount } },
      { $inc: { creditBalance: -amount } },
      { new: true, select: "creditBalance" }
    );
    if (!updated) return res.status(422).json({ success: false, error: "Insufficient credits" });

    await CreditLog.create({
      userId, amount: -amount, type: "spend",
      reason, relatedId, relatedModel, balanceAfter: updated.creditBalance,
    });
    res.json({ success: true, data: { newBalance: updated.creditBalance } } as ApiResponse);
  } catch (err) {
    logger.error("spend error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /credits/earn — INTERNAL: register bonus, refund için
app.post("/credits/earn", async (req, res) => {
  try {
    getPayload(req);
    const { userId, amount, reason } = req.body;
    if (!userId || !amount || amount <= 0)
      return res.status(400).json({ success: false, error: "Invalid payload" });

    const updated = await User.findByIdAndUpdate(
      userId, { $inc: { creditBalance: amount } }, { new: true, select: "creditBalance" }
    );
    if (!updated) return res.status(404).json({ success: false, error: "User not found" });

    await CreditLog.create({
      userId, amount, type: "earn",
      reason: reason || "bonus", balanceAfter: updated.creditBalance,
    });
    res.json({ success: true, data: { newBalance: updated.creditBalance } } as ApiResponse);
  } catch (err) {
    logger.error("earn error", { message: String(err) });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /credits/purchase — Stripe Checkout
app.post("/credits/purchase", async (req, res) => {
  if (!stripeClient)
    return res.status(503).json({ success: false, error: "Payment system not configured" });
  try {
    const { sub: userId } = getPayload(req);
    const { packageId, successUrl, cancelUrl } = req.body as {
      packageId: string; successUrl?: string; cancelUrl?: string;
    };
    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!pkg) return res.status(400).json({ success: false, error: "Invalid package" });

    const FRONTEND     = process.env.FRONTEND_URL ?? "http://localhost:5173";
    const safeSuccess  = successUrl?.startsWith(FRONTEND) ? successUrl : `${FRONTEND}/dashboard?purchase=success`;
    const safeCancel   = cancelUrl?.startsWith(FRONTEND)  ? cancelUrl  : `${FRONTEND}/dashboard?purchase=cancelled`;

    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd", unit_amount: pkg.price,
          product_data: { name: `Sonaralabs — ${pkg.label}`, description: `${pkg.credits} AI generation credits` },
        },
        quantity: 1,
      }],
      metadata: { userId, packageId: pkg.id, credits: String(pkg.credits) },
      success_url: safeSuccess,
      cancel_url:  safeCancel,
    });
    res.json({ success: true, data: { checkoutUrl: session.url, sessionId: session.id } });
  } catch (err) {
    logger.error("[purchase] error", { message: String(err) });
    res.status(500).json({ success: false, error: "Failed to create checkout session" });
  }
});

// GET /internal/credit-logs — admin için
app.get("/internal/credit-logs", async (req, res) => {
  try {
    getPayload(req);
    const userId = req.query.userId as string;
    const logs = await CreditLog.find({ userId }).sort({ createdAt: -1 }).limit(10);
    res.json({ success: true, data: logs } as ApiResponse);
  } catch { res.status(401).json({ success: false, error: "Unauthorized" }); }
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
// Health check
app.get("/health", (_, res) => res.json({
  status: "ok", service: "auth", emailEnabled: EMAIL_ENABLED,
}));

// ── EXPORT ────────────────────────────────────────────────────────────────────
export { app, User, RefreshToken };

// ── BOOTSTRAP ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  mongoose.connect(MONGO_URI!).then(() => {
    logger.info("[auth] MongoDB connected");
    if (!EMAIL_ENABLED) {
      logger.warn("[auth] ⚠️  SMTP yapılandırılmamış — email onayı DEV modunda (console log)");
    }
    app.listen(PORT, () => logger.info(`[auth] Listening on :${PORT}`));
  }).catch(err => { logger.error("[auth] MongoDB connection failed", { message: String(err) }); process.exit(1); });
}
