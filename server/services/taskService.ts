import { DEFAULT_WORK_TYPE_VALUES } from "../../src/constants/workTypes.js";
import { PRIORITY_OPTIONS } from "../../src/constants/priorities.js";
import { prisma } from "../db/prisma.js";
import { asInt } from "../utils/validation.js";
import { asObjectRecord } from "../utils/guards.js";
import { createAndDispatchNotifications } from "./notificationService.js";
import {
  createProject,
  deleteProject,
  getProjectById,
  getProjectSettings,
  getProjects,
  getProjectsPage,
  getSprintProjectId,
  projectExists,
  updateProject,
  updateProjectSettings,
  userCanManageProject,
} from "./taskProjectsService.js";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  createUser,
  createUserGroup,
  deleteUser,
  deleteUserGroup,
  disableUser,
  enableUser,
  findUserAuthByEmail,
  getPasswordResetToken,
  getUserAuthById,
  getUserGroups,
  getUsers,
  getUsersPage,
  invalidatePasswordResetTokensForUser,
  logUserAudit,
  updateUser,
  updateUserGroup,
} from "./taskUsersService.js";
import {
  getActiveSprintForProject,
  getSprints,
} from "./taskSprintsReadService.js";
import {
  assignTaskToSprint,
  assignTasksToSprint,
  completeSprint,
  createSprint,
  deleteSprint,
  removeTaskFromSprint,
  updateSprint,
} from "./taskSprintsWriteService.js";
import { canUserMoveTask } from "./taskWorkflowPermissionsService.js";
import {
  buildSummaryReportExportWithDeps,
  getSummaryFlowAnalyticsWithDeps,
  getSummaryOverviewAnalyticsWithDeps,
  getSummarySprintAnalyticsWithDeps,
  getSummaryWorkloadAnalyticsWithDeps,
} from "./taskAnalyticsService.js";
import {
  getBacklogRowsWithDeps,
  getDashboardDataWithDeps,
} from "./taskDashboardService.js";
import {
  asUuid,
  decodeCursor,
  encodeCursor,
  normalizeMemberIds,
} from "./taskServiceCoreUtils.js";
import {
  DEFAULT_WORKFLOW_STAGES,
  STATUS_COLUMNS,
  getWorkflowStageKeys,
  isValidWorkflowStatus,
  normalizeWorkflowStages,
  validateWorkflowStagesForSave,
} from "./workflowStages.js";
export { getDefaultSettings } from "./taskSettingsUtils.js";
export {
  DEFAULT_WORKFLOW_STAGES,
  STATUS_COLUMNS,
  normalizeWorkflowStages,
  validateWorkflowStagesForSave,
  getWorkflowStageKeys,
  isValidWorkflowStatus,
};
export {
  consumePasswordResetToken,
  createPasswordResetToken,
  createUser,
  createUserGroup,
  deleteUser,
  deleteUserGroup,
  disableUser,
  enableUser,
  findUserAuthByEmail,
  getPasswordResetToken,
  getUserAuthById,
  getUserGroups,
  getUsers,
  getUsersPage,
  invalidatePasswordResetTokensForUser,
  logUserAudit,
  updateUser,
  updateUserGroup,
};
export { getActiveSprintForProject, getSprints };

export const SPRINT_STATUSES = ["planned", "active", "completed"];
export const ACTIVE_SPRINT_CONFLICT_MESSAGE =
  "Please complete the active sprint before starting a new one";
export const SPRINT_DELETE_NOT_EMPTY_MESSAGE =
  "Only empty sprints can be deleted";
export const PROJECT_NAME_CONFLICT_MESSAGE =
  "A project with this name already exists.";
export const PROJECT_KEY_CONFLICT_MESSAGE =
  "A project with this short code already exists.";
export const SPRINT_NAME_CONFLICT_MESSAGE =
  "A sprint with this name already exists in this project.";

type TaskQueryFilters = {
  sprintId?: unknown;
  projectId?: unknown;
  projectIds?: unknown;
  status?: unknown;
  assigneeId?: unknown;
  assigneeIds?: unknown;
  limitProjectsToMemberUserId?: unknown;
  priority?: unknown;
  type?: unknown;
  label?: unknown;
  search?: unknown;
  activeSprintOnly?: unknown;
  backlogScope?: unknown;
  includeSprintId?: unknown;
  limit?: unknown;
};

