import { prisma } from "../db/prisma.js";
import { asObjectRecord } from "../utils/guards.js";
import { getProjectSettings } from "./taskProjectsService.js";
import { getSprints } from "./taskSprintsReadService.js";
import { asUuid } from "./taskServiceCoreUtils.js";
import { DEFAULT_WORKFLOW_STAGES, normalizeWorkflowStages } from "./workflowStages.js";

export async function getDashboardDataWithDeps(
  {
    userId,
    limitProjectsToMemberUserId = null,
  }: {
    userId: unknown;
    limitProjectsToMemberUserId?: unknown;
  },
  deps: {
    buildTaskPrismaWhere: (filters: Record<string, unknown>) => Record<string, any>;
    mapTaskRow: (row: Record<string, any>) => Record<string, any>;
  },
) {
  const uid = asUuid(userId, null);
  if (!uid) {
    return {
      assignedTasks: [],
      recentTasks: [],
      bucketCounts: { upcoming: 0, active: 0, done: 0 },
      projectCards: [],
    };
  }
  const scopedUserId = limitProjectsToMemberUserId
    ? asUuid(limitProjectsToMemberUserId, null)
    : null;
  const projectsForUser = scopedUserId
    ? await prisma.project.findMany({
        where: {
          members: { some: { userId: scopedUserId } },
        },
        select: {
          id: true,
          name: true,
          projectKey: true,
        },
      })
    : await prisma.project.findMany({
        select: {
          id: true,
          name: true,
          projectKey: true,
        },
      });
  const allowedProjectIds = new Set(
    projectsForUser.map((project) => String(project.id || "")),
  );
  const allowedProjectIdList = [...allowedProjectIds];
  if (scopedUserId && allowedProjectIdList.length === 0) {
    return {
      assignedTasks: [],
      recentTasks: [],
      bucketCounts: { upcoming: 0, active: 0, done: 0 },
      projectCards: [],
    };
  }
  const assignedRows = await prisma.task.findMany({
    where: deps.buildTaskPrismaWhere({
      assigneeId: uid,
      activeSprintOnly: true,
      ...(scopedUserId ? { projectIds: allowedProjectIdList } : {}),
    }),
    include: {
      project: { select: { projectKey: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 150,
  });
  const sorted = assignedRows
    .map((row) =>
      deps.mapTaskRow({
        ...row,
        projectKey: row.project?.projectKey || "",
        version: row.versionLabel,
      }),
    )
    .filter((task) =>
      scopedUserId ? allowedProjectIds.has(String(task.projectId || "")) : true,
    );
  const projectCounts = new Map();
  const bucketCounts = { upcoming: 0, active: 0, done: 0 };
  const defaultStageToBucket = new Map(
    DEFAULT_WORKFLOW_STAGES.map((stage) => [stage.key, stage.counterGroup]),
  );
  const projectStageToBucket = new Map();
  const projectIds = projectsForUser
    .map((project) => asUuid(project.id, null))
    .filter(Boolean);
  if (projectIds.length > 0) {
    const settingsRows = await prisma.projectSettings.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        boardCardFields: true,
      },
    });
    settingsRows.forEach((row) => {
      const stageToBucket = new Map(
        normalizeWorkflowStages(row?.boardCardFields?.workflowStages).map(
          (stage) => [
            String(stage.key || ""),
            stage.counterGroup || "upcoming",
          ],
        ),
      );
      projectStageToBucket.set(String(row.projectId || ""), stageToBucket);
    });
  }
  sorted.forEach((task) => {
    const key = String(task.projectId || "");
    projectCounts.set(key, (projectCounts.get(key) || 0) + 1);
    const stageToBucket = projectStageToBucket.get(key) || defaultStageToBucket;
    const bucket = stageToBucket.get(String(task.status || "")) || "upcoming";
    if (bucket === "active") bucketCounts.active += 1;
    else if (bucket === "done") bucketCounts.done += 1;
    else bucketCounts.upcoming += 1;
  });
  const projectCards = projectsForUser.map((project) => ({
    id: project.id,
    name: project.name,
    projectKey: project.projectKey,
    assignedCount: Number(projectCounts.get(String(project.id)) || 0),
  }));
  return {
    assignedTasks: sorted.slice(0, 80),
    recentTasks: sorted.slice(0, 20),
    bucketCounts,
    projectCards,
  };
}

