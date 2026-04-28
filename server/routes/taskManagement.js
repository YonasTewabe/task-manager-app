import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import {
  requireProjectManagementAccess,
  requireProjectManagementAccessForSprint,
} from "../middleware/projectManagement.js";
import { requireRole } from "../middleware/roles.js";
import { isNonEmptyString } from "../utils/validation.js";
import { createUploadMiddleware, handleUploadError } from "../utils/upload.js";
import { sendEmail } from "../utils/email.js";
import {
  addTaskActivity,
  addTaskComment,
  deleteTaskComment,
  assignTasksToSprint,
  buildBoard,
  completeSprint,
  canUserMoveTask,
  createUserGroup,
  createProject,
  createSprint,
  createTask,
  createUser,
  buildSummaryReportExport,
  disableUser,
  enableUser,
  deleteSprint,
  deleteProject,
  deleteUser,
  deleteUserGroup,
  deleteTask,
  getDefaultSettings,
  getProjectSettings,
  getProjectById,
  getProjects,
  getProjectsPage,
  getSprints,
  getTaskActivity,
  getTaskById,
  getTaskComments,
  getTaskLinkedDev,
  getTaskStatusTotals,
  searchTasks,
  getSummaryFlowAnalytics,
  getSummaryOverviewAnalytics,
  getSummarySprintAnalytics,
  getSummaryWorkloadAnalytics,
  getDashboardData,
  getBacklogRows,
  getTasks,
  getTasksPage,
  getUsers,
  getUsersPage,
  getUserGroups,
  getWorkflowStageKeys,
  isValidWorkflowStatus,
  logUserAudit,
  projectExists,
  removeTaskFromSprint,
  ACTIVE_SPRINT_CONFLICT_MESSAGE,
  SPRINT_DELETE_NOT_EMPTY_MESSAGE,
  updateProjectSettings,
  updateUser,
  updateUserGroup,
  updateProject,
  updateTaskComment,
  updateSprint,
  updateTask,
} from "../services/taskService.js";
import {
  getGithubIntegrationSettings,
  updateGithubIntegrationSettings,
} from "../services/appSettingsService.js";
import { resolveMentionedUserIds } from "../utils/mentionParser.js";
import { createAndDispatchNotifications } from "../services/notificationService.js";

const router = Router();
router.use(requireAuth);
const upload = createUploadMiddleware({
  subDir: "task-management",
  allowedMimeTypes: [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ],
});

const TRACKED_TASK_FIELDS = [
  "title",
  "description",
  "status",
  "storyPoints",
  "dueDate",
  "priority",
  "type",
  "version",
  "assigneeId",
  "label",
];

function generateTemporaryPassword() {
  return `${crypto.randomBytes(6).toString("base64url")}!aA1`;
}

function normalizeAcceptanceCriteria(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const text = String(item?.text || "").trim();
      if (!text) return null;
      const id = String(item?.id || "").trim() || `ac-${index}-${text}`;
      return { id, text, done: item?.done === true };
    })
    .filter(Boolean);
}

function buildAcceptanceCriteriaChanges(beforeTask, afterTask) {
  const before = normalizeAcceptanceCriteria(beforeTask?.acceptanceCriteria);
  const after = normalizeAcceptanceCriteria(afterTask?.acceptanceCriteria);
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  const changes = [];

  after.forEach((item) => {
    const prev = beforeById.get(item.id);
    if (!prev) {
      changes.push({
        field: "acceptanceCriteria",
        from: "None",
        to: `Added: ${item.text}`,
      });
      return;
    }
    if (prev.done !== item.done) {
      changes.push({
        field: "acceptanceCriteria",
        from: `${prev.done ? "[x]" : "[ ]"} ${prev.text}`,
        to: `${item.done ? "[x]" : "[ ]"} ${item.text}`,
      });
    }
  });

  before.forEach((item) => {
    if (!afterById.has(item.id)) {
      changes.push({
        field: "acceptanceCriteria",
        from: `Removed: ${item.text}`,
        to: "None",
      });
    }
  });

  return changes;
}

