import { dbQuery } from "../db/pool.js";
import { publishNotificationEvent } from "./notificationRealtimeService.js";
import { sendPushToUser } from "./pushNotificationService.js";

function uniqIds(ids = []) {
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

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
}) {
  const recipients = uniqIds(recipientUserIds).filter(
    (id) => id !== String(actorUserId || ""),
  );
  if (!recipients.length) return [];
  const created = [];
  for (const userId of recipients) {
    let row = null;
    try {
      const result = await dbQuery(
        `INSERT INTO notifications (
           user_id, type, title, body, entity_type, entity_id, metadata_json, dedupe_key
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
         RETURNING id, user_id AS "userId", type, title, body, entity_type AS "entityType",
                   entity_id AS "entityId", metadata_json AS "metadata", read_at AS "readAt",
                   created_at AS "createdAt"`,
        [
          userId,
          String(type || "general"),
          String(title || "Notification"),
          String(body || ""),
          String(entityType || ""),
          entityId || null,
          JSON.stringify(metadata || {}),
          dedupeKey ? `${String(dedupeKey)}:${userId}` : null,
        ],
      );
      row = result.rows[0] || null;
    } catch (error) {
      if (error.code !== "23505") throw error;
    }
    if (!row) continue;
    created.push(row);
    const unread = await getUnreadCount(userId);
    publishNotificationEvent(userId, "notification:new", row);
    publishNotificationEvent(userId, "notification:unread_count", {
      unreadCount: unread,
    });
    await sendPushToUser(userId, {
      title: row.title,
      body: row.body,
      notificationId: row.id,
      metadata: row.metadata,
    });
  }
  return created;
}

export async function listNotifications(userId, { limit = 40, offset = 0 } = {}) {
  const result = await dbQuery(
    `SELECT id, user_id AS "userId", type, title, body, entity_type AS "entityType",
            entity_id AS "entityId", metadata_json AS "metadata", read_at AS "readAt",
            created_at AS "createdAt"
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [String(userId), Math.min(Math.max(Number(limit) || 40, 1), 100), Math.max(Number(offset) || 0, 0)],
  );
  return result.rows;
}

export async function getUnreadCount(userId) {
  const result = await dbQuery(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1
       AND read_at IS NULL`,
    [String(userId)],
  );
  return Number(result.rows[0]?.count || 0);
}

export async function markNotificationRead(userId, notificationId) {
  const result = await dbQuery(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [String(notificationId), String(userId)],
  );
  const unread = await getUnreadCount(userId);
  publishNotificationEvent(userId, "notification:unread_count", { unreadCount: unread });
  return Boolean(result.rows[0]);
}

export async function markAllNotificationsRead(userId) {
  await dbQuery(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [String(userId)],
  );
  publishNotificationEvent(userId, "notification:unread_count", { unreadCount: 0 });
}

export async function savePushSubscription(userId, { endpoint, keys = {} }, userAgent) {
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error("Invalid push subscription payload");
  }
  await dbQuery(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint)
     DO UPDATE SET user_id = EXCLUDED.user_id,
                   p256dh = EXCLUDED.p256dh,
                   auth = EXCLUDED.auth,
                   user_agent = EXCLUDED.user_agent,
                   last_used_at = NOW()`,
    [String(userId), String(endpoint), String(keys.p256dh), String(keys.auth), String(userAgent || "")],
  );
}

export async function removePushSubscription(userId, endpoint) {
  await dbQuery(
    `DELETE FROM push_subscriptions
     WHERE user_id = $1 AND endpoint = $2`,
    [String(userId), String(endpoint || "")],
  );
}
