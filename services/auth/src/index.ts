// services/auth/src/index.ts
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import axios from "axios";
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
  ACCESS_TOKEN_TTL = "15m",
  REFRESH_TOKEN_TTL_DAYS = "7",
  CREDIT_SERVICE_URL = "http://credit:3005",
} = process.env;

if (!MONGO_URI || !ACCESS_JWT_SECRET || !REFRESH_JWT_SECRET || !INTERNAL_JWT_SECRET) {
  console.error("Missing required env vars");
  process.exit(1);
}

const REFRESH_TTL_MS = parseInt(REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000;

// ── MONGOOSE MODELS ───────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  role:         { type: String, enum: ["user", "admin"], default: "user" },
  creditBalance:{ type: Number, default: 0 },
  storageUsed:  { type: Number, default: 0 },
  preferences:  { accentColor: { type: String, default: "#0F3460" } },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const refreshTokenSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  userAgent: String,
  ip:        String,
}, { timestamps: true });

// TTL index: MongoDB otomatik siler
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

function setRefreshCookie(res: express.Response, token: string) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_TTL_MS,
    path: "/api/auth",        // refresh endpoint path'iyle sınırlı
  });
}

function setAccessCookie(res: express.Response, token: string) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000,   // 15 dakika
  });
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// POST /register
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const strongPassword = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
    if (!email || !password || !strongPassword.test(password)) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters with an uppercase letter and a number" });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ success: false, error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });

    const accessToken  = makeAccessToken(String(user._id), user.role);
    const refreshToken = makeRefreshToken();
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    // Kayıt bonusu kredi logunu oluştur (DB default 100 krediyi zaten set etti)
    const internalToken = jwt.sign(
      { sub: String(user._id), role: user.role, _internal: true },
      INTERNAL_JWT_SECRET!,
      { expiresIn: "5m" }
    );
    axios.post(`${CREDIT_SERVICE_URL}/earn`, {
      userId: String(user._id), amount: 100, reason: "register_bonus",
    }, { headers: { "x-internal-token": internalToken } }).catch(err => {
      console.warn("[auth] Credit earn log failed (non-fatal):", err.message);
    });

    res.status(201).json({
      success: true,
      data: { userId: user._id, email: user.email, creditBalance: user.creditBalance },
    } as ApiResponse);
  } catch (err) {
    console.error("register error", err);
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

    const accessToken  = makeAccessToken(String(user._id), user.role);
    const refreshToken = makeRefreshToken();
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      data: { userId: user._id, email: user.email, role: user.role, creditBalance: user.creditBalance },
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

    // Refresh token rotation: eski sil, yeni oluştur
    await RefreshToken.findByIdAndDelete(record._id);
    const newRefresh = makeRefreshToken();
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashToken(newRefresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: req.headers["user-agent"],
      ip: req.ip,
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
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /logout-all — tüm cihazlarda çıkış
app.post("/logout-all", async (req, res) => {
  try {
    // Gateway internal JWT'den userId gelir
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

// GET /me — Gateway internal JWT ile korunan
app.get("/me", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });

    const payload = jwt.verify(internalToken, INTERNAL_JWT_SECRET!) as InternalJwtPayload;
    const user = await User.findById(payload.sub);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    res.json({ success: true, data: { userId: user._id, email: user.email, role: user.role, creditBalance: user.creditBalance, storageUsed: user.storageUsed, preferences: user.preferences } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// PATCH /me/preferences — accent color vb. kullanıcı tercihleri
app.patch("/me/preferences", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });

    const payload = jwt.verify(internalToken, INTERNAL_JWT_SECRET!) as InternalJwtPayload;

    const { accentColor } = req.body;
    const allowed = /^#[0-9a-fA-F]{6}$/.test(accentColor ?? "");
    if (!allowed) {
      return res.status(400).json({ success: false, error: "accentColor must be a valid hex color (e.g. #ff0000)" });
    }

    const user = await User.findByIdAndUpdate(
      payload.sub,
      { "preferences.accentColor": accentColor },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    res.json({ success: true, data: { preferences: user.preferences } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// GET /internal/users/:id — Diğer servislerin kullandığı internal endpoint
app.get("/internal/users/:id", async (req, res) => {
  try {
    const internalToken = req.headers["x-internal-token"] as string;
    if (!internalToken) return res.status(401).json({ success: false, error: "Unauthorized" });
    jwt.verify(internalToken, INTERNAL_JWT_SECRET!); // valid internal token yeterli

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: { id: user._id, email: user.email, role: user.role, creditBalance: user.creditBalance } } as ApiResponse);
  } catch {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

// Health check
app.get("/health", (_, res) => res.json({ status: "ok", service: "auth" }));

// ── EXPORT (for testing) ──────────────────────────────────────────────────────
export { app, User, RefreshToken };

// ── BOOTSTRAP (skip when imported by tests) ───────────────────────────────────
if (require.main === module) {
  mongoose.connect(MONGO_URI!).then(() => {
    console.log("[auth] MongoDB connected");
    app.listen(PORT, () => console.log(`[auth] Listening on :${PORT}`));
  }).catch(err => { console.error("[auth] MongoDB connection failed", err); process.exit(1); });
}