function parseAssigneeIdsQuery(raw) {
  if (Array.isArray(raw)) {
    return [
      ...new Set(
        raw.map((value) => String(value || "").trim()).filter(Boolean),
      ),
    ];
  }
  const text = String(raw || "").trim();
  if (!text) return [];
  return [
    ...new Set(
      text
        .split(",")
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

function readAssigneeFilter(req) {
  const assigneeIds = parseAssigneeIdsQuery(req.query.assigneeIds);
  if (assigneeIds.length > 0) {
    return {
      assigneeIds,
      // legacy compatibility for older code paths
      assigneeId: assigneeIds[0],
    };
  }
  const assigneeId = String(req.query.assigneeId || "").trim();
  return {
    assigneeId,
    assigneeIds: assigneeId ? [assigneeId] : [],
  };
}

function resolveCreateTaskStatus(rawStatus, settings) {
  const requested = String(rawStatus || "").trim();
  const candidates = requested
    ? [requested]
    : ["to_do", "todo"];
  if (requested === "to_do") candidates.push("todo");
  if (requested === "todo") candidates.push("to_do");
  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (isValidWorkflowStatus(candidate, settings)) return candidate;
  }
  return "";
}

function normalizeFieldValue(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

function buildTaskChanges(beforeTask, afterTask) {
  const changes = TRACKED_TASK_FIELDS.reduce((acc, field) => {
    const from = normalizeFieldValue(beforeTask?.[field]);
    const to = normalizeFieldValue(afterTask?.[field]);
    if (from === to) return acc;
    acc.push({ field, from, to });
    return acc;
  }, []);
  return [...changes, ...buildAcceptanceCriteriaChanges(beforeTask, afterTask)];
}

function taskNotificationMeta(task, extra = {}) {
  return {
    project_id: task?.projectId || null,
    task_id: task?.id || null,
    entity_type: "task",
    target_view: "board",
    ...extra,
  };
}

function withUserProjectScope(req, filters = {}) {
  if (req.user?.role === "admin") return filters;
  return {
    ...filters,
    limitProjectsToMemberUserId: req.user.id,
  };
}

function summaryFiltersFromQuery(req) {
  return withUserProjectScope(req, {
    projectId: req.query.projectId ? String(req.query.projectId) : "",
    from: req.query.from ? String(req.query.from) : "",
    to: req.query.to ? String(req.query.to) : "",
    interval: req.query.interval ? String(req.query.interval) : "week",
    type: req.query.type ? String(req.query.type) : "overview",
  });
}

router.get("/bootstrap", async (req, res) => {
  const projectId = req.query.projectId ? String(req.query.projectId) : "";
  const includeTasks = String(req.query.includeTasks || "false") === "true";
  const scopedFilters = withUserProjectScope(req, {
    projectId: projectId || undefined,
  });
  const [users, sprints, tasks, projects, userGroups] = await Promise.all([
    getUsers(),
    getSprints(scopedFilters),
    includeTasks ? getTasks(scopedFilters) : Promise.resolve([]),
    getProjects().then((list) =>
      req.user?.role === "admin"
        ? list
        : list.filter((project) =>
            (project.members || []).some(
              (member) => String(member.id) === String(req.user.id),
            ),
          ),
    ),
    getUserGroups(),
  ]);
  const settings = projectId
    ? await getProjectSettings(projectId)
    : getDefaultSettings();
  res.json({
    currentUser: req.user,
    columns: getWorkflowStageKeys(settings),
    workflowStages: settings.boardCardFields.workflowStages,
    users,
    sprints,
    tasks,
    projects,
    userGroups,
  });
});

router.get("/me/assigned-tasks", async (req, res) => {
  try {
    const tasks = await getTasks({
      assigneeId: req.user.id,
      ...(req.user.role !== "admin"
        ? { limitProjectsToMemberUserId: req.user.id }
        : {}),
    });
    return res.json(tasks);
  } catch {
    return res.status(500).json({ error: "Failed to load assigned tasks" });
  }
});

router.get("/app-settings/github", requireRole("admin"), async (_req, res) => {
  try {
    const settings = await getGithubIntegrationSettings();
    return res.json({
      githubOrg: settings.githubOrg,
      hasGithubToken: Boolean(settings.githubToken),
      hasGithubWebhookSecret: Boolean(settings.githubWebhookSecret),
      githubToken: settings.githubToken,
      githubWebhookSecret: settings.githubWebhookSecret,
      updatedAt: settings.updatedAt,
    });
  } catch {
    return res
      .status(500)
      .json({ error: "Failed to load app GitHub settings" });
  }
});

/** Org + flags only (no secrets); any signed-in user — for project settings / integration UI. */
router.get("/app-settings/github/summary", async (_req, res) => {
  try {
    const settings = await getGithubIntegrationSettings();
    return res.json({
      githubOrg: settings.githubOrg || "",
      hasGithubToken: Boolean(settings.githubToken),
      hasGithubWebhookSecret: Boolean(settings.githubWebhookSecret),
    });
  } catch {
    return res
      .status(500)
      .json({ error: "Failed to load GitHub integration summary" });
  }
});

router.patch("/app-settings/github", requireRole("admin"), async (req, res) => {
  try {
    const updated = await updateGithubIntegrationSettings(req.body || {});
    return res.json({
      githubOrg: updated.githubOrg,
      hasGithubToken: Boolean(updated.githubToken),
      hasGithubWebhookSecret: Boolean(updated.githubWebhookSecret),
      githubToken: updated.githubToken,
      githubWebhookSecret: updated.githubWebhookSecret,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error?.code === "GITHUB_SETTINGS_VALIDATION") {
      return res.status(400).json({ error: error.message });
    }
    return res
      .status(500)
      .json({ error: "Failed to save app GitHub settings" });
  }
});

router.post("/upload", (req, res) => {
  const middleware = upload.single("file");
  middleware(req, res, (error) => {
    const uploadErrorResponse = handleUploadError(error, res);
    if (uploadErrorResponse) return uploadErrorResponse;
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const publicPath = `/uploads/task-management/${req.file.filename}`;
    const publicUrl = `${req.protocol}://${req.get("host")}${publicPath}`;
    return res.status(201).json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      url: publicUrl,
    });
  });
});

router.post("/email/send", async (req, res) => {
  const { to, subject, text, html, from } = req.body || {};
  if (!isNonEmptyString(to) || !isNonEmptyString(subject)) {
    return res.status(400).json({ error: "to and subject are required" });
  }
  if (!isNonEmptyString(text) && !isNonEmptyString(html)) {
    return res.status(400).json({ error: "text or html is required" });
  }

  try {
    const result = await sendEmail({
      to: String(to).trim(),
      subject: String(subject).trim(),
      text: isNonEmptyString(text) ? String(text) : undefined,
      html: isNonEmptyString(html) ? String(html) : undefined,
      from: isNonEmptyString(from) ? String(from).trim() : undefined,
    });
    return res.status(200).json({
      message: "Email sent successfully",
      messageId: result?.messageId || null,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to send email" });
  }
});

router.get("/projects", async (_req, res) => {
  const projects = await getProjects();
  return res.json(projects);
});

router.get("/projects/paged", async (req, res) => {
  const page = await getProjectsPage({
    limit: req.query.limit,
    cursor: req.query.cursor,
  });
  const items =
    req.user?.role === "admin"
      ? page.items
      : page.items.filter((project) =>
          (project.members || []).some(
            (member) => String(member.id) === String(req.user.id),
          ),
        );
  return res.json({
    items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  });
});

router.post("/projects", async (req, res) => {
  if (
    !isNonEmptyString(req.body?.name) ||
    !isNonEmptyString(req.body?.projectKey)
  ) {
    return res.status(400).json({ error: "name and projectKey are required" });
  }
  try {
    const project = await createProject({
      name: req.body.name.trim(),
      projectKey: req.body.projectKey.trim().toUpperCase(),
      description: req.body.description || "",
      memberIds: req.body.memberIds || [],
    });
    const memberIds = (project.members || []).map((member) => member.id);
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: memberIds,
      type: "project_membership_added",
      title: `Added to project ${project.name}`,
      body: `${req.user.name} added you to ${project.name}.`,
      entityType: "project",
      entityId: project.id,
      metadata: {
        project_id: project.id,
        target_view: "board",
      },
      dedupeKey: `project-created-membership:${project.id}`,
    });
    return res.status(201).json(project);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Project key already exists" });
    }
    return res.status(500).json({ error: "Failed to create project" });
  }
});

router.patch("/projects/:projectId", async (req, res) => {
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body.projectKey !== undefined)
    patch.projectKey = String(req.body.projectKey).trim().toUpperCase();
  if (req.body.description !== undefined)
    patch.description = String(req.body.description);
  if (req.body.memberIds !== undefined) patch.memberIds = req.body.memberIds;
  if (req.body.projectAdminMemberIds !== undefined) {
    patch.projectAdminMemberIds = req.body.projectAdminMemberIds;
  }

  try {
    if (
      !(await requireProjectManagementAccess(req, res, req.params.projectId))
    ) {
      return;
    }
    const beforeProject = await getProjectById(req.params.projectId);
    const project = await updateProject(req.params.projectId, patch);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (patch.memberIds !== undefined && beforeProject) {
      const beforeMemberIds = new Set(
        (beforeProject.members || []).map((member) => String(member.id)),
      );
      const newMemberIds = (project.members || [])
        .map((member) => String(member.id))
        .filter((id) => !beforeMemberIds.has(id));
      if (newMemberIds.length) {
        await createAndDispatchNotifications({
          actorUserId: req.user.id,
          recipientUserIds: newMemberIds,
          type: "project_membership_added",
          title: `Added to project ${project.name}`,
          body: `${req.user.name} added you to ${project.name}.`,
          entityType: "project",
          entityId: project.id,
          metadata: {
            project_id: project.id,
            target_view: "board",
          },
        });
      }
    }
    return res.json(project);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Project key already exists" });
    }
    return res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/projects/:projectId", async (req, res) => {
  if (!(await requireProjectManagementAccess(req, res, req.params.projectId))) {
    return;
  }
  const deleted = await deleteProject(req.params.projectId);
  if (!deleted) {
    return res.status(404).json({ error: "Project not found" });
  }
  return res.status(204).send();
});

