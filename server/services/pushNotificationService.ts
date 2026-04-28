import webpush from "web-push";
import { prisma } from "../db/prisma.js";

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

export async function sendPushToUser(
  userId,
  payload,
) {
  if (!ensureConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId: String(userId),
    },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  for (const row of subscriptions) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      await prisma.pushSubscription.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: row.id } });
      }
    }
  }
}
