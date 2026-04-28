import {
  fetchNotifications,
  markAllNotificationsReadApi,
  markNotificationReadApi,
} from "./api.js";

export async function loadNotificationsController(
  deps: {
    setNotifications: (v: any[]) => void;
    setUnreadCount: (v: number) => void;
  },
) {
  try {
    const [list, unread] = await fetchNotifications();
    deps.setNotifications(Array.isArray(list) ? list : []);
    deps.setUnreadCount(Number(unread?.unreadCount || 0));
  } catch {
    // Notification center is optional; avoid blocking app on failures.
  }
}

export async function markNotificationReadController(
  notificationId: string,
  deps: { reload: () => Promise<void> },
) {
  await markNotificationReadApi(notificationId);
  await deps.reload();
}

export async function markAllNotificationsReadController(deps: {
  reload: () => Promise<void>;
}) {
  await markAllNotificationsReadApi();
  await deps.reload();
}