router.get("/projects/:projectId/settings", async (req, res) => {
  if (!(await projectExists(req.params.projectId))) {
    return res.status(404).json({ error: "Project not found" });
  }
  const settings = await getProjectSettings(req.params.projectId);
  return res.json(settings);
});

router.patch("/projects/:projectId/settings", async (req, res) => {
  if (!(await projectExists(req.params.projectId))) {
    return res.status(404).json({ error: "Project not found" });
  }
  if (!(await requireProjectManagementAccess(req, res, req.params.projectId))) {
    return;
  }
  try {
    await updateProjectSettings(req.params.projectId, req.body || {});
    const settings = await getProjectSettings(req.params.projectId);
    return res.json(settings);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid settings" });
  }
});

router.get("/board", async (req, res) => {
  const assigneeFilter = readAssigneeFilter(req);
  const sprintId = req.query.sprintId ? String(req.query.sprintId) : "";
  const projectId = req.query.projectId ? String(req.query.projectId) : "";
  const filters = {
    assigneeId: assigneeFilter.assigneeId,
    assigneeIds: assigneeFilter.assigneeIds,
    status: req.query.status,
    priority: req.query.priority,
    type: req.query.type,
    label: req.query.label,
    search: req.query.search,
  };
  const scopedFilters = withUserProjectScope(req, filters);
  const columns = await buildBoard(
    sprintId || null,
    projectId || null,
    scopedFilters,
  );
  let totalsByStatus = {};
  if (
    scopedFilters.assigneeId ||
    (Array.isArray(scopedFilters.assigneeIds) &&
      scopedFilters.assigneeIds.length > 0)
  ) {
    const totalsColumns = await buildBoard(
      sprintId || null,
      projectId || null,
      { ...scopedFilters, assigneeId: "", assigneeIds: [] },
    );
    totalsColumns.forEach((column) => {
      totalsByStatus[column.status] = (column.tasks || []).length;
    });
  } else {
    columns.forEach((column) => {
      totalsByStatus[column.status] = (column.tasks || []).length;
    });
  }
  return res.json({ columns, totalsByStatus });
});

