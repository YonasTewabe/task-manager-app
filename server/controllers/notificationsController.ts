import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
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
import { asObjectRecord, asString, isAuthJwtPayload } from "../utils/guards.js";

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
  if (!isAuthJwtPayload(payload)) return null;
  const user = await prisma.user.findFirst({
    where: {
      id: String(payload.userId || ""),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
  return user || null;
}

export async function listNotificationsHandler(req: Request, res: Response) {
  const limit = Number(req.query.limit || 40);
  const offset = Number(req.query.offset || 0);
  const notifications = await listNotifications(req.user.id, {
    limit,
    offset,
  });
  return res.json(notifications);
}

export async function unreadCountHandler(req: Request, res: Response) {
  const unreadCount = await getUnreadCount(req.user.id);
  return res.json({ unreadCount });
}

export async function markReadHandler(req: Request, res: Response) {
  const ok = await markNotificationRead(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Notification not found" });
  return res.json({ ok: true });
}

export async function markAllReadHandler(req: Request, res: Response) {
  await markAllNotificationsRead(req.user.id);
  return res.json({ ok: true });
}

export async function streamHandler(req: Request, res: Response) {
  let user = req.user || null;
  if (!user) {
    const token = String(req.query.token || "");
    try {
      user = await resolveUserFromToken(token);
    } catch {
      user = null;
    }
  }
  if (!user) return res.status(401).json({ error: "Authentication required" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  registerNotificationStream(user.id, res);
  req.on("close", () => {
    unregisterNotificationStream(user.id, res);
  });
  return undefined;
}

export async function savePushSubscriptionHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  try {
    await savePushSubscription(
      req.user.id,
      asObjectRecord(body.subscription),
      req.get("user-agent"),
    );
    return res.status(201).json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid subscription" });
  }
}

export async function removePushSubscriptionHandler(
  req: Request,
  res: Response,
) {
  const body = asObjectRecord(req.body);
  await removePushSubscription(req.user.id, asString(body.endpoint));
  return res.status(204).send();
}
