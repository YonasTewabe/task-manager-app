import jwt from "jsonwebtoken";
import { dbQuery } from "../db/pool.js";

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
    const userResult = await dbQuery(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [payload.userId],
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid token user" });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function signAuthToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d", algorithm: "HS256" },
  );
}