router.get("/board/paged", async (req, res) => {
  const assigneeFilter = readAssigneeFilter(req);
  const sprintIdParam = req.query.sprintId ? String(req.query.sprintId) : "";
  const projectId = req.query.projectId ? String(req.query.projectId) : "";
  const fastMode = String(req.query.fast || "") === "1";
  let sprintId = sprintIdParam;
  let activeSprint = null;
  if (sprintIdParam === "__active__" && projectId) {
    const sprints = await getSprints({ projectId });
    activeSprint = (sprints || []).find((sprint) => sprint.status === "active") || null;
    sprintId = activeSprint ? String(activeSprint.id) : "";
  }
  const filters = withUserProjectScope(req, {
    sprintId: sprintId || null,
    projectId: projectId || null,
    assigneeId: assigneeFilter.assigneeId,
    assigneeIds: assigneeFilter.assigneeIds,
    status: req.query.status,
    priority: req.query.priority,
    type: req.query.type,
    label: req.query.label,
    search: req.query.search,
  });
  const page = await getTasksPage(filters, {
    limit: req.query.limit,
    cursor: req.query.cursor,
  });
  const settings = projectId
    ? await getProjectSettings(projectId)
    : getDefaultSettings();
  const workflowStages = Array.isArray(settings?.boardCardFields?.workflowStages)
    ? settings.boardCardFields.workflowStages
    : [];
  const stageMetaByKey = new Map(
    workflowStages.map((stage) => [String(stage.key || ""), stage]),
  );
  const stages = getWorkflowStageKeys(settings);
  const pageByStatus = new Map();
  page.items.forEach((task) => {
    const key = String(task.status || "");
    const bucket = pageByStatus.get(key) || [];
    bucket.push(task);
    pageByStatus.set(key, bucket);
  });
  const pagedColumns = stages.map((stageKey) => ({
    status: stageKey,
    name: stageMetaByKey.get(stageKey)?.name || stageKey,
    description: stageMetaByKey.get(stageKey)?.description || "",
    badge: stageMetaByKey.get(stageKey)?.badge || "",
    counterGroup: stageMetaByKey.get(stageKey)?.counterGroup || "upcoming",
    tasks: pageByStatus.get(stageKey) || [],
  }));
  let totalsByStatus = null;
  if (!fastMode) {
    totalsByStatus = await getTaskStatusTotals(filters);
    const emptyButNonZeroStatuses = stages.filter(
      (stageKey) =>
        Number(totalsByStatus?.[stageKey] || 0) > 0 &&
        (pagedColumns.find((column) => column.status === stageKey)?.tasks || [])
          .length === 0,
    );
    if (emptyButNonZeroStatuses.length > 0) {
      const previews = await Promise.all(
        emptyButNonZeroStatuses.map(async (statusKey) => {
          const preview = await getTasksPage(
            { ...filters, status: statusKey },
            { limit: 5, cursor: "" },
          );
          return {
            statusKey,
            items: Array.isArray(preview?.items) ? preview.items : [],
          };
        }),
      );
      previews.forEach(({ statusKey, items }) => {
        if (!items.length) return;
        const column = pagedColumns.find((entry) => entry.status === statusKey);
        if (!column) return;
        const existingIds = new Set((column.tasks || []).map((task) => String(task.id)));
        const uniqueItems = items.filter(
          (task) => !existingIds.has(String(task?.id || "")),
        );
        column.tasks = [...(column.tasks || []), ...uniqueItems];
      });
    }
  }
  return res.json({
    columns: pagedColumns,
    totalsByStatus,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    activeSprintId: activeSprint ? String(activeSprint.id) : "",
    activeSprintName: activeSprint ? String(activeSprint.name || "") : "",
  });
});

router.get("/tasks/search", async (req, res) => {
  const term = String(req.query.search || "").trim();
  if (!term) return res.json([]);
  const assigneeFilter = readAssigneeFilter(req);
  const rows = await searchTasks(
    withUserProjectScope(req, {
      sprintId: req.query.sprintId,
      projectId: req.query.projectId,
      assigneeId: assigneeFilter.assigneeId,
      assigneeIds: assigneeFilter.assigneeIds,
      status: req.query.status,
      priority: req.query.priority,
      type: req.query.type,
      label: req.query.label,
      search: term,
    }),
    {
      limit: req.query.limit,
    },
  );
  return res.json(rows);
});

router.get("/dashboard", async (req, res) => {
  try {
    const payload = await getDashboardData({
      userId: req.user.id,
      limitProjectsToMemberUserId: req.user.id,
    });
    return res.json(payload);
  } catch {
    return res.status(500).json({ error: "Failed to load dashboard data" });
  }
});

router.get("/analytics/overview", async (req, res) => {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }
    const payload = await getSummaryOverviewAnalytics(filters);
    return res.json(payload);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || "Failed to load analytics" });
  }
});

router.get("/analytics/sprint", async (req, res) => {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }
    const payload = await getSummarySprintAnalytics(filters);
    return res.json(payload);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || "Failed to load analytics" });
  }
});

router.get("/analytics/flow", async (req, res) => {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }
    const payload = await getSummaryFlowAnalytics(filters);
    return res.json(payload);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || "Failed to load analytics" });
  }
});

router.get("/analytics/workload", async (req, res) => {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }
    const payload = await getSummaryWorkloadAnalytics(filters);
    return res.json(payload);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || "Failed to load analytics" });
  }
});

router.get("/reports/export", async (req, res) => {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }
    const exported = await buildSummaryReportExport(filters);
    const stamp = new Date().toISOString().slice(0, 10);
    const type = String(filters.type || "overview").toLowerCase();
    const filename = `summary-${type}-${stamp}.${exported.extension}`;
    res.setHeader("Content-Type", exported.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(exported.buffer);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || "Failed to export report" });
  }
});

router.get("/users", async (_req, res) => {
  const users = await getUsers();
  return res.json(users);
});

router.get("/users/paged", async (req, res) => {
  const rawIsActive = String(req.query.isActive || "").trim().toLowerCase();
  const isActive =
    rawIsActive === "true" ? true : rawIsActive === "false" ? false : undefined;
  const page = await getUsersPage({
    limit: req.query.limit,
    cursor: req.query.cursor,
    isActive,
  });
  return res.json(page);
});

router.get("/user-groups", async (_req, res) => {
  const groups = await getUserGroups();
  return res.json(groups);
});

