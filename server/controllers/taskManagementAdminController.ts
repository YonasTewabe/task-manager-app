import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Request, Response } from "express";
import { isNonEmptyString } from "../utils/validation.js";
import { sendEmail } from "../utils/email.js";
import { asObjectRecord, asString, asStringArray } from "../utils/guards.js";
import {
  ACTIVE_SPRINT_CONFLICT_MESSAGE,
  SPRINT_DELETE_NOT_EMPTY_MESSAGE,
  assignTasksToSprint,
  buildBoard,
  completeSprint,
  createProject,
  createSprint,
  createUser,
  createUserGroup,
  deleteProject,
  deleteSprint,
  deleteUser,
  deleteUserGroup,
  disableUser,
  enableUser,
  getDefaultSettings,
  getProjectById,
  getProjectSettings,
  getProjects,
  getSprints,
  getActiveSprintForProject,
  getTaskStatusTotals,
  getTasks,
  getTasksPage,
  getUsers,
  getUserGroups,
  getWorkflowStageKeys,
  logUserAudit,
  projectExists,
  removeTaskFromSprint,
  updateProject,
  updateProjectSettings,
  updateSprint,
  updateUser,
  updateUserGroup,
} from "../services/taskService.js";
import { createAndDispatchNotifications } from "../services/notificationService.js";
import {
  requireProjectManagementAccess,
  requireProjectManagementAccessForSprint,
} from "../middleware/projectManagement.js";

function parseAssigneeIdsQuery(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((value) => String(value || "").trim()).filter(Boolean))];
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
  if (assigneeIds.length > 0) return { assigneeIds, assigneeId: assigneeIds[0] };
  const assigneeId = String(req.query.assigneeId || "").trim();
  return { assigneeId, assigneeIds: assigneeId ? [assigneeId] : [] };
}

function withUserProjectScope(req: Request, filters: any = {}) {
  if (req.user?.role === "admin") return filters;
  return { ...filters, limitProjectsToMemberUserId: req.user.id };
}

function generateTemporaryPassword() {
  return `${crypto.randomBytes(6).toString("base64url")}!aA1`;
}

export async function bootstrapHandler(req: Request, res: Response) {
  const projectId = req.query.projectId ? String(req.query.projectId) : "";
  const includeTasks = String(req.query.includeTasks || "false") === "true";
  const scopedFilters = withUserProjectScope(req, { projectId: projectId || undefined });
  const [users, sprints, tasks, projects, userGroups] = await Promise.all([
    getUsers(),
    getSprints(scopedFilters),
    includeTasks ? getTasks(scopedFilters) : Promise.resolve([]),
    getProjects().then((list) =>
      req.user?.role === "admin"
        ? list
        : list.filter((project) =>
            (project.members || []).some((member) => String(member.id) === String(req.user.id)),
          ),
    ),
    getUserGroups(),
  ]);
  const settings = projectId ? await getProjectSettings(projectId) : getDefaultSettings();
  return res.json({
    currentUser: req.user,
    columns: getWorkflowStageKeys(settings),
    workflowStages: settings.boardCardFields.workflowStages,
    users,
    sprints,
    tasks,
    projects,
    userGroups,
  });
}

export async function boardHandler(req: Request, res: Response) {
  const assigneeFilter = readAssigneeFilter(req);
  const sprintId = req.query.sprintId ? String(req.query.sprintId) : "";
  const projectId = req.query.projectId ? String(req.query.projectId) : "";
  const filters = withUserProjectScope(req, {
    assigneeId: assigneeFilter.assigneeId,
    assigneeIds: assigneeFilter.assigneeIds,
    status: req.query.status,
    priority: req.query.priority,
    type: req.query.type,
    label: req.query.label,
    search: req.query.search,
  });
  const columns = await buildBoard(sprintId || null, projectId || null, filters);
  let totalsByStatus = {};
  if (filters.assigneeId || (Array.isArray(filters.assigneeIds) && filters.assigneeIds.length > 0)) {
    const baseTotals = await getTaskStatusTotals({
      ...filters,
      assigneeId: "",
      assigneeIds: [],
    });
    const settings = projectId ? await getProjectSettings(projectId) : getDefaultSettings();
    const stageKeys = getWorkflowStageKeys(settings);
    stageKeys.forEach((status) => {
      totalsByStatus[status] = Number(baseTotals?.[status] || 0);
    });
  } else {
    columns.forEach((column) => {
      totalsByStatus[column.status] = (column.tasks || []).length;
    });
  }
  return res.json({ columns, totalsByStatus });
}