type CursorOptions = {
  includeCursor?: boolean;
  cursor?: string;
};

type SummaryFilters = {
  projectId?: unknown;
  from?: unknown;
  to?: unknown;
  limitProjectsToMemberUserId?: unknown;
  interval?: unknown;
  type?: unknown;
};

export {
  createProject,
  deleteProject,
  getProjectById,
  getProjectSettings,
  getProjects,
  getProjectsPage,
  getSprintProjectId,
  projectExists,
  updateProject,
  updateProjectSettings,
  userCanManageProject,
};
export { canUserMoveTask };
export {
  assignTaskToSprint,
  assignTasksToSprint,
  completeSprint,
  createSprint,
  deleteSprint,
  removeTaskFromSprint,
  updateSprint,
};

function mapTaskRow(row) {
  const taskNumber = row.taskNumber != null ? Number(row.taskNumber) : null;
  const projectKey = row.projectKey ? String(row.projectKey) : null;
  const taskKey =
    projectKey && taskNumber != null && !Number.isNaN(taskNumber)
      ? `${projectKey}-${taskNumber}`
      : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    acceptanceCriteria: Array.isArray(row.acceptanceCriteria)
      ? row.acceptanceCriteria
      : [],
    label: row.label || "",
    version: row.version || "",
    type: row.type,
    priority: row.priority,
    status: row.status,
    storyPoints: row.storyPoints,
    dueDate: row.dueDate,
    assigneeId: row.assigneeId,
    sprintId: row.sprintId,
    projectId: row.projectId,
    taskNumber,
    taskKey,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    rowVersion:
      row.rowVersion != null && Number.isFinite(Number(row.rowVersion))
        ? Number(row.rowVersion)
        : undefined,
  };
}