router.post("/user-groups", requireRole("admin"), async (req, res) => {
  if (!isNonEmptyString(req.body?.name)) {
    return res.status(400).json({ error: "name is required" });
  }
  try {
    const group = await createUserGroup({
      name: req.body.name,
      memberIds: req.body.memberIds || [],
    });
    return res.status(201).json(group);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Group name already exists" });
    }
    return res.status(500).json({ error: "Failed to create group" });
  }
});

router.patch(
  "/user-groups/:groupId",
  requireRole("admin"),
  async (req, res) => {
    try {
      const group = await updateUserGroup(req.params.groupId, {
        ...(req.body.name !== undefined ? { name: req.body.name } : {}),
        ...(req.body.memberIds !== undefined
          ? { memberIds: req.body.memberIds }
          : {}),
      });
      if (!group) return res.status(404).json({ error: "Group not found" });
      return res.json(group);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Group name already exists" });
      }
      return res.status(500).json({ error: "Failed to update group" });
    }
  },
);

router.delete(
  "/user-groups/:groupId",
  requireRole("admin"),
  async (req, res) => {
    const deleted = await deleteUserGroup(req.params.groupId);
    if (!deleted) return res.status(404).json({ error: "Group not found" });
    return res.status(204).send();
  },
);

router.post("/users", requireRole("admin"), async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }
  const temporaryPassword = isNonEmptyString(req.body.password)
    ? String(req.body.password)
    : generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const generatedName = `New User (${normalizedEmail.split("@")[0] || "member"})`;
  try {
    const created = await createUser({
      name: generatedName,
      email: normalizedEmail,
      passwordHash,
      role: req.body.role || "member",
      mustChangePassword: true,
    });
    const frontendUrl = String(process.env.FRONTEND_URL)
      .trim()
      .replace(/\/+$/, "");
    const requestBaseUrl = `${req.protocol}://${req.get("host")}`.replace(
      /\/+$/,
      "",
    );
    const loginUrl = `${(frontendUrl || requestBaseUrl).replace(/\/+$/, "")}/`;
    await sendEmail({
      to: created.email,
      subject: "Welcome to Task Manager - Account Access Details",
      text:
        `Hello,\n\n` +
        `This email was sent from the Task Manager app.\n\n` +
        `Your Task Manager account has been successfully created.\n\n` +
        `Account details:\n` +
        `- Email: ${created.email}\n` +
        `- Temporary password: ${temporaryPassword}\n` +
        `- Login URL: ${loginUrl}\n\n` +
        `For security, you will be prompted to set your display name and change your password on first sign-in.\n\n` +
        `If you did not expect this email, please contact your administrator.\n\n` +
        `Regards,\n` +
        `Task Manager Team`,
      html:
        `<p>Hello,</p>` +
        `<p>This email was sent from the <strong>Task Manager</strong> app.</p>` +
        `<p>Your <strong>Task Manager</strong> account has been successfully created.</p>` +
        `<p><strong>Account details</strong><br/>` +
        `Email: ${created.email}<br/>` +
        `Temporary password: ${temporaryPassword}<br/>` +
        `Login URL: <a href="${loginUrl}">${loginUrl}</a></p>` +
        `<p>For security, you will be prompted to set your display name and change your password on first sign-in.</p>` +
        `<p>If you did not expect this email, please contact your administrator.</p>` +
        `<p>Regards,<br/>Task Manager Team</p>`,
    });
    await logUserAudit({
      actorUserId: req.user.id,
      targetUserId: created.id,
      action: "user_created",
      metadata: { role: created.role },
    }).catch(() => {});
    return res.status(201).json(created);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/users/:userId", requireRole("admin"), async (req, res) => {
  const payload = {};
  if (isNonEmptyString(req.body?.name)) payload.name = req.body.name.trim();
  if (isNonEmptyString(req.body?.email))
    payload.email = req.body.email.trim().toLowerCase();
  if (isNonEmptyString(req.body?.role)) payload.role = req.body.role;
  if (isNonEmptyString(req.body?.password)) {
    payload.passwordHash = await bcrypt.hash(req.body.password, 12);
    payload.mustChangePassword = true;
    payload.passwordChangedAt = null;
  }

  const updated = await updateUser(req.params.userId, payload);
  if (!updated) {
    return res
      .status(404)
      .json({ error: "User not found or no valid fields to update" });
  }
  await logUserAudit({
    actorUserId: req.user.id,
    targetUserId: updated.id,
    action: "user_updated",
    metadata: { updatedFields: Object.keys(payload) },
  }).catch(() => {});
  return res.json(updated);
});

router.patch(
  "/users/:userId/disable",
  requireRole("admin"),
  async (req, res) => {
    const targetUserId = String(req.params.userId);
    if (targetUserId === String(req.user.id)) {
      return res
        .status(400)
        .json({ error: "You cannot disable your own account" });
    }
    const disabled = await disableUser(
      targetUserId,
      req.user.id,
      req.body?.reason || "",
    );
    if (!disabled) {
      return res.status(404).json({ error: "User not found" });
    }
    await logUserAudit({
      actorUserId: req.user.id,
      targetUserId: disabled.id,
      action: "user_disabled",
      metadata: { reason: String(req.body?.reason || "").trim() },
    }).catch(() => {});
    return res.json(disabled);
  },
);

router.patch(
  "/users/:userId/enable",
  requireRole("admin"),
  async (req, res) => {
    const enabled = await enableUser(String(req.params.userId));
    if (!enabled) {
      return res.status(404).json({ error: "User not found" });
    }
    await logUserAudit({
      actorUserId: req.user.id,
      targetUserId: enabled.id,
      action: "user_enabled",
    }).catch(() => {});
    return res.json(enabled);
  },
);

