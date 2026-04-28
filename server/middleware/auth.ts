import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { isAuthJwtPayload } from "../utils/guards.js";

const authUserCache = new Map();
const AUTH_USER_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.AUTH_USER_CACHE_TTL_MS || 60000),
);

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
  if (!secret) {
    if (nodeEnv === "production") {
      throw new Error("JWT_SECRET must be configured in production.");
    }
    return "dev-secret";
  }
  if (nodeEnv === "production" && secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production.");
  }
  return secret;
}

function cacheKey(userId) {
  return String(userId || "");
}

function getCachedUser(userId) {
  if (AUTH_USER_CACHE_TTL_MS <= 0) return null;
  const key = cacheKey(userId);
  const entry = authUserCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    authUserCache.delete(key);
    return null;
  }
  return entry.user;
}

function setCachedUser(user) {
  if (AUTH_USER_CACHE_TTL_MS <= 0) return;
  const key = cacheKey(user?.id);
  if (!key) return;
  authUserCache.set(key, {
    user,
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
  });
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    if (!isAuthJwtPayload(payload)) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.auth = payload;
    const cachedUser = getCachedUser(payload.userId);
    const user =
      cachedUser ||
      (await prisma.user.findFirst({
        where: {
          id: String(payload.userId || ""),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
        },
      }));
    if (!user) {
      return res.status(401).json({ error: "Invalid token user" });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: "This account is disabled." });
    }

    if (!cachedUser) setCachedUser(user);
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function signAuthToken(user) {
  const expiresIn = String(process.env.JWT_EXPIRES_IN || "7d");
  return jwt.sign(
    { userId: user.id, role: user.role },
    getJwtSecret(),
    { expiresIn: expiresIn as any, algorithm: "HS256" },
  );
}
