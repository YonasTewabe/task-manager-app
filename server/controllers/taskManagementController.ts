import { isNonEmptyString } from "../utils/validation.js";
import type { Request, Response } from "express";
import { sendEmail } from "../utils/email.js";
import { asObjectRecord, asString } from "../utils/guards.js";
import {
  getProjects,
  getProjectsPage,
  getSprints,
  getSummaryFlowAnalytics,
  getSummaryOverviewAnalytics,
  getSummarySprintAnalytics,
  getSummaryWorkloadAnalytics,
  getDashboardData,
  getBacklogRows,
  getTasksPage,
  getUsers,
  getUsersPage,
  getUserGroups,
  searchTasks,
  getTasks,
  buildSummaryReportExport,
} from "../services/taskService.js";
import {
  getGithubIntegrationSettings,
  updateGithubIntegrationSettings,
} from "../services/appSettingsService.js";

function withUserProjectScope(req: Request, filters: any = {}) {
  if (req.user?.role === "admin") return filters;
  return {
    ...filters,
    limitProjectsToMemberUserId: req.user.id,
  };
}

function summaryFiltersFromQuery(req: Request) {
  return withUserProjectScope(req, {
    projectId: req.query.projectId ? String(req.query.projectId) : "",
    from: req.query.from ? String(req.query.from) : "",
    to: req.query.to ? String(req.query.to) : "",
    interval: req.query.interval ? String(req.query.interval) : "week",
    type: req.query.type ? String(req.query.type) : "overview",
  });
}

function parseAssigneeIdsQuery(raw) {
  if (Array.isArray(raw)) {
    return [
      ...new Set(raw.map((value) => String(value || "").trim()).filter(Boolean)),
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

function readAssigneeFilter(req: Request) {
  const assigneeIds = parseAssigneeIdsQuery(req.query.assigneeIds);
  if (assigneeIds.length > 0) {
    return { assigneeIds, assigneeId: assigneeIds[0] };
  }
  const assigneeId = String(req.query.assigneeId || "").trim();
  return { assigneeId, assigneeIds: assigneeId ? [assigneeId] : [] };
}

export async function assignedTasksHandler(req: Request, res: Response) {
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
}

export async function getGithubSettingsHandler(_req: Request, res: Response) {
  try {
    const settings = await getGithubIntegrationSettings();
    return res.json({
      githubOrg: settings.githubOrg,
      hasGithubToken: Boolean(settings.githubToken),
      hasGithubWebhookSecret: Boolean(settings.githubWebhookSecret),
      updatedAt: settings.updatedAt,
    });
  } catch {
    return res.status(500).json({ error: "Failed to load app GitHub settings" });
  }
}

export async function getGithubSummaryHandler(_req: Request, res: Response) {
  try {
    const settings = await getGithubIntegrationSettings();
    return res.json({
      githubOrg: settings.githubOrg || "",
      hasGithubToken: Boolean(settings.githubToken),
      hasGithubWebhookSecret: Boolean(settings.githubWebhookSecret),
    });
  } catch {
    return res.status(500).json({ error: "Failed to load GitHub integration summary" });
  }
}

export async function patchGithubSettingsHandler(req: Request, res: Response) {
  try {
    const updated = await updateGithubIntegrationSettings(req.body || {});
    return res.json({
      githubOrg: updated.githubOrg,
      hasGithubToken: Boolean(updated.githubToken),
      hasGithubWebhookSecret: Boolean(updated.githubWebhookSecret),
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error?.code === "GITHUB_SETTINGS_VALIDATION") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to save app GitHub settings" });
  }
}

export async function sendEmailHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  const to = body.to;
  const subject = body.subject;
  const text = body.text;
  const html = body.html;
  const from = body.from;
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
    return res.status(500).json({ error: error.message || "Failed to send email" });
  }
}

export async function listProjectsHandler(req: Request, res: Response) {
  const projects = await getProjects();
  return res.json(projects);
}

export async function pagedProjectsHandler(req: Request, res: Response) {
  const page = await getProjectsPage({
    limit: req.query.limit,
    cursor: req.query.cursor,
  });
  return res.json({
    items: page.items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  });
}

export async function dashboardHandler(req: Request, res: Response) {
  try {
    const payload = await getDashboardData({
      userId: req.user.id,
      limitProjectsToMemberUserId: req.user.id,
    });
    return res.json(payload);
  } catch {
    return res.status(500).json({ error: "Failed to load dashboard data" });
  }
}

export async function analyticsOverviewHandler(req: Request, res: Response) {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) return res.status(400).json({ error: "projectId is required" });
    const payload = await getSummaryOverviewAnalytics(filters);
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to load analytics" });
  }
}

