export type Id = string;

export interface TaskConflictError extends Error {
  code: "TASK_CONFLICT";
}

export interface NotificationPayload {
  title: string;
  body?: string;
  notificationId?: Id;
  metadata?: Record<string, unknown>;
}
