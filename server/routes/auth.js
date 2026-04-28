import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { dbQuery } from "../db/pool.js";
import { requireAuth, signAuthToken } from "../middleware/auth.js";
import { requireFields } from "../utils/validation.js";
import { sendEmail } from "../utils/email.js";
import {
  createPasswordResetToken,
  createUser,
  consumePasswordResetToken,
  findUserAuthByEmail,
  getPasswordResetToken,
  getUserAuthById,
  invalidatePasswordResetTokensForUser,
  logUserAudit,
  updateUser,
} from "../services/taskService.js";

const router = Router();
const DUMMY_PASSWORD_HASH =
  "$2b$10$e6.Gnmu4w0XyrJ5M8Wf4v.Zw3nD7kjm8v7R2M7.WQ8ixH9czA2QxK"; // hash for a random placeholder string
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const FORGOT_WINDOW_MS = 15 * 60 * 1000;
const RESET_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const REGISTER_MAX_ATTEMPTS = 6;
const FORGOT_MAX_ATTEMPTS = 6;
const RESET_MAX_ATTEMPTS = 10;
const loginAttemptStore = new Map();
const registerAttemptStore = new Map();
const forgotAttemptStore = new Map();
const resetAttemptStore = new Map();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAcceptablePassword(password) {
  const value = String(password || "");
  return value.length >= 1 && value.length <= 128;
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getResetTokenExpiryDate() {
  const minutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 15);
  return new Date(Date.now() + Math.max(5, minutes) * 60 * 1000);
}

function buildAppUrl(req, pathname = "") {
  const envBase = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  const originHeader = String(req?.headers?.origin || "").trim().replace(/\/+$/, "");
  const fallbackBase = `${req.protocol}://${req.get("host")}`.replace(/\/+$/, "");
  const base = envBase || originHeader || fallbackBase;
  if (!base) return "";
  const cleanPath = String(pathname || "").trim();
  return `${base}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`;
}

function buildAttemptKey(req, email) {
  return `${req.ip || "unknown"}:${String(email || "").trim().toLowerCase()}`;
}

