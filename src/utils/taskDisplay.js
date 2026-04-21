/** Human-readable ref: PROJECTKEY-42 from API, or short id fallback for legacy rows. */
export function displayTaskRef(task) {
  if (!task?.id) return "—";
  if (task.taskKey) return task.taskKey;
  return String(task.id).replace(/-/g, "").slice(0, 8).toUpperCase();
}
