export function buildNotificationPath(notification) {
  const metadata = notification?.metadata || {};
  const projectId = metadata.project_id || metadata.projectId;
  const taskId = metadata.task_id || metadata.taskId;
  const targetView = metadata.target_view || metadata.targetView || "board";
  if (projectId) {
    const params = new URLSearchParams();
    if (taskId) params.set("taskId", String(taskId));
    if (metadata.target_comment_id) {
      params.set("commentId", String(metadata.target_comment_id));
    }
    const query = params.toString();
    return `/project/${projectId}/${targetView}${query ? `?${query}` : ""}`;
  }
  return "/dashboard";
}
