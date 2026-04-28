import { withUpdater } from "../utils";

export const createNotificationsSlice = (set) => ({
  notifications: [],
  unreadCount: 0,
  notificationCenterOpen: false,
  notificationStreamConnected: false,
  notificationStreamError: "",
  setNotifications: withUpdater(set, "notifications"),
  setUnreadCount: withUpdater(set, "unreadCount"),
  setNotificationCenterOpen: withUpdater(set, "notificationCenterOpen"),
  setNotificationStreamConnected: withUpdater(set, "notificationStreamConnected"),
  setNotificationStreamError: withUpdater(set, "notificationStreamError"),
});