function normalizeAcceptanceCriteria(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const text = String(item?.text || "").trim();
      if (!text) return null;
      return {
        id:
          String(item?.id || "").trim() ||
          `ac-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        done: item?.done === true,
      };
    })
    .filter(Boolean);
}

function normalizeTaskPriority(value) {
  return String(value || "medium")
    .trim()
    .toLowerCase();
}

function normalizeTaskType(value) {
  return String(value || "task")
    .trim()
    .toLowerCase();
}

function normalizeTaskStatus(value) {
  return String(value || "todo").trim();
}

function normalizeAssigneeFilterValues(filters: TaskQueryFilters = {}) {
  const filterObj = asObjectRecord(filters);
  const explicit = Array.isArray(filterObj.assigneeIds)
    ? filterObj.assigneeIds
    : [];
  const legacy =
    filterObj.assigneeId != null && String(filterObj.assigneeId).trim() !== ""
      ? [filterObj.assigneeId]
      : [];
  return [
    ...new Set(
      [...explicit, ...legacy]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

function buildTaskPrismaWhere(
  filters: TaskQueryFilters = {},
  { includeCursor = false, cursor = "" }: CursorOptions = {},
) {
  const filterObj = asObjectRecord(filters);
  const where: Record<string, any> = {};
  const and: any[] = [];
  if (filterObj.sprintId === "backlog") {
    where.sprintId = null;
  } else if (filterObj.sprintId != null) {
    where.sprintId = asUuid(filterObj.sprintId, null);
  }
  if (filterObj.projectId) where.projectId = asUuid(filterObj.projectId, null);
  const projectIds = Array.isArray(filterObj.projectIds)
    ? [
        ...new Set(
          filterObj.projectIds
            .map((value) => asUuid(value, null))
            .filter(Boolean),
        ),
      ]
    : [];
  if (!where.projectId && projectIds.length > 0) {
    where.projectId = { in: projectIds };
  }
  if (filterObj.status) where.status = String(filterObj.status);
  const assigneeFilters = normalizeAssigneeFilterValues(filterObj);
  if (assigneeFilters.length > 0) {
    const includeUnassigned = assigneeFilters.includes("unassigned");
    const assignedIds = assigneeFilters
      .filter((value) => value !== "unassigned")
      .map((value) => asUuid(value, null))
      .filter(Boolean);
    if (includeUnassigned && assignedIds.length > 0) {
      and.push({
        OR: [{ assigneeId: null }, { assigneeId: { in: assignedIds } }],
      });
    } else if (includeUnassigned) {
      where.assigneeId = null;
    } else if (assignedIds.length > 0) {
      where.assigneeId = { in: assignedIds };
    }
  }
  if (filterObj.limitProjectsToMemberUserId) {
    and.push({
      project: {
        members: {
          some: { userId: asUuid(filterObj.limitProjectsToMemberUserId) },
        },
      },
    });
  }
  if (filterObj.priority) where.priority = String(filterObj.priority);
  if (filterObj.type) where.type = String(filterObj.type).trim().toLowerCase();
  if (filterObj.label)
    where.label = {
      equals: String(filterObj.label).trim(),
      mode: "insensitive",
    };
  if (filterObj.search) {
    const search = String(filterObj.search).trim();
    const compactSearch = search.replace(/\s+/g, "");
    const numericOnlyMatch = compactSearch.match(/^\d+$/);
    const plainKeyMatch = compactSearch.match(/^([A-Za-z0-9][A-Za-z0-9]*)$/);
    const keyMatch = compactSearch.match(/^([A-Za-z0-9][A-Za-z0-9]*)-(\d+)$/);
    const keyPrefixMatch = compactSearch.match(
      /^([A-Za-z0-9][A-Za-z0-9]*)-(\d*)$/,
    );
    const keyPrefixRanges: Array<{ gte: number; lte: number }> = [];
    if (keyPrefixMatch && keyPrefixMatch[2]) {
      const numericPrefixText = String(keyPrefixMatch[2]);
      const numericPrefix = Number(numericPrefixText);
      if (Number.isFinite(numericPrefix) && numericPrefix >= 0) {
        const maxDigits = 9;
        const prefixDigits = numericPrefixText.length;
        for (
          let extraDigits = 0;
          extraDigits <= Math.max(0, maxDigits - prefixDigits);
          extraDigits += 1
        ) {
          const scale = Math.pow(10, extraDigits);
          const start = numericPrefix * scale;
          const end = extraDigits === 0 ? start : start + scale - 1;
          keyPrefixRanges.push({ gte: start, lte: end });
        }
      }
    }
    const numericPrefixRanges: Array<{ gte: number; lte: number }> = [];
    if (numericOnlyMatch) {
      const numericPrefixText = compactSearch;
      const numericPrefix = Number(numericPrefixText);
      if (Number.isFinite(numericPrefix) && numericPrefix >= 0) {
        const maxDigits = 9;
        const prefixDigits = numericPrefixText.length;
        for (
          let extraDigits = 0;
          extraDigits <= Math.max(0, maxDigits - prefixDigits);
          extraDigits += 1
        ) {
          const scale = Math.pow(10, extraDigits);
          const start = numericPrefix * scale;
          const end = extraDigits === 0 ? start : start + scale - 1;
          numericPrefixRanges.push({ gte: start, lte: end });
        }
      }
    }
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        ...(numericPrefixRanges.length > 0
          ? numericPrefixRanges.map((range) => ({
              taskNumber: range,
            }))
          : []),
        ...(plainKeyMatch
          ? [
              {
                project: {
                  is: {
                    projectKey: {
                      startsWith: plainKeyMatch[1],
                      mode: "insensitive",
                    },
                  },
                },
              },
            ]
          : []),
        ...(keyPrefixMatch
          ? [
              {
                project: {
                  is: {
                    projectKey: {
                      equals: keyPrefixMatch[1],
                      mode: "insensitive",
                    },
                  },
                },
              },
            ]
          : []),
        ...(keyMatch
          ? [
              {
                project: {
                  is: {
                    projectKey: { equals: keyMatch[1], mode: "insensitive" },
                  },
                },
                taskNumber: Number(keyMatch[2]),
              },
            ]
          : []),
        ...(keyPrefixMatch && keyPrefixRanges.length > 0
          ? keyPrefixRanges.map((range) => ({
              project: {
                is: {
                  projectKey: {
                    equals: keyPrefixMatch[1],
                    mode: "insensitive",
                  },
                },
              },
              taskNumber: range,
            }))
          : []),
      ],
    });
  }
  if (filterObj.activeSprintOnly === true) {
    and.push({
      sprint: { status: "active" },
    });
  }
  if (filterObj.backlogScope === true) {
    const includeSprintId = asUuid(filterObj.includeSprintId, null);
    and.push({
      OR: [
        { sprintId: null },
        {
          sprint: {
            OR: [
              { status: { in: ["active", "planned"] } },
              ...(includeSprintId ? [{ id: includeSprintId }] : []),
            ],
          },
        },
      ],
    });
  }
  if (includeCursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.updatedAt && decoded?.id) {
      and.push({
        OR: [
          { updatedAt: { lt: new Date(decoded.updatedAt) } },
          {
            AND: [
              { updatedAt: { equals: new Date(decoded.updatedAt) } },
              { id: { lt: String(decoded.id) } },
            ],
          },
        ],
      });
    }
  }
  if (and.length) where.AND = and;
  return where;
}

export async function getTasks(filters: TaskQueryFilters = {}) {
  const filterObj = asObjectRecord(filters);
  const rawLimit = Number(filterObj.limit);
  const pageSize = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(rawLimit, 500))
    : 200;
  const rows = await prisma.task.findMany({
    where: buildTaskPrismaWhere(filterObj),
    select: {
      id: true,
      title: true,
      description: true,
      acceptanceCriteria: true,
      label: true,
      versionLabel: true,
      type: true,
      priority: true,
      status: true,
      storyPoints: true,
      dueDate: true,
      assigneeId: true,
      sprintId: true,
      projectId: true,
      taskNumber: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      rowVersion: true,
      project: { select: { projectKey: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: pageSize,
  });
  return rows.map((row) =>
    mapTaskRow({
      ...row,
      projectKey: row.project?.projectKey || "",
      version: row.versionLabel,
    }),
  );
}

export async function getTasksPage(
  filters: TaskQueryFilters = {},
  {
    limit = 50,
    cursor = "",
  }: { limit?: number | string; cursor?: string } = {},
) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = await prisma.task.findMany({
    where: buildTaskPrismaWhere(filters, { includeCursor: true, cursor }),
    select: {
      id: true,
      title: true,
      description: true,
      acceptanceCriteria: true,
      label: true,
      versionLabel: true,
      type: true,
      priority: true,
      status: true,
      storyPoints: true,
      dueDate: true,
      assigneeId: true,
      sprintId: true,
      projectId: true,
      taskNumber: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      rowVersion: true,
      project: { select: { projectKey: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const items = (hasMore ? rows.slice(0, pageSize) : rows).map((row) =>
    mapTaskRow({
      ...row,
      projectKey: row.project?.projectKey || "",
      version: row.versionLabel,
    }),
  );
  const tail = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore
      ? encodeCursor({ updatedAt: tail?.updatedAt, id: tail?.id })
      : "",
    hasMore,
  };
}

export async function getTaskStatusTotals(filters: TaskQueryFilters = {}) {
  const result = await prisma.task.groupBy({
    by: ["status"],
    where: buildTaskPrismaWhere(filters),
    _count: { _all: true },
  });
  const totals = {};
  result.forEach((row) => {
    totals[String(row.status || "")] = Number(row._count?._all || 0);
  });
  return totals;
}

export async function searchTasks(
  filters: TaskQueryFilters = {},
  { limit = 20, cursor = "" }: { limit?: number | string; cursor?: string } = {},
) {
  const rawLimit = Number(limit);
  const pageSize = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(rawLimit, 100))
    : 20;
  const rows = await prisma.task.findMany({
    where: buildTaskPrismaWhere(filters, { includeCursor: true, cursor }),
    select: {
      id: true,
      title: true,
      projectId: true,
      taskNumber: true,
      project: { select: { projectKey: true } },
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const items = (hasMore ? rows.slice(0, pageSize) : rows).map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    taskNumber: row.taskNumber,
    taskKey:
      row.project?.projectKey && row.taskNumber != null
        ? `${row.project.projectKey}-${row.taskNumber}`
        : null,
  }));
  const tail = hasMore ? rows[pageSize - 1] : null;
  return {
    items,
    nextCursor:
      hasMore && tail
        ? encodeCursor({ updatedAt: tail.updatedAt, id: tail.id })
        : "",
    hasMore,
  };
}

export async function getTaskById(id) {
  const task = await prisma.task.findUnique({
    where: { id: asUuid(id) },
    include: {
      project: {
        select: { projectKey: true },
      },
    },
  });
  if (!task) return null;
  return mapTaskRow({
    ...task,
    projectKey: task.project?.projectKey || "",
    version: task.versionLabel,
  });
}

async function allocateNextTaskNumber(projectId, tx = prisma) {
  const pid = asUuid(projectId, null);
  if (!pid) throw new Error("projectId is required");
  const latestTask = await tx.task.findFirst({
    where: { projectId: pid },
    select: { taskNumber: true },
    orderBy: [{ taskNumber: "desc" }],
  });
  return Number(latestTask?.taskNumber || 0) + 1;
}

export async function createTask(payload, createdBy) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const taskNumber = await allocateNextTaskNumber(
            payload.projectId,
            tx,
          );
          return tx.task.create({
            data: {
              title: payload.title,
              description: payload.description || "",
              acceptanceCriteria: normalizeAcceptanceCriteria(
                payload.acceptanceCriteria,
              ),
              label: payload.label || "",
              versionLabel: payload.version || "",
              type: normalizeTaskType(payload.type),
              priority: normalizeTaskPriority(payload.priority),
              status: normalizeTaskStatus(payload.status),
              storyPoints: asInt(payload.storyPoints, null),
              dueDate: payload.dueDate ? String(payload.dueDate) : null,
              assigneeId: asUuid(payload.assigneeId),
              sprintId: asUuid(payload.sprintId),
              projectId: asUuid(payload.projectId),
              createdBy: asUuid(createdBy),
              taskNumber,
            },
            include: {
              project: {
                select: { projectKey: true },
              },
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
      return mapTaskRow({
        ...created,
        projectKey: created.project?.projectKey || "",
        version: created.versionLabel,
      });
    } catch (error) {
      if (error?.code === "P2002" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Unable to create task after retries");
}

export async function updateTask(taskId, patch) {
  const patchObj = asObjectRecord(patch);
  const existing = await getTaskById(taskId);
  if (!existing) return null;
  const expectedUpdatedAt = String(patchObj.expectedUpdatedAt || "").trim();
  const expectedRowVersion = Number.isFinite(
    Number(patchObj.expectedRowVersion),
  )
    ? Number(patchObj.expectedRowVersion)
    : null;
  if (expectedUpdatedAt) {
    const expectedTs = Date.parse(expectedUpdatedAt);
    const actualTs = Date.parse(String(existing.updatedAt || ""));
    if (
      Number.isFinite(expectedTs) &&
      Number.isFinite(actualTs) &&
      expectedTs !== actualTs
    ) {
      const conflictError = new Error(
        "Task was updated by another request. Please refresh and try again.",
      );
      (conflictError as any).code = "TASK_CONFLICT";
      throw conflictError;
    }
  }

  if (patchObj.status !== undefined) {
    const settings = await getProjectSettings(existing.projectId);
    if (
      !isValidWorkflowStatus(normalizeTaskStatus(patchObj.status), settings)
    ) {
      return null;
    }
  }

  let allocatedTaskNumber = null;
  if (patchObj.projectId !== undefined) {
    if (
      String(asUuid(patchObj.projectId)) !== String(asUuid(existing.projectId))
    ) {
      allocatedTaskNumber = await allocateNextTaskNumber(patchObj.projectId);
    }
  }

  const data: Record<string, any> = {};
  const normalizeDateOnly = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    return raw.includes("T") ? raw.split("T")[0] : raw;
  };
  const normalizeUuidString = (value) => String(asUuid(value, null) || "");
  const existingAcceptanceJson = JSON.stringify(
    normalizeAcceptanceCriteria(existing.acceptanceCriteria),
  );
  for (const key of [
    "title",
    "description",
    "acceptanceCriteria",
    "label",
    "version",
    "type",
    "priority",
    "status",
    "storyPoints",
    "dueDate",
    "assigneeId",
    "sprintId",
    "projectId",
  ]) {
    if (patchObj[key] === undefined) continue;
    let nextValue;
    let isChanged = true;
    if (key === "storyPoints") {
      nextValue = asInt(patchObj[key], null);
      isChanged = nextValue !== asInt(existing.storyPoints, null);
    } else if (key === "acceptanceCriteria") {
      nextValue = JSON.stringify(normalizeAcceptanceCriteria(patchObj[key]));
      isChanged = nextValue !== existingAcceptanceJson;
    } else if (key === "priority") {
      nextValue = normalizeTaskPriority(patchObj[key]);
      isChanged = nextValue !== normalizeTaskPriority(existing.priority);
    } else if (key === "type") {
      nextValue = normalizeTaskType(patchObj[key]);
      isChanged = nextValue !== normalizeTaskType(existing.type);
    } else if (key === "status") {
      nextValue = normalizeTaskStatus(patchObj[key]);
      isChanged = nextValue !== normalizeTaskStatus(existing.status);
    } else if (key === "dueDate") {
      nextValue = patchObj[key] ? String(patchObj[key]) : null;
      isChanged =
        normalizeDateOnly(nextValue) !== normalizeDateOnly(existing.dueDate);
    } else if (
      key === "assigneeId" ||
      key === "sprintId" ||
      key === "projectId"
    ) {
      nextValue = asUuid(patchObj[key], null);
      isChanged =
        normalizeUuidString(nextValue) !== normalizeUuidString(existing[key]);
    } else {
      nextValue = patchObj[key];
      isChanged = String(nextValue ?? "") !== String(existing[key] ?? "");
    }
    if (!isChanged) continue;
    if (key === "acceptanceCriteria") {
      data.acceptanceCriteria = JSON.parse(nextValue);
    } else if (key === "version") {
      data.versionLabel = nextValue;
    } else if (key === "storyPoints") {
      data.storyPoints = nextValue;
    } else if (key === "dueDate") {
      data.dueDate = nextValue;
    } else if (key === "assigneeId") {
      data.assigneeId = nextValue;
    } else if (key === "sprintId") {
      data.sprintId = nextValue;
    } else if (key === "projectId") {
      data.projectId = nextValue;
    } else {
      data[key] = nextValue;
    }
  }
  if (allocatedTaskNumber != null) {
    data.taskNumber = allocatedTaskNumber;
  }
  if (Object.keys(data).length === 0) return existing;
  const where: Record<string, any> = { id: asUuid(taskId) };
  if (expectedUpdatedAt) {
    where.updatedAt = new Date(expectedUpdatedAt);
  }
  if (expectedRowVersion != null) {
    where.rowVersion = expectedRowVersion;
  }
  const updatedCount = await prisma.task.updateMany({
    where,
    data: {
      ...data,
      rowVersion: { increment: 1 },
    },
  });
  if (
    !updatedCount.count &&
    (expectedUpdatedAt || expectedRowVersion != null)
  ) {
    const conflictError = new Error(
      "Task was updated by another request. Please refresh and try again.",
    );
    (conflictError as any).code = "TASK_CONFLICT";
    throw conflictError;
  }
  const updated = await prisma.task.findUnique({
    where: { id: asUuid(taskId) },
    include: { project: { select: { projectKey: true } } },
  });
  if (!updated) return null;
  return mapTaskRow({
    ...updated,
    projectKey: updated.project?.projectKey || "",
    version: updated.versionLabel,
  });
}

export async function deleteTask(taskId) {
  const result = await prisma.task.deleteMany({
    where: { id: asUuid(taskId) },
  });
  return result.count > 0;
}

export async function getTaskComments(taskId) {
  const rows = await prisma.taskComment.findMany({
    where: { taskId: asUuid(taskId) },
    include: {
      user: {
        select: { name: true },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    userId: row.userId,
    body: row.body,
    createdAt: row.createdAt,
    userName: row.user?.name || "",
  }));
}

export async function addTaskComment(taskId, userId, body) {
  const task = await prisma.task.findUnique({
    where: { id: asUuid(taskId) },
    select: { id: true },
  });
  if (!task) return null;
  const row = await prisma.taskComment.create({
    data: {
      taskId: asUuid(taskId),
      userId: asUuid(userId, null),
      body: String(body || ""),
    },
    select: {
      id: true,
      taskId: true,
      userId: true,
      body: true,
      createdAt: true,
    },
  });
  return row;
}

export async function updateTaskComment(taskId, commentId, userId, body) {
  const result = await prisma.taskComment.updateMany({
    where: {
      id: asUuid(commentId),
      taskId: asUuid(taskId),
      userId: asUuid(userId),
    },
    data: { body: String(body || "") },
  });
  if (result.count === 0) return null;
  const row = await prisma.taskComment.findUnique({
    where: { id: asUuid(commentId) },
    select: {
      id: true,
      taskId: true,
      userId: true,
      body: true,
      createdAt: true,
    },
  });
  return row || null;
}

export async function deleteTaskComment(taskId, commentId, userId) {
  const result = await prisma.taskComment.deleteMany({
    where: {
      id: asUuid(commentId),
      taskId: asUuid(taskId),
      userId: asUuid(userId),
    },
  });
  return result.count > 0;
}

export async function addTaskActivity(
  taskId,
  userId,
  action,
  meta: unknown = {},
) {
  const task = await prisma.task.findUnique({
    where: { id: asUuid(taskId) },
    select: { id: true },
  });
  if (!task) return;
  await prisma.taskActivity.create({
    data: {
      taskId: asUuid(taskId),
      userId: asUuid(userId, null),
      action: String(action || ""),
      meta: asObjectRecord(meta),
    },
  });
}

export async function getTaskActivity(taskId) {
  const rows = await prisma.taskActivity.findMany({
    where: { taskId: asUuid(taskId) },
    include: {
      user: {
        select: { name: true },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    userId: row.userId,
    action: row.action,
    meta: row.meta,
    createdAt: row.createdAt,
    userName: row.user?.name || "",
  }));
}

export async function getTaskLinkedDev(taskId) {
  const task = await prisma.task.findUnique({
    where: { id: asUuid(taskId) },
    select: { id: true, projectId: true },
  });
  if (!task) {
    return {
      branches: [],
      commits: [],
      pullRequests: [],
    };
  }
  const [links, repoConfigs] = await Promise.all([
    prisma.taskDevLink.findMany({
      where: { taskId: task.id },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        artifactType: true,
        externalId: true,
        owner: true,
        repo: true,
        url: true,
        titleOrMessage: true,
        status: true,
        payloadJson: true,
        updatedAt: true,
      },
    }),
    prisma.projectGithubRepo.findMany({
      where: {
        projectId: task.projectId,
        isEnabled: true,
      },
      select: {
        owner: true,
        repo: true,
        defaultBranch: true,
      },
    }),
  ]);
  const defaultBranchByRepo = new Map(
    repoConfigs.map((repoCfg) => [
      `${String(repoCfg.owner || "").toLowerCase()}::${String(repoCfg.repo || "").toLowerCase()}`,
      String(repoCfg.defaultBranch || "develop"),
    ]),
  );
  const grouped = {
    branches: [],
    commits: [],
    pullRequests: [],
  };
  const pickFirstText = (...values) => {
    for (const value of values) {
      const text = String(value || "").trim();
      if (text) return text;
    }
    return "";
  };
  const pickFirstDate = (...values) => {
    for (const value of values) {
      const text = String(value || "").trim();
      if (!text) continue;
      const timestamp = Date.parse(text);
      if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
    }
    return "";
  };
  for (const row of links) {
    const payload =
      row.payloadJson && typeof row.payloadJson === "object"
        ? row.payloadJson
        : {};
    const repoKey = `${String(row.owner || "").toLowerCase()}::${String(row.repo || "").toLowerCase()}`;
    const authorName = pickFirstText(
      payload?.author?.login,
      payload?.author?.name,
      payload?.user?.login,
      payload?.user?.name,
      payload?.sender?.login,
      payload?.sender?.name,
      payload?.pusher?.name,
      payload?.commit?.author?.name,
      payload?.commit?.author?.email,
      payload?.head_commit?.author?.name,
      payload?.head_commit?.author?.email,
    );
    const createdAt = pickFirstDate(
      payload?.created_at,
      payload?.updated_at,
      payload?.committed_at,
      payload?.authored_date,
      payload?.author?.date,
      payload?.commit?.author?.date,
      payload?.head_commit?.timestamp,
      row.updatedAt,
    );
    const base = {
      id: row.externalId,
      owner: row.owner || "",
      repo: row.repo || "",
      url: row.url || "",
      title: row.titleOrMessage || "",
      status: row.status || "",
      defaultBranch: defaultBranchByRepo.get(repoKey) || "develop",
      updatedAt: row.updatedAt,
      authorName,
      createdAt,
    };
    if (row.artifactType === "branch") {
      grouped.branches.push(base);
    } else if (row.artifactType === "commit") {
      grouped.commits.push(base);
    } else if (row.artifactType === "pull_request") {
      grouped.pullRequests.push(base);
    }
  }
  return grouped;
}

export async function moveTaskStatusForAutomation(
  taskId,
  nextStatus,
  sourceMeta: any = {},
) {
  const current = await getTaskById(taskId);
  if (!current) return null;
  const target = String(nextStatus || "").trim();
  if (!target || target === String(current.status || "").trim()) return current;
  const settings = await getProjectSettings(current.projectId);
  if (!isValidWorkflowStatus(target, settings)) {
    throw new Error(`Invalid workflow status for automation: ${target}`);
  }
  const updated = await updateTask(taskId, { status: target });
  if (!updated) return null;
  await addTaskActivity(taskId, null, "task_moved", {
    from: current.status,
    to: updated.status,
    source: "github_automation",
    performedBy: "Automation rule",
    ...sourceMeta,
  });
  if (updated.assigneeId) {
    await createAndDispatchNotifications({
      actorUserId: null,
      recipientUserIds: [updated.assigneeId],
      type: "automation_task_transition",
      title: `Automation updated ${updated.title}`,
      body: `Task moved from ${current.status} to ${updated.status}.`,
      entityType: "task",
      entityId: updated.id,
      metadata: {
        project_id: updated.projectId,
        task_id: updated.id,
        target_view: "board",
        source: "github_automation",
        from: current.status,
        to: updated.status,
      },
      dedupeKey: `automation-move:${updated.id}:${updated.updatedAt}`,
    });
  }
  return updated;
}



export async function getSummaryOverviewAnalytics(
  filters: SummaryFilters = {},
) {
  return getSummaryOverviewAnalyticsWithDeps(filters, { buildTaskPrismaWhere });
}

export async function getSummarySprintAnalytics(filters: SummaryFilters = {}) {
  return getSummarySprintAnalyticsWithDeps(filters, { buildTaskPrismaWhere });
}

export async function getSummaryFlowAnalytics(filters: SummaryFilters = {}) {
  return getSummaryFlowAnalyticsWithDeps(filters, { buildTaskPrismaWhere });
}

export async function getSummaryWorkloadAnalytics(
  filters: SummaryFilters = {},
) {
  return getSummaryWorkloadAnalyticsWithDeps(filters, { buildTaskPrismaWhere });
}

export async function buildSummaryReportExport(filters: SummaryFilters = {}) {
  return buildSummaryReportExportWithDeps(filters, { buildTaskPrismaWhere });
}

export async function buildBoard(
  sprintId,
  projectId,
  filters: TaskQueryFilters = {},
) {
  const settings = await getProjectSettings(projectId);
  const stages = normalizeWorkflowStages(
    settings.boardCardFields?.workflowStages,
  );
  const tasks = await getTasks({ sprintId, projectId, ...filters });
  const tasksByStatus = new Map();
  tasks.forEach((task) => {
    const statusKey = String(task.status || "");
    const bucket = tasksByStatus.get(statusKey) || [];
    bucket.push(task);
    tasksByStatus.set(statusKey, bucket);
  });
  return stages.map((stage) => ({
    status: stage.key,
    name: stage.name,
    description: stage.description,
    badge: stage.badge,
    counterGroup: stage.counterGroup,
    tasks: tasksByStatus.get(stage.key) || [],
  }));
}

export async function getDashboardData({
  userId,
  limitProjectsToMemberUserId = null,
}) {
  return getDashboardDataWithDeps(
    { userId, limitProjectsToMemberUserId },
    { buildTaskPrismaWhere, mapTaskRow },
  );
}

export async function getBacklogRows({
  projectId,
  selectedSprintId = "",
  filters = {},
  limitProjectsToMemberUserId = null,
}) {
  return getBacklogRowsWithDeps(
    { projectId, selectedSprintId, filters, limitProjectsToMemberUserId },
    { buildTaskPrismaWhere },
  );
}

