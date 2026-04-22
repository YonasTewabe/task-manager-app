import { Router } from "express";
import bcrypt from "bcryptjs";
import { dbQuery } from "../db/pool.js";
import { requireAuth, signAuthToken } from "../middleware/auth.js";
import { requireFields } from "../utils/validation.js";

const router = Router();
const DUMMY_PASSWORD_HASH =
  "$2b$10$e6.Gnmu4w0XyrJ5M8Wf4v.Zw3nD7kjm8v7R2M7.WQ8ixH9czA2QxK"; // hash for a random placeholder string
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const REGISTER_MAX_ATTEMPTS = 6;
const loginAttemptStore = new Map();
const registerAttemptStore = new Map();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(password) {
  const value = String(password || "");
  if (value.length < 12 || value.length > 128) return false;
  return (
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
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
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error:
        "Password must be 12-128 chars and include uppercase, lowercase, number, and symbol.",
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

    const insert = await dbQuery(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role],
    );

    const user = insert.rows[0];
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

  const result = await dbQuery(
    "SELECT id, name, email, role, password_hash FROM users WHERE email = $1",
    [email],
  );
  const row = result.rows[0];
  if (!row) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const validPassword = await bcrypt.compare(password, row.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  const token = signAuthToken(user);
  resetAttempts(loginAttemptStore, loginKey);
  return res.json({ token, user });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
