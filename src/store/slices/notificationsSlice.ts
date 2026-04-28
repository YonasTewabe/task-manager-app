import { withUpdater } from "../utils";
import type { AppState, SliceSetter } from "../types";

export const createNotificationsSlice = (
  set: SliceSetter,
): Partial<AppState> => ({
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