export async function analyticsSprintHandler(req: Request, res: Response) {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) return res.status(400).json({ error: "projectId is required" });
    const payload = await getSummarySprintAnalytics(filters);
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to load analytics" });
  }
}

export async function analyticsFlowHandler(req: Request, res: Response) {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) return res.status(400).json({ error: "projectId is required" });
    const payload = await getSummaryFlowAnalytics(filters);
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to load analytics" });
  }
}

export async function analyticsWorkloadHandler(req: Request, res: Response) {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) return res.status(400).json({ error: "projectId is required" });
    const payload = await getSummaryWorkloadAnalytics(filters);
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to load analytics" });
  }
}

export async function exportReportHandler(req: Request, res: Response) {
  try {
    const filters = summaryFiltersFromQuery(req);
    if (!filters.projectId) return res.status(400).json({ error: "projectId is required" });
    const exported = await buildSummaryReportExport(filters);
    const stamp = new Date().toISOString().slice(0, 10);
    const type = String(filters.type || "overview").toLowerCase();
    const filename = `summary-${type}-${stamp}.${exported.extension}`;
    res.setHeader("Content-Type", exported.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(exported.buffer);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to export report" });
  }
}

export async function usersHandler(_req: Request, res: Response) {
  const users = await getUsers();
  return res.json(users);
}

export async function usersPagedHandler(req: Request, res: Response) {
  const rawIsActive = String(req.query.isActive || "").trim().toLowerCase();
  const isActive =
    rawIsActive === "true" ? true : rawIsActive === "false" ? false : undefined;
  const page = await getUsersPage({
    limit: req.query.limit,
    cursor: req.query.cursor,
    isActive,
  });
  return res.json(page);
}

export async function userGroupsHandler(_req: Request, res: Response) {
  const groups = await getUserGroups();
  return res.json(groups);
}

export async function sprintsHandler(req: Request, res: Response) {
  const sprints = await getSprints({ projectId: req.query.projectId });
  return res.json(sprints);
}

export async function sprintTasksHandler(req: Request, res: Response) {
  const tasks = await getTasks({
    sprintId: req.params.sprintId,
    projectId: req.query.projectId,
    limit: asString(req.query.limit) || "200",
  });
  return res.json(tasks);
}

export async function tasksHandler(req: Request, res: Response) {
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
      limit: asString(req.query.limit) || "200",
    }),
  );
  return res.json(tasks);
}

export async function tasksPagedHandler(req: Request, res: Response) {
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
    { limit: asString(req.query.limit), cursor: asString(req.query.cursor) },
  );
  return res.json(page);
}

export async function backlogHandler(req: Request, res: Response) {
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
      limit: asString(req.query.limit) || "200",
    }),
  );
  return res.json(tasks);
}

export async function backlogPagedHandler(req: Request, res: Response) {
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
    { limit: asString(req.query.limit), cursor: asString(req.query.cursor) },
  );
  return res.json(page);
}

export async function backlogRowsHandler(req: Request, res: Response) {
  try {
    const assigneeFilter = readAssigneeFilter(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : "";
    if (!projectId) return res.status(400).json({ error: "projectId is required" });
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
}

export async function tasksSearchHandler(req: Request, res: Response) {
  const term = asString(req.query.search).trim();
  if (!term) return res.json([]);
  const assigneeFilter = readAssigneeFilter(req);
  const scope = String(req.query.scope || "global").trim().toLowerCase();
  const scopedFilters: Record<string, any> = {
    assigneeId: assigneeFilter.assigneeId,
    assigneeIds: assigneeFilter.assigneeIds,
    status: req.query.status,
    priority: req.query.priority,
    type: req.query.type,
    label: req.query.label,
    search: term,
  };
  if (scope === "board") {
    scopedFilters.projectId = req.query.projectId;
    scopedFilters.activeSprintOnly = true;
  } else if (scope === "backlog") {
    scopedFilters.projectId = req.query.projectId;
    scopedFilters.backlogScope = true;
    scopedFilters.includeSprintId = req.query.includeSprintId;
  } else {
    // Global search intentionally ignores project/sprint constraints.
  }
  const rows = await searchTasks(
    withUserProjectScope(req, scopedFilters),
    {
      limit: asString(req.query.limit),
      cursor: asString(req.query.cursor),
    },
  );
  return res.json(rows);
}