function consumeAttempt(store, key, windowMs, maxAttempts) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { blocked: false, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  store.set(key, entry);
  if (entry.count > maxAttempts) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

function resetAttempts(store, key) {
  store.delete(key);
}

function enforceBodySizeLimits(req, fields) {
  for (const [field, maxLength] of Object.entries(fields)) {
    if (req.body?.[field] == null) continue;
    const length = String(req.body[field]).length;
    if (length > maxLength) {
      return `Field "${field}" exceeds max length (${maxLength}).`;
    }
  }
  return "";
}

router.post("/register", async (req, res) => {
  const validation = requireFields(req.body, ["name", "email", "password"]);
  if (!validation.ok) {
    return res.status(400).json({ error: `Missing fields: ${validation.missing.join(", ")}` });
  }

  const sizeError = enforceBodySizeLimits(req, {
    name: 120,
    email: 320,
    password: 128,
  });
  if (sizeError) {
    return res.status(400).json({ error: sizeError });
  }

  const email = normalizeEmail(req.body.email);
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }
  if (name.length < 2 || name.length > 120) {
    return res.status(400).json({ error: "Name must be between 2 and 120 characters." });
  }
  if (!isAcceptablePassword(password)) {
    return res.status(400).json({
      error: "Password is required and must be 1-128 characters.",
    });
  }

  const registerKey = buildAttemptKey(req, email);
  const registerAttempt = consumeAttempt(
    registerAttemptStore,
    registerKey,
    REGISTER_WINDOW_MS,
    REGISTER_MAX_ATTEMPTS,
  );
  if (registerAttempt.blocked) {
    return res.status(429).json({
      error: "Too many registration attempts. Please try again later.",
      retryAfterSeconds: registerAttempt.retryAfterSeconds,
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const countResult = await dbQuery("SELECT COUNT(*)::int AS count FROM users");
    const userCount = countResult.rows[0].count;
    const role = userCount === 0 ? "admin" : "member";

    const user = await createUser({
      name,
      email,
      passwordHash,
      role,
      mustChangePassword: false,
    });
    const token = signAuthToken(user);
    resetAttempts(registerAttemptStore, registerKey);
    return res.status(201).json({ token, user });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Failed to register user" });
  }
});

router.post("/login", async (req, res) => {
  const validation = requireFields(req.body, ["email", "password"]);
  if (!validation.ok) {
    return res.status(400).json({ error: `Missing fields: ${validation.missing.join(", ")}` });
  }

  const sizeError = enforceBodySizeLimits(req, {
    email: 320,
    password: 128,
  });
  if (sizeError) {
    return res.status(400).json({ error: sizeError });
  }

  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  const loginKey = buildAttemptKey(req, email);
  const loginAttempt = consumeAttempt(
    loginAttemptStore,
    loginKey,
    LOGIN_WINDOW_MS,
    LOGIN_MAX_ATTEMPTS,
  );
  if (loginAttempt.blocked) {
    return res.status(429).json({
      error: "Too many login attempts. Please try again later.",
      retryAfterSeconds: loginAttempt.retryAfterSeconds,
    });
  }

  const row = await findUserAuthByEmail(email);
  if (!row) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!row.isActive) {
    return res.status(403).json({ error: "This account is disabled." });
  }

  const validPassword = await bcrypt.compare(password, row.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword === true,
  };
  const token = signAuthToken(user);
  resetAttempts(loginAttemptStore, loginKey);
  return res.json({
    token,
    user,
    authState: user.mustChangePassword ? "force_password_change" : "ok",
    mustChangePassword: user.mustChangePassword,
  });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

router.patch("/profile", requireAuth, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = normalizeEmail(req.body?.email);
  if (!name || !isValidEmail(email)) {
    return res.status(400).json({ error: "Valid name and email are required." });
  }
  if (name.length < 2 || name.length > 120) {
    return res.status(400).json({ error: "Name must be between 2 and 120 characters." });
  }
  try {
    const updated = await updateUser(req.user.id, { name, email });
    if (!updated) {
      return res.status(404).json({ error: "User not found." });
    }
    await logUserAudit({
      actorUserId: req.user.id,
      targetUserId: updated.id,
      action: "profile_updated",
    }).catch(() => {});
    return res.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        mustChangePassword: updated.mustChangePassword,
      },
    });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

router.post("/forgot-password", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const attemptKey = buildAttemptKey(req, email || "forgot");
  const attempt = consumeAttempt(
    forgotAttemptStore,
    attemptKey,
    FORGOT_WINDOW_MS,
    FORGOT_MAX_ATTEMPTS,
  );
  if (attempt.blocked) {
    return res.status(429).json({
      error: "Too many password reset requests. Please try again later.",
      retryAfterSeconds: attempt.retryAfterSeconds,
    });
  }
  if (!isValidEmail(email)) {
    return res.json({
      message: "If an account exists for that email, a password reset email was sent.",
    });
  }
  const user = await findUserAuthByEmail(email);
  if (!user || !user.isActive) {
    return res.json({
      message: "If an account exists for that email, a password reset email was sent.",
    });
  }
  const rawToken = generateResetToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = getResetTokenExpiryDate();
  await createPasswordResetToken({
    userId: user.id,
    tokenHash,
    expiresAt,
    ipAddress: req.ip,
  });
  const resetUrl = buildAppUrl(
    req,
    `/reset-password?token=${encodeURIComponent(rawToken)}`,
  );
  const bodyText = resetUrl
    ? `Use this link to reset your password: ${resetUrl}`
    : `Use this token to reset your password: ${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: "Password reset request",
    text: bodyText,
  }).catch(() => {});
  await logUserAudit({
    actorUserId: null,
    targetUserId: user.id,
    action: "forgot_password_requested",
    metadata: { ip: req.ip || "" },
  }).catch(() => {});

  return res.json({
    message: "If an account exists for that email, a password reset email was sent.",
  });
});

router.post("/reset-password", async (req, res) => {
  const validation = requireFields(req.body, ["token", "password"]);
  if (!validation.ok) {
    return res.status(400).json({ error: `Missing fields: ${validation.missing.join(", ")}` });
  }
  const token = String(req.body.token || "").trim();
  const attemptKey = buildAttemptKey(req, token ? `reset:${token.slice(0, 8)}` : "reset");
  const attempt = consumeAttempt(
    resetAttemptStore,
    attemptKey,
    RESET_WINDOW_MS,
    RESET_MAX_ATTEMPTS,
  );
  if (attempt.blocked) {
    return res.status(429).json({
      error: "Too many reset attempts. Please try again later.",
      retryAfterSeconds: attempt.retryAfterSeconds,
    });
  }
  const password = String(req.body.password || "");
  if (!token) {
    return res.status(400).json({ error: "Reset token is required." });
  }
  if (!isAcceptablePassword(password)) {
    return res.status(400).json({
      error: "Password is required and must be 1-128 characters.",
    });
  }
  const tokenRecord = await getPasswordResetToken(hashToken(token));
  if (
    !tokenRecord ||
    tokenRecord.usedAt ||
    new Date(tokenRecord.expiresAt).getTime() <= Date.now()
  ) {
    return res.status(400).json({ error: "Reset token is invalid or expired." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const consumed = await consumePasswordResetToken(tokenRecord.id);
  if (!consumed) {
    return res.status(400).json({ error: "Reset token is invalid or expired." });
  }
  await invalidatePasswordResetTokensForUser(tokenRecord.userId);
  const updated = await updateUser(tokenRecord.userId, {
    passwordHash,
    mustChangePassword: false,
    passwordChangedAt: new Date(),
  });
  if (!updated) {
    return res.status(404).json({ error: "User not found." });
  }
  await logUserAudit({
    actorUserId: null,
    targetUserId: updated.id,
    action: "password_reset_completed",
  }).catch(() => {});
  resetAttempts(resetAttemptStore, attemptKey);
  return res.json({ message: "Password reset successful." });
});

router.post("/change-password", requireAuth, async (req, res) => {
  const validation = requireFields(req.body, ["newPassword"]);
  if (!validation.ok) {
    return res.status(400).json({ error: `Missing fields: ${validation.missing.join(", ")}` });
  }
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const name = String(req.body.name || "").trim();
  if (!isAcceptablePassword(newPassword)) {
    return res.status(400).json({
      error: "Password is required and must be 1-128 characters.",
    });
  }

  const user = await getUserAuthById(req.user.id);
  if (user.mustChangePassword && (!name || name.length < 2 || name.length > 120)) {
    return res
      .status(400)
      .json({ error: "Name is required and must be between 2 and 120 characters." });
  }

  if (!user || !user.isActive) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!user.mustChangePassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: "Current password is required." });
    }
    const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      return res.status(401).json({ error: "Current password is invalid." });
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await updateUser(req.user.id, {
    ...(user.mustChangePassword ? { name } : {}),
    passwordHash,
    mustChangePassword: false,
    passwordChangedAt: new Date(),
  });
  if (!updated) {
    return res.status(404).json({ error: "User not found." });
  }
  await logUserAudit({
    actorUserId: req.user.id,
    targetUserId: updated.id,
    action: "password_changed",
  }).catch(() => {});
  return res.json({ message: "Password changed successfully." });
});

export default router;
