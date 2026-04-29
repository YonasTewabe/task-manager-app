import { prisma } from "../db/prisma.js";
import { getProjectSettings } from "./taskProjectsService.js";
import { asUuid, toDateOnlyValue } from "./taskServiceCoreUtils.js";
import { getDefaultSettings } from "./taskSettingsUtils.js";
import { normalizeWorkflowStages } from "./workflowStages.js";

const ACTIVE_SPRINT_CONFLICT_MESSAGE =
  "Please complete the active sprint before starting a new one";
const SPRINT_DELETE_NOT_EMPTY_MESSAGE =
  "Only empty sprints can be deleted";
const SPRINT_NAME_CONFLICT_MESSAGE =
  "A sprint with this name already exists in this project.";

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

export async function createSprint({
  name,
  projectId,
  startDate,
  endDate,
  status,
}) {
  const normalizedName = String(name || "").trim();
  const normalizedProjectId = asUuid(projectId);
  const normalizedStatus = status || "planned";
  const normalizedStartDate = toDateOnlyValue(startDate, "startDate");
  const normalizedEndDate = toDateOnlyValue(endDate, "endDate");
  return prisma.$transaction(
    async (tx) => {
      const existingSprintByName = await tx.sprint.findFirst({
        where: {
          projectId: normalizedProjectId,
          name: { equals: normalizedName, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existingSprintByName) throw new Error(SPRINT_NAME_CONFLICT_MESSAGE);
      if (normalizedStatus === "active") {
        const conflict = await tx.sprint.findFirst({
          where: { projectId: normalizedProjectId, status: "active" },
          select: { id: true },
        });
        if (conflict) throw new Error(ACTIVE_SPRINT_CONFLICT_MESSAGE);
      }
      return tx.sprint.create({
        data: {
          name: normalizedName,
          projectId: normalizedProjectId,
          startDate: normalizedStartDate,
          endDate: normalizedEndDate,
          status: normalizedStatus,
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          startDate: true,
          endDate: true,
          status: true,
          createdAt: true,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function updateSprint(id, patch) {
  return prisma.$transaction(
    async (tx) => {
      const currentSprint = await tx.sprint.findUnique({
        where: { id: asUuid(id) },
        select: { projectId: true, status: true },
      });
      if (!currentSprint) return null;

      const nextProjectId =
        patch.projectId !== undefined
          ? asUuid(patch.projectId)
          : asUuid(currentSprint.projectId);
      const nextStatus =
        patch.status !== undefined ? patch.status : currentSprint.status;
      const nextName = patch.name !== undefined ? patch.name : undefined;
      if (nextStatus === "active") {
        const conflict = await tx.sprint.findFirst({
          where: {
            projectId: nextProjectId,
            status: "active",
            id: { not: asUuid(id) },
          },
          select: { id: true },
        });
        if (conflict) throw new Error(ACTIVE_SPRINT_CONFLICT_MESSAGE);
      }
      if (nextName !== undefined) {
        const sprintNameConflict = await tx.sprint.findFirst({
          where: {
            projectId: nextProjectId,
            name: {
              equals: String(nextName || "").trim(),
              mode: "insensitive",
            },
            id: { not: asUuid(id) },
          },
          select: { id: true },
        });
        if (sprintNameConflict) throw new Error(SPRINT_NAME_CONFLICT_MESSAGE);
      }
      const data: Record<string, any> = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.projectId !== undefined)
        data.projectId = asUuid(patch.projectId);
      if (patch.startDate !== undefined)
        data.startDate = toDateOnlyValue(patch.startDate, "startDate");
      if (patch.endDate !== undefined)
        data.endDate = toDateOnlyValue(patch.endDate, "endDate");
      if (patch.status !== undefined) data.status = patch.status;
      if (Object.keys(data).length === 0) return null;
      return tx.sprint.update({
        where: { id: asUuid(id) },
        data,
        select: {
          id: true,
          name: true,
          projectId: true,
          startDate: true,
          endDate: true,
          status: true,
          createdAt: true,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function assignTasksToSprint(taskIds = [], sprintId = null) {
  const normalizedTaskIds = [
    ...new Set((taskIds || []).map((id) => asUuid(id, null)).filter(Boolean)),
  ];
  if (!normalizedTaskIds.length) return [];
  await prisma.task.updateMany({
    where: { id: { in: normalizedTaskIds } },
    data: { sprintId: asUuid(sprintId, null) },
  });
  const rows = await prisma.task.findMany({
    where: { id: { in: normalizedTaskIds } },
    include: { project: { select: { projectKey: true } } },
  });
  return rows.map((row) =>
    mapTaskRow({
      ...row,
      projectKey: row.project?.projectKey || "",
      version: row.versionLabel,
    }),
  );
}

export async function completeSprint(
  sprintId,
  moveIncompleteToSprintId = null,
) {
  const sid = asUuid(sprintId);
  if (!sid) return null;
  const sprintRow = await prisma.sprint.findUnique({
    where: { id: sid },
    select: { projectId: true },
  });
  if (!sprintRow) return null;
  const sprintProjectId = sprintRow?.projectId;
  const settings = sprintProjectId
    ? await getProjectSettings(sprintProjectId)
    : getDefaultSettings();
  const doneStatuses = normalizeWorkflowStages(
    settings.boardCardFields?.workflowStages,
  )
    .filter((stage) => stage.counterGroup === "done")
    .map((stage) => stage.key);
  const destinationSprintId = asUuid(moveIncompleteToSprintId, null);

  if (destinationSprintId) {
    const destination = await prisma.sprint.findUnique({
      where: { id: destinationSprintId },
      select: { id: true, projectId: true },
    });
    if (!destination) {
      throw new Error("Destination sprint not found");
    }
    if (String(destination.projectId) !== String(sprintProjectId)) {
      throw new Error("Destination sprint must belong to the same project");
    }
    if (String(destination.id) === String(asUuid(sprintId))) {
      throw new Error("Destination sprint must be different");
    }
  }

  const doneFilter = doneStatuses.length ? doneStatuses : ["done"];
  const [updatedSprint] = await prisma.$transaction(
    [
      prisma.sprint.update({
        where: { id: sid },
        data: { status: "completed" },
        select: {
          id: true,
          name: true,
          projectId: true,
          startDate: true,
          endDate: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.task.updateMany({
        where: {
          sprintId: sid,
          status: { notIn: doneFilter },
        },
        data: {
          sprintId: destinationSprintId,
        },
      }),
    ],
    { isolationLevel: "Serializable" },
  );
  return updatedSprint || null;
}

export async function assignTaskToSprint(taskId, sprintId) {
  await prisma.task.updateMany({
    where: { id: asUuid(taskId) },
    data: { sprintId: asUuid(sprintId, null) },
  });
  const row = await prisma.task.findUnique({
    where: { id: asUuid(taskId) },
    include: { project: { select: { projectKey: true } } },
  });
  return row
    ? mapTaskRow({
        ...row,
        projectKey: row.project?.projectKey || "",
        version: row.versionLabel,
      })
    : null;
}

export async function removeTaskFromSprint(taskId, sprintId) {
  await prisma.task.updateMany({
    where: {
      id: asUuid(taskId),
      sprintId: asUuid(sprintId, null),
    },
    data: { sprintId: null },
  });
  const row = await prisma.task.findUnique({
    where: { id: asUuid(taskId) },
    include: { project: { select: { projectKey: true } } },
  });
  return row
    ? mapTaskRow({
        ...row,
        projectKey: row.project?.projectKey || "",
        version: row.versionLabel,
      })
    : null;
}

export async function deleteSprint(sprintId) {
  const sid = asUuid(sprintId);
  const inUse = await prisma.task.findFirst({
    where: { sprintId: sid },
    select: { id: true },
  });
  if (inUse) {
    throw new Error(SPRINT_DELETE_NOT_EMPTY_MESSAGE);
  }
  const result = await prisma.sprint.deleteMany({
    where: { id: sid },
  });
  return result.count > 0;
}