export async function boardPagedHandler(req: Request, res: Response) {
  const assigneeFilter = readAssigneeFilter(req);
  const sprintIdParam = req.query.sprintId ? String(req.query.sprintId) : "";
  const projectId = req.query.projectId ? String(req.query.projectId) : "";
  const fastMode = String(req.query.fast || "") === "1";
  let sprintId = sprintIdParam;
  let activeSprint = null;
  if (sprintIdParam === "__active__" && projectId) {
    activeSprint = await getActiveSprintForProject(projectId);
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
    limit: asString(req.query.limit),
    cursor: asString(req.query.cursor),
  });
  const settings = projectId ? await getProjectSettings(projectId) : getDefaultSettings();
  const workflowStages = Array.isArray(settings?.boardCardFields?.workflowStages)
    ? settings.boardCardFields.workflowStages
    : [];
  const stageMetaByKey = new Map(
    workflowStages.map((stage: any) => [String(stage?.key || ""), stage]),
  );
  const stages = getWorkflowStageKeys(settings);
  const pageByStatus = new Map();
  page.items.forEach((task) => {
    const key = String(task.status || "");
    const bucket = pageByStatus.get(key) || [];
    bucket.push(task);
    pageByStatus.set(key, bucket);
  });
  const pagedColumns = stages.map((stageKey) => {
    const stageMeta: any = stageMetaByKey.get(stageKey);
    return {
      status: stageKey,
      name: stageMeta?.name || stageKey,
      description: stageMeta?.description || "",
      badge: stageMeta?.badge || "",
      counterGroup: stageMeta?.counterGroup || "upcoming",
      tasks: pageByStatus.get(stageKey) || [],
    };
  });
  const totalsByStatus = fastMode ? null : await getTaskStatusTotals(filters);
  return res.json({
    columns: pagedColumns,
    totalsByStatus,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    activeSprintId: activeSprint ? String(activeSprint.id) : "",
    activeSprintName: activeSprint ? String(activeSprint.name || "") : "",
  });
}

export async function createProjectHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  if (!isNonEmptyString(body.name) || !isNonEmptyString(body.projectKey)) {
    return res.status(400).json({ error: "name and projectKey are required" });
  }
  try {
    const project = await createProject({
      name: asString(body.name).trim(),
      projectKey: asString(body.projectKey).trim().toUpperCase(),
      description: asString(body.description),
      memberIds: asStringArray(body.memberIds),
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
      metadata: { project_id: project.id, target_view: "board" },
      dedupeKey: `project-created-membership:${project.id}`,
    });
    return res.status(201).json(project);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Project key already exists" });
    return res.status(500).json({ error: "Failed to create project" });
  }
}

export async function patchProjectHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  if (!(await requireProjectManagementAccess(req, res, req.params.projectId))) return;
  const patch: Record<string, any> = {};
  if (body.name !== undefined) patch.name = asString(body.name).trim();
  if (body.projectKey !== undefined) patch.projectKey = asString(body.projectKey).trim().toUpperCase();
  if (body.description !== undefined) patch.description = asString(body.description);
  if (body.memberIds !== undefined) patch.memberIds = asStringArray(body.memberIds);
  if (body.projectAdminMemberIds !== undefined) patch.projectAdminMemberIds = asStringArray(body.projectAdminMemberIds);
  try {
    const beforeProject = await getProjectById(req.params.projectId);
    const project = await updateProject(req.params.projectId, patch);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (patch.memberIds !== undefined && beforeProject) {
      const beforeMemberIds = new Set((beforeProject.members || []).map((m) => String(m.id)));
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
          metadata: { project_id: project.id, target_view: "board" },
        });
      }
    }
    return res.json(project);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Project key already exists" });
    return res.status(500).json({ error: "Failed to update project" });
  }
}

export async function deleteProjectHandler(req: Request, res: Response) {
  if (!(await requireProjectManagementAccess(req, res, req.params.projectId))) return;
  const deleted = await deleteProject(req.params.projectId);
  if (!deleted) return res.status(404).json({ error: "Project not found" });
  return res.status(204).send();
}

export async function projectSettingsHandler(req: Request, res: Response) {
  if (!(await projectExists(req.params.projectId))) return res.status(404).json({ error: "Project not found" });
  const settings = await getProjectSettings(req.params.projectId);
  return res.json(settings);
}

