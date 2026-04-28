import { apiRequest } from "../../api/client";

export function fetchNotifications() {
  return Promise.all([
    apiRequest("/notifications?limit=40"),
    apiRequest("/notifications/unread-count"),
  ]);
}

export function registerPushSubscriptionApi(subscription) {
  return apiRequest("/notifications/push-subscriptions", {
    method: "POST",
    body: JSON.stringify({ subscription }),
  });
}

export function removePushSubscriptionApi(endpoint) {
  return apiRequest("/notifications/push-subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

export function markAllNotificationsReadApi() {
  return apiRequest("/notifications/read-all", { method: "PATCH" });
}

export function markNotificationReadApi(notificationId) {
  return apiRequest(`/notifications/${notificationId}/read`, { method: "PATCH" });
}