export async function getBacklogRowsWithDeps(
  {
    projectId,
    selectedSprintId = "",
    filters = {},
    limitProjectsToMemberUserId = null,
  }: {
    projectId: unknown;
    selectedSprintId?: unknown;
    filters?: unknown;
    limitProjectsToMemberUserId?: unknown;
  },
  deps: {
    buildTaskPrismaWhere: (filters: Record<string, unknown>) => Record<string, any>;
  },
) {
  const filterObj = asObjectRecord(filters);
  const pid = asUuid(projectId, null);
  if (!pid) return [];
  const normalizedFilters = {
    projectId: pid,
    assigneeId: filterObj.assigneeId,
    status: filterObj.status,
    priority: filterObj.priority,
    type: filterObj.type,
    label: filterObj.label,
    search: filterObj.search,
    ...(limitProjectsToMemberUserId
      ? { limitProjectsToMemberUserId: asUuid(limitProjectsToMemberUserId) }
      : {}),
  };
  const [settings, sprints] = await Promise.all([
    getProjectSettings(pid),
    getSprints({ projectId: pid }),
  ]);
  const stageList = normalizeWorkflowStages(
    settings?.boardCardFields?.workflowStages,
  );
  const buckets = stageList.reduce(
    (acc, stage) => {
      const g =
        stage.counterGroup === "active"
          ? "active"
          : stage.counterGroup === "done"
            ? "done"
            : "upcoming";
      acc[g].push(stage.key);
      return acc;
    },
    { upcoming: [], active: [], done: [] },
  );
  const sumStoryPoints = (tasks, statuses) => {
    const allowed = new Set(Array.isArray(statuses) ? statuses : [statuses]);
    return tasks.reduce((total, task) => {
      if (!allowed.has(task.status)) return total;
      return total + (Number(task.storyPoints) || 0);
    }, 0);
  };
  const mapBacklogTaskLite = (row) => {
    const taskNumber = row.taskNumber != null ? Number(row.taskNumber) : null;
    const projectKey = String(row?.project?.projectKey || "").trim();
    const taskKey =
      projectKey && taskNumber != null && !Number.isNaN(taskNumber)
        ? `${projectKey}-${taskNumber}`
        : null;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      storyPoints: row.storyPoints,
      sprintId: row.sprintId,
      assigneeId: row.assigneeId,
      priority: row.priority,
      taskNumber,
      taskKey,
      projectId: row.projectId,
    };
  };
  if (selectedSprintId) {
    const selectedSprintKey = String(selectedSprintId);
    const selected = sprints.find(
      (sprint) => String(sprint.id) === selectedSprintKey,
    );
    if (!selected) return [];
    const selectedTaskRows = await prisma.task.findMany({
      where: deps.buildTaskPrismaWhere({
        ...normalizedFilters,
        sprintId: selectedSprintKey,
      }),
      select: {
        id: true,
        title: true,
        status: true,
        storyPoints: true,
        sprintId: true,
        assigneeId: true,
        priority: true,
        taskNumber: true,
        projectId: true,
        project: { select: { projectKey: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const selectedTasks = selectedTaskRows.map(mapBacklogTaskLite);
    return [
      {
        key: String(selected.id),
        name: selected.name,
        status: selected.status,
        startDate: selected.startDate || "",
        endDate: selected.endDate || "",
        tasks: selectedTasks,
        storyPoints: {
          upcoming: sumStoryPoints(selectedTasks, buckets.upcoming),
          active: sumStoryPoints(selectedTasks, buckets.active),
          done: sumStoryPoints(selectedTasks, buckets.done),
        },
      },
    ];
  }

  const allTaskRows = await prisma.task.findMany({
    where: deps.buildTaskPrismaWhere({
      ...normalizedFilters,
      backlogScope: true,
      includeSprintId: selectedSprintId || undefined,
    }),
    select: {
      id: true,
      title: true,
      status: true,
      storyPoints: true,
      sprintId: true,
      assigneeId: true,
      priority: true,
      taskNumber: true,
      projectId: true,
      project: { select: { projectKey: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  const allTasks = allTaskRows.map(mapBacklogTaskLite);
  const backlogTasks = allTasks.filter((task) => task.sprintId == null);
  const tasksBySprint = new Map();
  allTasks.forEach((task) => {
    const key = task.sprintId == null ? "backlog" : String(task.sprintId);
    const list = tasksBySprint.get(key) || [];
    list.push(task);
    tasksBySprint.set(key, list);
  });
  const sprintRows = [...sprints]
    .filter(
      (sprint) =>
        sprint.status === "active" ||
        sprint.status === "planned" ||
        String(sprint.id) === String(selectedSprintId || ""),
    )
    .map((sprint) => {
      const rowTasks = tasksBySprint.get(String(sprint.id)) || [];
      return {
        key: String(sprint.id),
        name: sprint.name,
        status: sprint.status,
        startDate: sprint.startDate || "",
        endDate: sprint.endDate || "",
        tasks: rowTasks,
        storyPoints: {
          upcoming: sumStoryPoints(rowTasks, buckets.upcoming),
          active: sumStoryPoints(rowTasks, buckets.active),
          done: sumStoryPoints(rowTasks, buckets.done),
        },
      };
    });
  const sortByDateThenName = (a, b) => {
    const aDate =
      Date.parse(a.startDate || a.endDate || "") || Number.POSITIVE_INFINITY;
    const bDate =
      Date.parse(b.startDate || b.endDate || "") || Number.POSITIVE_INFINITY;
    if (aDate !== bDate) return aDate - bDate;
    return String(a.name || "").localeCompare(String(b.name || ""));
  };
  const active = sprintRows
    .filter((row) => row.status === "active")
    .sort(sortByDateThenName);
  const planned = sprintRows
    .filter((row) => row.status === "planned")
    .sort(sortByDateThenName);
  const other = sprintRows
    .filter((row) => row.status !== "active" && row.status !== "planned")
    .sort(sortByDateThenName);
  const backlogRow = {
    key: "backlog",
    name: "Backlog",
    status: "backlog",
    tasks: backlogTasks,
    storyPoints: {
      upcoming: sumStoryPoints(backlogTasks, buckets.upcoming),
      active: sumStoryPoints(backlogTasks, buckets.active),
      done: sumStoryPoints(backlogTasks, buckets.done),
    },
  };
  return [backlogRow, ...active, ...planned, ...other];
}