export async function patchProjectSettingsHandler(req: Request, res: Response) {
  if (!(await projectExists(req.params.projectId))) return res.status(404).json({ error: "Project not found" });
  if (!(await requireProjectManagementAccess(req, res, req.params.projectId))) return;
  try {
    await updateProjectSettings(req.params.projectId, asObjectRecord(req.body));
    const settings = await getProjectSettings(req.params.projectId);
    return res.json(settings);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid settings" });
  }
}

export async function createUserGroupHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  if (!isNonEmptyString(body.name)) return res.status(400).json({ error: "name is required" });
  try {
    const group = await createUserGroup({
      name: asString(body.name),
      memberIds: asStringArray(body.memberIds),
    });
    return res.status(201).json(group);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Group name already exists" });
    return res.status(500).json({ error: "Failed to create group" });
  }
}

export async function patchUserGroupHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  try {
    const group = await updateUserGroup(req.params.groupId, {
      ...(body.name !== undefined ? { name: asString(body.name) } : {}),
      ...(body.memberIds !== undefined
        ? { memberIds: asStringArray(body.memberIds) }
        : {}),
    });
    if (!group) return res.status(404).json({ error: "Group not found" });
    return res.json(group);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Group name already exists" });
    return res.status(500).json({ error: "Failed to update group" });
  }
}

export async function deleteUserGroupHandler(req: Request, res: Response) {
  const deleted = await deleteUserGroup(req.params.groupId);
  if (!deleted) return res.status(404).json({ error: "Group not found" });
  return res.status(204).send();
}

export async function createUserHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  const email = body.email;
  if (!email) return res.status(400).json({ error: "email is required" });
  const temporaryPassword = isNonEmptyString(body.password)
    ? asString(body.password)
    : generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const generatedName = `New User (${normalizedEmail.split("@")[0] || "member"})`;
  try {
    const created = await createUser({
      name: generatedName,
      email: normalizedEmail,
      passwordHash,
      role: asString(body.role || "member"),
      mustChangePassword: true,
    });
    const frontendUrl = String(process.env.FRONTEND_URL).trim().replace(/\/+$/, "");
    const requestBaseUrl = `${req.protocol}://${req.get("host")}`.replace(/\/+$/, "");
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
        `Regards,\nTask Manager Team`,
      html:
        `Hello,<br/><br/>` +
        `This email was sent from the Task Manager app.<br/><br/>` +
        `Your Task Manager account has been successfully created.<br/><br/>` +
        `Account details:<br/>` +
        `- Email: ${created.email}<br/>` +
        `- Temporary password: ${temporaryPassword}<br/>` +
        `- Login URL: ${loginUrl}<br/><br/>` +
        `For security, you will be prompted to set your display name and change your password on first sign-in.<br/><br/>` +
        `If you did not expect this email, please contact your administrator.<br/><br/>` +
        `Regards,<br/>Task Manager Team`,
    });
    await logUserAudit({
      actorUserId: req.user.id,
      targetUserId: created.id,
      action: "user_created",
      metadata: { role: created.role },
    }).catch(() => {});
    return res.status(201).json(created);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Email already exists" });
    return res.status(500).json({ error: "Failed to create user" });
  }
}

export async function patchUserHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  const payload: Record<string, any> = {};
  if (isNonEmptyString(body.name)) payload.name = asString(body.name).trim();
  if (isNonEmptyString(body.email)) payload.email = asString(body.email).trim().toLowerCase();
  if (isNonEmptyString(body.role)) payload.role = asString(body.role);
  if (isNonEmptyString(body.password)) {
    payload.passwordHash = await bcrypt.hash(asString(body.password), 12);
    payload.mustChangePassword = true;
    payload.passwordChangedAt = null;
  }
  const updated = await updateUser(req.params.userId, payload);
  if (!updated) return res.status(404).json({ error: "User not found or no valid fields to update" });
  await logUserAudit({
    actorUserId: req.user.id,
    targetUserId: updated.id,
    action: "user_updated",
    metadata: { updatedFields: Object.keys(payload) },
  }).catch(() => {});
  return res.json(updated);
}

export async function disableUserHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  const targetUserId = String(req.params.userId);
  if (targetUserId === String(req.user.id)) {
    return res.status(400).json({ error: "You cannot disable your own account" });
  }
  const disabled = await disableUser(targetUserId, req.user.id, asString(body.reason));
  if (!disabled) return res.status(404).json({ error: "User not found" });
  await logUserAudit({
    actorUserId: req.user.id,
    targetUserId: disabled.id,
    action: "user_disabled",
    metadata: { reason: asString(body.reason).trim() },
  }).catch(() => {});
  return res.json(disabled);
}