router.delete("/users/:userId", requireRole("admin"), async (req, res) => {
  const targetUserId = String(req.params.userId);
  if (targetUserId === String(req.user.id)) {
    return res
      .status(400)
      .json({ error: "You cannot delete your own account" });
  }

  const deleted = await deleteUser(targetUserId);
  if (!deleted) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.status(204).send();
});

router.get("/sprints", async (req, res) => {
  const sprints = await getSprints({ projectId: req.query.projectId });
  return res.json(sprints);
});

router.post("/sprints", async (req, res) => {
  const { name, projectId } = req.body;
  if (!name || !projectId) {
    return res.status(400).json({ error: "name and projectId are required" });
  }
  if (!(await requireProjectManagementAccess(req, res, projectId))) {
    return;
  }
  try {
    const sprint = await createSprint(req.body);
    return res.status(201).json(sprint);
  } catch (error) {
    if (error.message === ACTIVE_SPRINT_CONFLICT_MESSAGE) {
      return res.status(409).json({ error: error.message });
    }
    return res
      .status(400)
      .json({ error: error.message || "Failed to create sprint" });
  }
});

router.patch("/sprints/:sprintId", async (req, res) => {
  if (
    !(await requireProjectManagementAccessForSprint(
      req,
      res,
      req.params.sprintId,
    ))
  ) {
    return;
  }
  try {
    const sprint = await updateSprint(req.params.sprintId, req.body || {});
    if (!sprint) {
      return res
        .status(404)
        .json({ error: "Sprint not found or no fields to update" });
    }
    return res.json(sprint);
  } catch (error) {
    if (error.message === ACTIVE_SPRINT_CONFLICT_MESSAGE) {
      return res.status(409).json({ error: error.message });
    }
    return res
      .status(400)
      .json({ error: error.message || "Failed to update sprint" });
  }
});

router.post("/sprints/:sprintId/start", async (req, res) => {
  if (
    !(await requireProjectManagementAccessForSprint(
      req,
      res,
      req.params.sprintId,
    ))
  ) {
    return;
  }
  try {
    const sprint = await updateSprint(req.params.sprintId, {
      status: "active",
    });
    if (!sprint) {
      return res.status(404).json({ error: "Sprint not found" });
    }
    return res.json(sprint);
  } catch (error) {
    if (error.message === ACTIVE_SPRINT_CONFLICT_MESSAGE) {
      return res.status(409).json({ error: error.message });
    }
    return res
      .status(400)
      .json({ error: error.message || "Failed to start sprint" });
  }
});

router.post("/sprints/:sprintId/complete", async (req, res) => {
  if (
    !(await requireProjectManagementAccessForSprint(
      req,
      res,
      req.params.sprintId,
    ))
  ) {
    return;
  }
  try {
    const sprint = await completeSprint(
      req.params.sprintId,
      req.body?.moveIncompleteToSprintId || null,
    );
    if (!sprint) {
      return res.status(404).json({ error: "Sprint not found" });
    }
    return res.json(sprint);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || "Failed to complete sprint" });
  }
});

router.get("/sprints/:sprintId/tasks", async (req, res) => {
  const tasks = await getTasks({
    sprintId: req.params.sprintId,
    projectId: req.query.projectId,
  });
  return res.json(tasks);
});

router.post("/sprints/:sprintId/tasks", async (req, res) => {
  if (
    !(await requireProjectManagementAccessForSprint(
      req,
      res,
      req.params.sprintId,
    ))
  ) {
    return;
  }
  const sprintId = String(req.params.sprintId);
  const taskIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
  if (!taskIds.length) {
    return res.status(400).json({ error: "taskIds is required" });
  }

  const updatedTasks = await assignTasksToSprint(taskIds, sprintId);
  return res.json({ updatedTasks });
});

router.delete("/sprints/:sprintId/tasks/:taskId", async (req, res) => {
  if (
    !(await requireProjectManagementAccessForSprint(
      req,
      res,
      req.params.sprintId,
    ))
  ) {
    return;
  }
  const removed = await removeTaskFromSprint(
    String(req.params.taskId),
    String(req.params.sprintId),
  );
  if (!removed) {
    return res.status(404).json({ error: "Task not found in sprint" });
  }
  return res.json(removed);
});

router.delete("/sprints/:sprintId", async (req, res) => {
  if (
    !(await requireProjectManagementAccessForSprint(
      req,
      res,
      req.params.sprintId,
    ))
  ) {
    return;
  }
  try {
    const deleted = await deleteSprint(req.params.sprintId);
    if (!deleted) return res.status(404).json({ error: "Sprint not found" });
    return res.status(204).send();
  } catch (error) {
    if (error.message === SPRINT_DELETE_NOT_EMPTY_MESSAGE) {
      return res.status(409).json({ error: error.message });
    }
    return res
      .status(400)
      .json({ error: error.message || "Failed to delete sprint" });
  }
});

router.get("/tasks", async (req, res) => {
  const assigneeFilter = readAssigneeFilter(req);
  const tasks = await getTasks(
    withUserProjectScope(req, {
      sprintId: req.query.sprintId,
      projectId: req.query.projectId,
      backlogScope: String(req.query.backlogScope || "false") === "true",
      includeSprintId: req.query.includeSprintId,
      assigneeId: assigneeFilter.assigneeId,
      assigneeIds: assigneeFilter.assigneeIds,
      status: req.query.status,
      priority: req.query.priority,
      type: req.query.type,
      label: req.query.label,
      search: req.query.search,
    }),
  );
  return res.json(tasks);
});

