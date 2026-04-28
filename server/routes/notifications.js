import { Router } from "express";
import jwt from "jsonwebtoken";
import { dbQuery } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  savePushSubscription,
} from "../services/notificationService.js";
import {
  registerNotificationStream,
  unregisterNotificationStream,
} from "../services/notificationRealtimeService.js";

const router = Router();

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
  if (!secret) return nodeEnv === "production" ? null : "dev-secret";
  return secret;
}

async function resolveUserFromToken(token) {
  const secret = getJwtSecret();
  if (!secret || !token) return null;
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  const result = await dbQuery(
    `SELECT id, name, email, role FROM users WHERE id = $1`,
    [payload.userId],
  );
  return result.rows[0] || null;
}

router.get("/", requireAuth, async (req, res) => {
  const limit = Number(req.query.limit || 40);
  const offset = Number(req.query.offset || 0);
  const notifications = await listNotifications(req.user.id, { limit, offset });
  res.json(notifications);
});

router.get("/unread-count", requireAuth, async (req, res) => {
  const unreadCount = await getUnreadCount(req.user.id);
  res.json({ unreadCount });
});

router.patch("/:id/read", requireAuth, async (req, res) => {
  const ok = await markNotificationRead(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Notification not found" });
  return res.json({ ok: true });
});

router.patch("/read-all", requireAuth, async (req, res) => {
  await markAllNotificationsRead(req.user.id);
  return res.json({ ok: true });
});

router.get("/stream", async (req, res) => {
  let user = req.user || null;
  if (!user) {
    const token = String(req.query.token || "");
    try {
      user = await resolveUserFromToken(token);
    } catch {
      user = null;
    }
  }
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  registerNotificationStream(user.id, res);
  req.on("close", () => {
    unregisterNotificationStream(user.id, res);
  });
});

router.post("/push-subscriptions", requireAuth, async (req, res) => {
  try {
    await savePushSubscription(
      req.user.id,
      req.body?.subscription || {},
      req.get("user-agent"),
    );
    return res.status(201).json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid subscription" });
  }
});

router.delete("/push-subscriptions", requireAuth, async (req, res) => {
  await removePushSubscription(req.user.id, req.body?.endpoint);
  return res.status(204).send();
});

export default router;
