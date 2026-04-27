// services/auth/src/index.ts
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import axios from "axios";
import nodemailer from "nodemailer";
import { UserJwtPayload, InternalJwtPayload, ApiResponse } from "@sonaralabs/types";

const app = express();
app.use(express.json());
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
  CREDIT_SERVICE_URL  = "http://credit:3005",
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
  console.error("Missing required env vars");
  process.exit(1);
}

const REFRESH_TTL_MS        = parseInt(REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS   = 24 * 60 * 60 * 1000; // 24 saat
const EMAIL_ENABLED         = Boolean(SMTP_HOST && SMTP_PASS);

// ── NODEMAILER ────────────────────────────────────────────────────────────────
const transporter = EMAIL_ENABLED
  ? nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   parseInt(SMTP_PORT),
      secure: SMTP_SECURE === "true",
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${token}`;

  if (!transporter) {
    // Email servisi yokken geliştirme kolaylığı: console'a yazdır
    console.log(`\n[auth] 📧  Email onay linki (DEV — SMTP yapılandırılmamış):\n  ${link}\n`);
    return;
  }

  await transporter.sendMail({
    from:    EMAIL_FROM,
    to:      email,
    subject: "Sonaralabs — Email adresinizi onaylayın",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2 style="margin-bottom:8px">Email adresinizi onaylayın</h2>
        <p style="color:#888;margin-bottom:24px">
          Sonaralabs hesabınızı aktif etmek için aşağıdaki butona tıklayın.
          Link 24 saat geçerlidir.
        </p>
        <a href="${link}"
           style="display:inline-block;padding:12px 28px;background:#ffdc73;color:#624e00;
                  font-weight:700;border-radius:8px;text-decoration:none;letter-spacing:.05em">
          Email'i Onayla
        </a>
        <p style="color:#aaa;font-size:12px;margin-top:32px">
          Bu emaili siz istemediyseniz görmezden gelebilirsiniz.
        </p>
      </div>`,
    text: `Email onay linkiniz: ${link}`,
  });
}

// ── MONGOOSE MODELS ───────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  email:               { type: String, required: true, unique: true, lowercase: true },
  passwordHash:        { type: String, required: true, select: false },
  role:                { type: String, enum: ["user", "admin"], default: "user" },
  creditBalance:       { type: Number, default: 100 },
  storageUsed:         { type: Number, default: 0 },
  preferences:         { accentColor: { type: String, default: "#0F3460" } },
  // ── Email onayı ──────────────────────────────────────────────────────────
  isEmailVerified:     { type: Boolean, default: false },
  emailVerifyToken:    { type: String, select: false },
  emailVerifyExpires:  { type: Date,   select: false },
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

function setRefreshCookie(res: express.Response, token: string) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   REFRESH_TTL_MS,
    path:     "/api/auth",
  });
}

function setAccessCookie(res: express.Response, token: string) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
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
      console.error("[auth] Email gönderilemedi:", err.message)
    );

    // Kayıt bonusu log (non-fatal)
    const internalToken = jwt.sign(
      { sub: String(user._id), role: user.role, _internal: true },
      INTERNAL_JWT_SECRET!, { expiresIn: "5m" }
    );
    axios.post(`${CREDIT_SERVICE_URL}/earn`,
      { userId: String(user._id), amount: 100, reason: "register_bonus" },
      { headers: { "x-internal-token": internalToken } }
    ).catch(err => console.warn("[auth] Credit earn log failed:", err.message));

    res.status(201).json({
      success: true,
      data: {
        requiresVerification: true,
        email: user.email,
        message: "Kayıt başarılı. Email adresinize gönderilen onay linkine tıklayın.",
      },
    } as ApiResponse);
  } catch (err) {
    console.error("register error", err);
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

    // Onayla ve token'ı temizle
    user.isEmailVerified   = true;
    user.emailVerifyToken  = undefined as any;
    user.emailVerifyExpires = undefined as any;
    await user.save();

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
    console.error("verify-email error", err);
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
      console.error("[auth] Resend email hatası:", err.message)
    );

    res.json({ success: true, message: "Onay emaili tekrar gönderildi." });
  } catch (err) {
    console.error("resend-verification error", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, error: "Invalid credentials" });

    // Email onayı kontrolü (SMTP yapılandırılmışsa zorunlu)
    if (EMAIL_ENABLED && !user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        error:   "email_not_verified",
        message: "Email adresinizi onaylamanız gerekiyor. Onay emaili için giriş sayfasındaki linki kullanın.",
      });
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
    console.error("login error", err);
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
      res.clearCookie("refresh_token", { path: "/api/auth" });
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
    console.error("refresh error", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /logout
app.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (token) await RefreshToken.findOneAndDelete({ tokenHash: hashToken(token) });
    res.clearCookie("access_token");
    res.clearCookie("refresh_token", { path: "/api/auth" });
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
    res.clearCookie("access_token");
    res.clearCookie("refresh_token", { path: "/api/auth" });
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
    res.clearCookie("access_token");
    res.clearCookie("refresh_token", { path: "/api/auth/refresh" });
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

// Health check
app.get("/health", (_, res) => res.json({
  status: "ok", service: "auth", emailEnabled: EMAIL_ENABLED,
}));

// ── EXPORT ────────────────────────────────────────────────────────────────────
export { app, User, RefreshToken };

// ── BOOTSTRAP ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  mongoose.connect(MONGO_URI!).then(() => {
    console.log("[auth] MongoDB connected");
    if (!EMAIL_ENABLED) {
      console.warn("[auth] ⚠️  SMTP yapılandırılmamış — email onayı DEV modunda (console log)");
    }
    app.listen(PORT, () => console.log(`[auth] Listening on :${PORT}`));
  }).catch(err => { console.error("[auth] MongoDB connection failed", err); process.exit(1); });
}