router.get("/tasks/paged", async (req, res) => {
  const assigneeFilter = readAssigneeFilter(req);
  const page = await getTasksPage(
    withUserProjectScope(req, {
      sprintId: req.query.sprintId,
      projectId: req.query.projectId,
      backlogScope: String(req.query.backlogScope || "false") === "true",
      includeSprintId: req.query.includeSprintId,
      assigneeId: assigneeFilter.assigneeId,
      assigneeIds: assigneeFilter.assigneeIds,
      status: req.query.status,
      priority: req.query.priority,
      type: req.query.type,
      label: req.query.label,
      search: req.query.search,
    }),
    { limit: req.query.limit, cursor: req.query.cursor },
  );
  return res.json(page);
});

router.get("/backlog", async (req, res) => {
  const assigneeFilter = readAssigneeFilter(req);
  const tasks = await getTasks(
    withUserProjectScope(req, {
      sprintId: "backlog",
      projectId: req.query.projectId,
      assigneeId: assigneeFilter.assigneeId,
      assigneeIds: assigneeFilter.assigneeIds,
      status: req.query.status,
      priority: req.query.priority,
      type: req.query.type,
      label: req.query.label,
      search: req.query.search,
    }),
  );
  return res.json(tasks);
});

router.get("/backlog/paged", async (req, res) => {
  const assigneeFilter = readAssigneeFilter(req);
  const page = await getTasksPage(
    withUserProjectScope(req, {
      sprintId: "backlog",
      projectId: req.query.projectId,
      assigneeId: assigneeFilter.assigneeId,
      assigneeIds: assigneeFilter.assigneeIds,
      status: req.query.status,
      priority: req.query.priority,
      type: req.query.type,
      label: req.query.label,
      search: req.query.search,
    }),
    { limit: req.query.limit, cursor: req.query.cursor },
  );
  return res.json(page);
});

router.get("/backlog/rows", async (req, res) => {
  try {
    const assigneeFilter = readAssigneeFilter(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : "";
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }
    const rows = await getBacklogRows({
      projectId,
      selectedSprintId: req.query.selectedSprintId
        ? String(req.query.selectedSprintId)
        : "",
      filters: {
        assigneeId: assigneeFilter.assigneeId,
        assigneeIds: assigneeFilter.assigneeIds,
        status: req.query.status,
        priority: req.query.priority,
        type: req.query.type,
        label: req.query.label,
        search: req.query.search,
      },
      ...(req.user?.role !== "admin"
        ? { limitProjectsToMemberUserId: req.user.id }
        : {}),
    });
    return res.json({ rows });
  } catch {
    return res.status(500).json({ error: "Failed to load backlog rows" });
  }
});

router.post("/tasks", async (req, res) => {
  const { title, projectId } = req.body;
  if (!title || !projectId) {
    return res.status(400).json({ error: "title and projectId are required" });
  }

  const settings = await getProjectSettings(req.body.projectId);
  const nextStatus = resolveCreateTaskStatus(req.body?.status, settings);
  if (!nextStatus) {
    return res.status(400).json({ error: "Invalid status" });
  }
  req.body.status = nextStatus;

  const created = await createTask(req.body, req.user.id);
  await addTaskActivity(created.id, req.user.id, "task_created", {
    title: created.title,
  });
  if (created.assigneeId) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: [created.assigneeId],
      type: "task_assigned",
      title: `Assigned: ${created.title}`,
      body: `${req.user.name} assigned you a task.`,
      entityType: "task",
      entityId: created.id,
      metadata: taskNotificationMeta(created),
    });
  }
  return res.status(201).json(created);
});