export async function enableUserHandler(req: Request, res: Response) {
  const enabled = await enableUser(String(req.params.userId));
  if (!enabled) return res.status(404).json({ error: "User not found" });
  await logUserAudit({
    actorUserId: req.user.id,
    targetUserId: enabled.id,
    action: "user_enabled",
  }).catch(() => {});
  return res.json(enabled);
}

export async function deleteUserHandler(req: Request, res: Response) {
  const targetUserId = String(req.params.userId);
  if (targetUserId === String(req.user.id)) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  const deleted = await deleteUser(targetUserId);
  if (!deleted) return res.status(404).json({ error: "User not found" });
  return res.status(204).send();
}

export async function createSprintHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  const name = asString(body.name);
  const projectId = asString(body.projectId);
  if (!name || !projectId) return res.status(400).json({ error: "name and projectId are required" });
  if (!(await requireProjectManagementAccess(req, res, projectId))) return;
  try {
    const sprint = await createSprint({
      name: asString(body.name),
      projectId: asString(body.projectId),
      startDate: body.startDate,
      endDate: body.endDate,
      status: asString(body.status || "planned"),
    });
    return res.status(201).json(sprint);
  } catch (error) {
    if (error.message === ACTIVE_SPRINT_CONFLICT_MESSAGE) return res.status(409).json({ error: error.message });
    return res.status(400).json({ error: error.message || "Failed to create sprint" });
  }
}

export async function patchSprintHandler(req: Request, res: Response) {
  if (!(await requireProjectManagementAccessForSprint(req, res, req.params.sprintId))) return;
  try {
    const sprint = await updateSprint(req.params.sprintId, asObjectRecord(req.body));
    if (!sprint) return res.status(404).json({ error: "Sprint not found or no fields to update" });
    return res.json(sprint);
  } catch (error) {
    if (error.message === ACTIVE_SPRINT_CONFLICT_MESSAGE) return res.status(409).json({ error: error.message });
    return res.status(400).json({ error: error.message || "Failed to update sprint" });
  }
}

export async function startSprintHandler(req: Request, res: Response) {
  if (!(await requireProjectManagementAccessForSprint(req, res, req.params.sprintId))) return;
  try {
    const sprint = await updateSprint(req.params.sprintId, { status: "active" });
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });
    return res.json(sprint);
  } catch (error) {
    if (error.message === ACTIVE_SPRINT_CONFLICT_MESSAGE) return res.status(409).json({ error: error.message });
    return res.status(400).json({ error: error.message || "Failed to start sprint" });
  }
}

export async function completeSprintHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  if (!(await requireProjectManagementAccessForSprint(req, res, req.params.sprintId))) return;
  try {
    const sprint = await completeSprint(
      req.params.sprintId,
      asString(body.moveIncompleteToSprintId) || null,
    );
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });
    return res.json(sprint);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to complete sprint" });
  }
}

export async function assignSprintTasksHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  if (!(await requireProjectManagementAccessForSprint(req, res, req.params.sprintId))) return;
  const sprintId = String(req.params.sprintId);
  const taskIds = asStringArray(body.taskIds);
  if (!taskIds.length) return res.status(400).json({ error: "taskIds is required" });
  const updatedTasks = await assignTasksToSprint(taskIds, sprintId);
  return res.json({ updatedTasks });
}

export async function removeSprintTaskHandler(req: Request, res: Response) {
  if (!(await requireProjectManagementAccessForSprint(req, res, req.params.sprintId))) return;
  const removed = await removeTaskFromSprint(String(req.params.taskId), String(req.params.sprintId));
  if (!removed) return res.status(404).json({ error: "Task not found in sprint" });
  return res.json(removed);
}

export async function deleteSprintHandler(req: Request, res: Response) {
  if (!(await requireProjectManagementAccessForSprint(req, res, req.params.sprintId))) return;
  try {
    const deleted = await deleteSprint(req.params.sprintId);
    if (!deleted) return res.status(404).json({ error: "Sprint not found" });
    return res.status(204).send();
  } catch (error) {
    if (error.message === SPRINT_DELETE_NOT_EMPTY_MESSAGE) return res.status(409).json({ error: error.message });
    return res.status(400).json({ error: error.message || "Failed to delete sprint" });
  }
}
