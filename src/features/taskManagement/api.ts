import { apiRequest, buildApiUrl, getAuthToken } from "../../api/client";

export function fetchDashboardApi() {
  return apiRequest("/task-management/dashboard");
}

export function fetchProjectsApi() {
  return apiRequest("/task-management/projects");
}

export function fetchBootstrapApi() {
  return apiRequest("/task-management/bootstrap");
}

export function fetchTaskBundleApi(taskId) {
  return apiRequest(`/task-management/tasks/${taskId}`);
}

export function fetchProjectSettingsApi(projectId) {
  return apiRequest(`/task-management/projects/${encodeURIComponent(projectId)}/settings`);
}

export function fetchGithubProjectReposApi(projectId) {
  return apiRequest(`/github/projects/${encodeURIComponent(projectId)}/repos`);
}

export function fetchGithubAppSettingsApi() {
  return apiRequest("/task-management/app-settings/github");
}

export function fetchProjectsPageApi(cursor = "", limit = 20) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", String(cursor));
  return apiRequest(`/task-management/projects/paged?${params.toString()}`);
}

export function fetchUsersPageApi({ cursor = "", isActive = true, limit = 25 }: any = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", String(cursor));
  params.set("isActive", isActive ? "true" : "false");
  return apiRequest(`/task-management/users/paged?${params.toString()}`);
}

export function fetchBoardPageApi(params) {
  return apiRequest(`/task-management/board/paged?${params.toString()}`);
}

export function fetchBacklogPageApi(params) {
  return apiRequest(`/task-management/backlog/paged?${params.toString()}`);
}

export function fetchBacklogRowsApi(params) {
  return apiRequest(`/task-management/backlog/rows?${params.toString()}`);
}

export function fetchTasksApi(params) {
  const query = params.toString();
  return apiRequest(`/task-management/tasks${query ? `?${query}` : ""}`);
}

export function fetchSprintTasksApi(sprintId, projectId) {
  return apiRequest(
    `/task-management/sprints/${sprintId}/tasks?projectId=${encodeURIComponent(projectId)}`,
  );
}

export function fetchSummaryOverviewApi(
  projectId,
  fromDate,
  toDate,
  { signal }: any = {},
) {
  const params = new URLSearchParams();
  params.set("projectId", String(projectId));
  if (fromDate) params.set("from", String(fromDate));
  if (toDate) params.set("to", String(toDate));
  return apiRequest(`/task-management/analytics/overview?${params.toString()}`, {
    signal,
  });
}

export function fetchSummarySprintApi(
  projectId,
  fromDate,
  toDate,
  { signal }: any = {},
) {
  const params = new URLSearchParams();
  params.set("projectId", String(projectId));
  if (fromDate) params.set("from", String(fromDate));
  if (toDate) params.set("to", String(toDate));
  return apiRequest(`/task-management/analytics/sprint?${params.toString()}`, {
    signal,
  });
}

export function fetchSummaryFlowApi(
  projectId,
  fromDate,
  toDate,
  interval = "week",
  { signal }: any = {},
) {
  const params = new URLSearchParams();
  params.set("projectId", String(projectId));
  params.set("interval", String(interval));
  if (fromDate) params.set("from", String(fromDate));
  if (toDate) params.set("to", String(toDate));
  return apiRequest(`/task-management/analytics/flow?${params.toString()}`, {
    signal,
  });
}

export function fetchSummaryWorkloadApi(
  projectId,
  fromDate,
  toDate,
  { signal }: any = {},
) {
  const params = new URLSearchParams();
  params.set("projectId", String(projectId));
  if (fromDate) params.set("from", String(fromDate));
  if (toDate) params.set("to", String(toDate));
  return apiRequest(`/task-management/analytics/workload?${params.toString()}`, {
    signal,
  });
}

