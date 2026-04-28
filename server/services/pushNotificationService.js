import webpush from "web-push";
import { dbQuery } from "../db/pool.js";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const subject = process.env.PUSH_VAPID_SUBJECT;
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export async function sendPushToUser(userId, payload) {
  if (!ensureConfigured()) return;
  const result = await dbQuery(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = $1`,
    [String(userId)],
  );
  for (const row of result.rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      await dbQuery(
        `UPDATE push_subscriptions
         SET last_used_at = NOW()
         WHERE id = $1`,
        [row.id],
      );
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await dbQuery(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id]);
      }
    }
  }
}
