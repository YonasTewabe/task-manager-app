self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "Task Manager";
  const body = payload.body || "You have a new notification.";
  const metadata = payload.metadata || {};
  const projectId = metadata.project_id || metadata.projectId || "";
  const taskId = metadata.task_id || metadata.taskId || "";
  const targetView = metadata.target_view || "board";
  const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
  const url = projectId
    ? `/project/${encodeURIComponent(projectId)}/${encodeURIComponent(targetView)}${query}`
    : "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