export function createTaskApi(payload) {
  return apiRequest("/task-management/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function moveTaskApi(taskId, status) {
  return apiRequest(`/task-management/tasks/${taskId}/move`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function searchTasksApi(
  query,
  {
    limit = 20,
    cursor = "",
    scope = "global",
    projectId = "",
    includeSprintId = "",
  }: any = {},
) {
  const params = new URLSearchParams();
  params.set("search", String(query || ""));
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", String(cursor));
  params.set("scope", String(scope || "global"));
  if (projectId) params.set("projectId", String(projectId));
  if (includeSprintId) params.set("includeSprintId", String(includeSprintId));
  return apiRequest(`/task-management/tasks/search?${params.toString()}`);
}

export async function exportSummaryReportApi(type, projectId, fromDate, toDate) {
  const params = new URLSearchParams();
  params.set("projectId", String(projectId));
  params.set("type", String(type || "overview"));
  if (fromDate) params.set("from", String(fromDate));
  if (toDate) params.set("to", String(toDate));
  const response = await fetch(
    buildApiUrl(`/task-management/reports/export?${params.toString()}`),
    {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || "Failed to export report.");
  }
  return response;
}

export function patchTaskApi(taskId, body) {
  return apiRequest(`/task-management/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function addTaskCommentApi(taskId, body) {
  return apiRequest(`/task-management/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function updateTaskCommentApi(taskId, commentId, body) {
  return apiRequest(`/task-management/tasks/${taskId}/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export function deleteTaskCommentApi(taskId, commentId) {
  return apiRequest(`/task-management/tasks/${taskId}/comments/${commentId}`, {
    method: "DELETE",
  });
}

export function uploadTaskAssetApi(formData) {
  return apiRequest("/task-management/upload", { method: "POST", body: formData });
}

export function createUserApi(payload) {
  return apiRequest("/task-management/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUserApi(userId, payload) {
  return apiRequest(`/task-management/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function disableUserApi(userId) {
  return apiRequest(`/task-management/users/${userId}/disable`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

export function enableUserApi(userId) {
  return apiRequest(`/task-management/users/${userId}/enable`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

export function createUserGroupApi(payload) {
  return apiRequest("/task-management/user-groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUserGroupApi(groupId, payload) {
  return apiRequest(`/task-management/user-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteUserGroupApi(groupId) {
  return apiRequest(`/task-management/user-groups/${groupId}`, { method: "DELETE" });
}

export function createSprintApi(payload) {
  return apiRequest("/task-management/sprints", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSprintApi(sprintId, payload) {
  return apiRequest(`/task-management/sprints/${sprintId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createProjectApi(payload) {
  return apiRequest("/task-management/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProjectApi(projectId, payload) {
  return apiRequest(`/task-management/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteProjectApi(projectId) {
  return apiRequest(`/task-management/projects/${projectId}`, { method: "DELETE" });
}

export function deleteTaskApi(taskId) {
  return apiRequest(`/task-management/tasks/${taskId}`, { method: "DELETE" });
}

export function patchProjectSettingsApi(projectId, settings) {
  return apiRequest(`/task-management/projects/${encodeURIComponent(projectId)}/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export function startSprintApi(sprintId) {
  return apiRequest(`/task-management/sprints/${sprintId}/start`, {
    method: "POST",
    body: "{}",
  });
}

export function completeSprintApi(sprintId, moveIncompleteToSprintId = null) {
  return apiRequest(`/task-management/sprints/${sprintId}/complete`, {
    method: "POST",
    body: JSON.stringify({ moveIncompleteToSprintId }),
  });
}

export function deleteSprintApi(sprintId) {
  return apiRequest(`/task-management/sprints/${sprintId}`, { method: "DELETE" });
}

export function addTasksToSprintApi(sprintId, taskIds) {
  return apiRequest(`/task-management/sprints/${sprintId}/tasks`, {
    method: "POST",
    body: JSON.stringify({ taskIds }),
  });
}

export function removeTaskFromSprintApi(sprintId, taskId) {
  return apiRequest(`/task-management/sprints/${sprintId}/tasks/${taskId}`, {
    method: "DELETE",
  });
}

export function fetchSprintsApi(projectId) {
  return apiRequest(`/task-management/sprints?projectId=${encodeURIComponent(projectId)}`);
}
