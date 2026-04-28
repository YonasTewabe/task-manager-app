import { prisma } from "../db/prisma.js";
import { publishNotificationEvent } from "./notificationRealtimeService.js";
import { sendPushToUser } from "./pushNotificationService.js";
import { asObjectRecord, asString } from "../utils/guards.js";

function uniqIds(ids = []) {
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

type NotificationEnvelope = {
  actorUserId?: string | null;
  recipientUserIds?: unknown[];
  type?: string;
  title?: string;
  body?: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

export async function createAndDispatchNotifications({
  actorUserId,
  recipientUserIds,
  type,
  title,
  body = "",
  entityType = "",
  entityId = null,
  metadata = {},
  dedupeKey = null,
}: NotificationEnvelope) {
  const recipients = uniqIds(recipientUserIds).filter(
    (id) => id !== String(actorUserId || ""),
  );
  if (!recipients.length) return [];
  const created = (
    await Promise.all(
      recipients.map(async (userId) => {
        try {
          return await prisma.notification.create({
            data: {
              userId,
              type: String(type || "general"),
              title: String(title || "Notification"),
              body: String(body || ""),
              entityType: String(entityType || ""),
              entityId: entityId || null,
              metadata: asObjectRecord(metadata),
              dedupeKey: dedupeKey ? `${String(dedupeKey)}:${userId}` : null,
            },
          });
        } catch (error) {
          if (error?.code !== "P2002") throw error;
          return null;
        }
      }),
    )
  ).filter(Boolean);
  if (!created.length) return [];
  const unreadRows = await prisma.notification.groupBy({
    by: ["userId"],
    where: {
      userId: { in: created.map((row) => String(row.userId)) },
      readAt: null,
    },
    _count: { _all: true },
  });
  const unreadByUserId = new Map(
    unreadRows.map((row) => [String(row.userId), Number(row._count?._all || 0)]),
  );
  await Promise.all(
    created.map(async (row) => {
      const userId = String(row.userId || "");
      publishNotificationEvent(userId, "notification:new", row);
      publishNotificationEvent(userId, "notification:unread_count", {
        unreadCount: Number(unreadByUserId.get(userId) || 0),
      });
      await sendPushToUser(userId, {
        title: row.title,
        body: row.body,
        notificationId: row.id,
        metadata: asObjectRecord(row.metadata),
      });
    }),
  );
  return created;
}

export async function listNotifications(
  userId,
  {
    limit = 40,
    offset = 0,
  }: { limit?: number | string; offset?: number | string } = {},
) {
  const rows = await prisma.notification.findMany({
    where: { userId: String(userId) },
    orderBy: { createdAt: "desc" },
    skip: Math.max(Number(offset) || 0, 0),
    take: Math.min(Math.max(Number(limit) || 40, 1), 100),
  });
  return rows;
}

export async function getUnreadCount(
  userId,
) {
  return prisma.notification.count({
    where: {
      userId: String(userId),
      readAt: null,
    },
  });
}

export async function markNotificationRead(
  userId,
  notificationId,
) {
  const existing = await prisma.notification.findFirst({
    where: {
      id: String(notificationId),
      userId: String(userId),
    },
    select: { id: true, readAt: true },
  });
  if (!existing) return false;
  if (!existing.readAt) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
    });
  }
  const unread = await getUnreadCount(userId);
  publishNotificationEvent(userId, "notification:unread_count", {
    unreadCount: unread,
  });
  return true;
}

export async function markAllNotificationsRead(
  userId,
) {
  await prisma.notification.updateMany({
    where: {
      userId: String(userId),
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  publishNotificationEvent(userId, "notification:unread_count", { unreadCount: 0 });
}

export async function savePushSubscription(
  userId,
  subscription,
  userAgent,
) {
  const payload = asObjectRecord(subscription);
  const endpoint = asString(payload.endpoint).trim();
  const keys = asObjectRecord(payload.keys);
  const p256dh = asString(keys.p256dh).trim();
  const auth = asString(keys.auth).trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Invalid push subscription payload");
  }
  await prisma.pushSubscription.upsert({
    where: {
      endpoint: String(endpoint),
    },
    create: {
      userId: String(userId),
      endpoint: String(endpoint),
      p256dh: p256dh,
      auth: auth,
      userAgent: String(userAgent || ""),
    },
    update: {
      userId: String(userId),
      p256dh: p256dh,
      auth: auth,
      userAgent: String(userAgent || ""),
      lastUsedAt: new Date(),
    },
  });
}

export async function removePushSubscription(
  userId,
  endpoint,
) {
  await prisma.pushSubscription.deleteMany({
    where: {
      userId: String(userId),
      endpoint: String(endpoint || ""),
    },
  });
}