router.get("/tasks/:taskId", async (req, res) => {
  const task = await getTaskById(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const [comments, activity, linkedDev] = await Promise.all([
    getTaskComments(req.params.taskId),
    getTaskActivity(req.params.taskId),
    getTaskLinkedDev(req.params.taskId),
  ]);
  return res.json({ task, comments, activity, linkedDev });
});

router.patch("/tasks/:taskId", async (req, res) => {
  const current = await getTaskById(req.params.taskId);
  if (!current) {
    return res.status(404).json({ error: "Task not found" });
  }
  if (req.body?.status !== undefined) {
    const allowed = await canUserMoveTask(current, req.body.status, req.user);
    if (!allowed) {
      return res
        .status(403)
        .json({ error: "You are not allowed to move tasks to that stage" });
    }
  }

  let updated;
  try {
    updated = await updateTask(req.params.taskId, req.body || {});
  } catch (error) {
    if (error?.code === "TASK_CONFLICT") {
      return res.status(409).json({ error: error.message });
    }
    throw error;
  }
  if (!updated) {
    return res.status(400).json({ error: "No valid fields provided" });
  }
  const changes = buildTaskChanges(current, updated);
  if (changes.length) {
    await addTaskActivity(updated.id, req.user.id, "task_updated", {
      changes,
    });
    const assigneeChange = changes.find(
      (change) => change.field === "assigneeId",
    );
    // Emit task_updated for any task change.
    if (updated.assigneeId) {
      await createAndDispatchNotifications({
        actorUserId: req.user.id,
        recipientUserIds: [updated.assigneeId],
        type: "task_updated",
        title: `Task updated: ${updated.title}`,
        body: `${req.user.name} updated a task assigned to you.`,
        entityType: "task",
        entityId: updated.id,
        metadata: taskNotificationMeta(updated, { changes }),
        dedupeKey: `task-update:${updated.id}:${updated.updatedAt}`,
      });
    }
    // If assignment changed, also emit a dedicated task_assigned notification.
    if (assigneeChange?.to) {
      await createAndDispatchNotifications({
        actorUserId: req.user.id,
        recipientUserIds: [assigneeChange.to],
        type: "task_assigned",
        title: `Assigned: ${updated.title}`,
        body: `${req.user.name} assigned you this task.`,
        entityType: "task",
        entityId: updated.id,
        metadata: taskNotificationMeta(updated),
        dedupeKey: `task-assigned:${updated.id}:${assigneeChange.to}:${updated.updatedAt}`,
      });
    }
    if (req.body?.description !== undefined) {
      const mentionedUserIds = await resolveMentionedUserIds(
        req.body.description,
        {
          excludeUserId: req.user.id,
          projectId: updated.projectId,
        },
      );
      if (mentionedUserIds.length) {
        await createAndDispatchNotifications({
          actorUserId: req.user.id,
          recipientUserIds: mentionedUserIds,
          type: "mention_description",
          title: `Mentioned in ${updated.title}`,
          body: `${req.user.name} mentioned you in a task description.`,
          entityType: "task",
          entityId: updated.id,
          metadata: taskNotificationMeta(updated, { source: "description" }),
          dedupeKey: `mention-description:${updated.id}:${updated.updatedAt}`,
        });
      }
    }
  }
  return res.json(updated);
});

router.patch("/tasks/:taskId/move", async (req, res) => {
  const nextStatus = req.body?.status;
  const current = await getTaskById(req.params.taskId);
  if (!current) {
    return res.status(404).json({ error: "Task not found" });
  }
  const settings = await getProjectSettings(current.projectId);
  if (!nextStatus || !isValidWorkflowStatus(nextStatus, settings)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const allowed = await canUserMoveTask(current, nextStatus, req.user);
  if (!allowed) {
    return res
      .status(403)
      .json({ error: "You are not allowed to move tasks to that stage" });
  }
  const updated = await updateTask(req.params.taskId, { status: nextStatus });
  await addTaskActivity(updated.id, req.user.id, "task_moved", {
    from: current.status,
    to: updated.status,
  });
  if (updated.assigneeId) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: [updated.assigneeId],
      type: "task_updated",
      title: `Task updated: ${updated.title}`,
      body: `${req.user.name} updated task status (${current.status} -> ${updated.status}).`,
      entityType: "task",
      entityId: updated.id,
      metadata: taskNotificationMeta(updated, {
        changes: [
          { field: "status", from: current.status, to: updated.status },
        ],
      }),
      dedupeKey: `task-move:${updated.id}:${updated.updatedAt}`,
    });
  }
  return res.json(updated);
});

router.delete("/tasks/:taskId", async (req, res) => {
  const deleted = await deleteTask(req.params.taskId);
  if (!deleted) {
    return res.status(404).json({ error: "Task not found" });
  }
  return res.status(204).send();
});

router.post("/tasks/:taskId/comments", async (req, res) => {
  if (!isNonEmptyString(req.body?.body)) {
    return res.status(400).json({ error: "Comment body is required" });
  }

  const task = await getTaskById(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const comment = await addTaskComment(
    req.params.taskId,
    req.user.id,
    req.body.body.trim(),
  );
  await addTaskActivity(req.params.taskId, req.user.id, "comment_added", {
    detail: comment.body,
  });
  if (task.assigneeId) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: [task.assigneeId],
      type: "task_comment_added",
      title: `New comment on ${task.title}`,
      body: `${req.user.name} commented on an assigned task.`,
      entityType: "task",
      entityId: task.id,
      metadata: taskNotificationMeta(task, {
        source: "comment",
        target_comment_id: comment.id,
      }),
    });
  }
  const mentionedUserIds = await resolveMentionedUserIds(req.body.body.trim(), {
    excludeUserId: req.user.id,
    projectId: task.projectId,
  });
  if (mentionedUserIds.length) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: mentionedUserIds,
      type: "mention_comment",
      title: `Mentioned in ${task.title}`,
      body: `${req.user.name} mentioned you in a comment.`,
      entityType: "task",
      entityId: task.id,
      metadata: taskNotificationMeta(task, {
        source: "comment",
        target_comment_id: comment.id,
      }),
      dedupeKey: `mention-comment:${comment.id}`,
    });
  }
  return res.status(201).json(comment);
});

router.patch("/tasks/:taskId/comments/:commentId", async (req, res) => {
  if (!isNonEmptyString(req.body?.body)) {
    return res.status(400).json({ error: "Comment body is required" });
  }
  const task = await getTaskById(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const updated = await updateTaskComment(
    req.params.taskId,
    req.params.commentId,
    req.user.id,
    req.body.body.trim(),
  );
  if (!updated) {
    return res
      .status(404)
      .json({ error: "Comment not found or not owned by user" });
  }
  await addTaskActivity(req.params.taskId, req.user.id, "comment_updated", {
    detail: updated.body,
  });
  const mentionedUserIds = await resolveMentionedUserIds(req.body.body.trim(), {
    excludeUserId: req.user.id,
    projectId: task.projectId,
  });
  if (mentionedUserIds.length) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: mentionedUserIds,
      type: "mention_comment",
      title: `Mentioned in ${task.title}`,
      body: `${req.user.name} mentioned you in a comment.`,
      entityType: "task",
      entityId: task.id,
      metadata: taskNotificationMeta(task, {
        source: "comment",
        target_comment_id: updated.id,
      }),
      dedupeKey: `mention-comment:${updated.id}:updated`,
    });
  }
  return res.json(updated);
});

router.delete("/tasks/:taskId/comments/:commentId", async (req, res) => {
  const task = await getTaskById(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const deleted = await deleteTaskComment(
    req.params.taskId,
    req.params.commentId,
    req.user.id,
  );
  if (!deleted) {
    return res
      .status(404)
      .json({ error: "Comment not found or not owned by user" });
  }
  await addTaskActivity(req.params.taskId, req.user.id, "comment_deleted", {});
  return res.status(204).send();
});

export default router;
