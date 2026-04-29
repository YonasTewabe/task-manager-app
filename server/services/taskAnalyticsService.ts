import ExcelJS from "exceljs";
import { DEFAULT_WORK_TYPE_VALUES } from "../../src/constants/workTypes.js";
import { PRIORITY_OPTIONS } from "../../src/constants/priorities.js";
import { prisma } from "../db/prisma.js";
import { asObjectRecord } from "../utils/guards.js";
import { asUuid } from "./taskServiceCoreUtils.js";
import {
  bucketDate,
  daysBetween,
  endOfDay,
  formatDateDdMmYyyy,
  formatMetricRows,
  startOfDay,
} from "./taskServiceDateUtils.js";
import { getProjectSettings } from "./taskProjectsService.js";
import { getSprints } from "./taskSprintsReadService.js";
import { normalizeWorkflowStages } from "./workflowStages.js";

async function resolveActiveSprintDefault(projectId: string) {
  const pid = asUuid(projectId, null);
  if (!pid) return null;
  const activeSprint = await prisma.sprint.findFirst({
    where: { projectId: pid, status: "active" },
    select: { id: true, startDate: true, endDate: true },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  if (!activeSprint) return null;
  return {
    sprintId: String(activeSprint.id),
    fromDate: startOfDay(activeSprint.startDate),
    toDate: endOfDay(activeSprint.endDate),
  };
}

async function buildScopedSummaryTaskWhere(filterObj: Record<string, any>, buildTaskPrismaWhere) {
  const projectId = asUuid(filterObj.projectId, null);
  if (!projectId) return {};
  const baseWhere = buildTaskPrismaWhere({
    projectId,
    limitProjectsToMemberUserId: filterObj.limitProjectsToMemberUserId,
  });
  const fromDate = startOfDay(filterObj.from);
  const toDate = endOfDay(filterObj.to);
  const hasExplicitRange = Boolean(fromDate || toDate);
  if (hasExplicitRange) {
    return {
      AND: [
        baseWhere,
        {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        },
      ],
    };
  }
  const activeSprintDefault = await resolveActiveSprintDefault(projectId);
  if (activeSprintDefault?.sprintId) {
    return {
      AND: [baseWhere, { sprintId: activeSprintDefault.sprintId }],
    };
  }
  return baseWhere;
}

async function getOpenTaskAgingKpis({
  projectId,
  doneStatusList,
  fromDate = null,
  toDate = null,
  activeSprintId = null,
  limitProjectsToMemberUserId = null,
}: {
  projectId: string;
  doneStatusList: string[];
  fromDate?: Date | null;
  toDate?: Date | null;
  activeSprintId?: string | null;
  limitProjectsToMemberUserId?: string | null;
}) {
  const conditions: string[] = [`t."project_id" = $1::uuid`];
  const params: any[] = [projectId];
  if (doneStatusList.length > 0) {
    const placeholders = doneStatusList.map((_, idx) => `$${params.length + idx + 1}`);
    conditions.push(`t."status" NOT IN (${placeholders.join(", ")})`);
    params.push(...doneStatusList);
  }
  if (fromDate || toDate) {
    if (fromDate) {
      params.push(fromDate);
      conditions.push(`t."created_at" >= $${params.length}`);
    }
    if (toDate) {
      params.push(toDate);
      conditions.push(`t."created_at" <= $${params.length}`);
    }
  } else if (activeSprintId) {
    params.push(activeSprintId);
    conditions.push(`t."sprint_id" = $${params.length}::uuid`);
  }
  if (limitProjectsToMemberUserId) {
    params.push(limitProjectsToMemberUserId);
    conditions.push(
      `EXISTS (SELECT 1 FROM "project_members" pm WHERE pm."project_id" = t."project_id" AND pm."user_id" = $${params.length}::uuid)`,
    );
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = (await prisma.$queryRawUnsafe(
    `
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - t."created_at")) / 86400.0), 0)::double precision AS "avgOpenAgeDays",
        COALESCE(SUM(CASE WHEN t."due_date" < NOW() THEN 1 ELSE 0 END), 0)::int AS "overdueTasks"
      FROM "tasks" t
      ${whereClause}
    `,
    ...params,
  )) as Array<{ avgOpenAgeDays: number; overdueTasks: number }>;
  const row = result?.[0];
  return {
    avgOpenAgeDays: Number(row?.avgOpenAgeDays || 0),
    overdueTasks: Number(row?.overdueTasks || 0),
  };
}

export async function getSummaryOverviewAnalyticsWithDeps(
  filters: Record<string, unknown> = {},
  deps: { buildTaskPrismaWhere: (filters: Record<string, unknown>) => Record<string, any> },
) {
  const filterObj = asObjectRecord(filters);
  const projectId = asUuid(filterObj.projectId, null);
  if (!projectId) throw new Error("projectId is required");
  const settings = await getProjectSettings(projectId);
  const doneStatuses = new Set(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages)
      .filter((stage) => stage.counterGroup === "done")
      .map((stage) => stage.key),
  );
  const statusLabels = new Map(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages).map(
      (stage) => [stage.key, stage.name],
    ),
  );
  const doneStatusList = [...doneStatuses];
  const scopedWhere = await buildScopedSummaryTaskWhere(filterObj, deps.buildTaskPrismaWhere);
  const fromDate = startOfDay(filterObj.from);
  const toDate = endOfDay(filterObj.to);
  const hasExplicitRange = Boolean(fromDate || toDate);
  const activeSprintDefault = hasExplicitRange
    ? null
    : await resolveActiveSprintDefault(projectId);
  const [statusRows, priorityRows, typeRows, openAgingKpis, totalTasks, linkedRows] =
    await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        where: scopedWhere,
        _count: { _all: true },
        _sum: { storyPoints: true },
      }),
      prisma.task.groupBy({
        by: ["priority"],
        where: scopedWhere,
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ["type"],
        where: scopedWhere,
        _count: { _all: true },
      }),
      getOpenTaskAgingKpis({
        projectId,
        doneStatusList,
        fromDate,
        toDate,
        activeSprintId: activeSprintDefault?.sprintId || null,
        limitProjectsToMemberUserId: asUuid(
          filterObj.limitProjectsToMemberUserId,
          null,
        ),
      }),
      prisma.task.count({ where: { projectId } }),
      prisma.taskDevLink.findMany({
        where: { task: { projectId } },
        distinct: ["taskId"],
        select: { taskId: true },
      }),
    ]);
  const totalTasksInRange = statusRows.reduce(
    (sum, row) => sum + Number(row._count?._all || 0),
    0,
  );
  const completedTasks = statusRows
    .filter((row) => doneStatuses.has(String(row.status || "")))
    .reduce((sum, row) => sum + Number(row._count?._all || 0), 0);
  const totalStoryPoints = statusRows.reduce(
    (sum, row) => sum + Number(row._sum?.storyPoints || 0),
    0,
  );
  const completedStoryPoints = statusRows
    .filter((row) => doneStatuses.has(String(row.status || "")))
    .reduce((sum, row) => sum + Number(row._sum?.storyPoints || 0), 0);
  const avgOpenAgeDays = Number(openAgingKpis?.avgOpenAgeDays || 0);
  const priorityCounts = new Map(
    PRIORITY_OPTIONS.map((option) => [String(option.value).toLowerCase(), 0]),
  );
  const configuredTypes =
    Array.isArray(settings?.generalRules?.types) &&
    settings.generalRules.types.length > 0
      ? settings.generalRules.types
      : DEFAULT_WORK_TYPE_VALUES;
  const typeCounts = new Map<string, number>(
    configuredTypes.map((type) => [String(type || "").toLowerCase(), 0]),
  );
  priorityRows.forEach((row) => {
    const key = String(row.priority || "unknown").toLowerCase();
    priorityCounts.set(key, Number(row._count?._all || 0));
  });
  typeRows.forEach((row) => {
    const key = String(row.type || "unknown").toLowerCase();
    typeCounts.set(key, Number(row._count?._all || 0));
  });
  const statusDistribution = statusRows
    .map((row) => ({
      status: String(row.status || ""),
      label:
        statusLabels.get(String(row.status || "")) || String(row.status || ""),
      value: Number(row._count?._all || 0),
    }))
    .sort((a, b) => b.value - a.value);
  const priorityDistribution = [...priorityCounts.entries()]
    .map(([priority, count]) => ({
      label: priority.replace(/_/g, " "),
      value: count,
      priority,
    }))
    .sort((a, b) => b.value - a.value);
  const typeDistribution = [...typeCounts.entries()]
    .map(([type, count]) => ({
      label: String(type).replace(/_/g, " "),
      value: Number(count || 0),
      type: String(type),
    }))
    .sort((a, b) => b.value - a.value);

  const linkedTasks = Number(linkedRows.length || 0);

  return {
    kpis: {
      totalTasks: totalTasksInRange,
      completedTasks,
      overdueTasks: Number(openAgingKpis?.overdueTasks || 0),
      completionRate: totalTasksInRange
        ? (completedTasks / totalTasksInRange) * 100
        : 0,
      avgOpenAgeDays,
      totalStoryPoints,
      completedStoryPoints,
      linkedCoverageRate: totalTasks ? (linkedTasks / totalTasks) * 100 : 0,
    },
    statusDistribution,
    priorityDistribution,
    typeDistribution,
  };
}

export async function getSummarySprintAnalyticsWithDeps(
  filters: Record<string, unknown> = {},
  deps: { buildTaskPrismaWhere: (filters: Record<string, unknown>) => Record<string, any> },
) {
  const filterObj = asObjectRecord(filters);
  const projectId = asUuid(filterObj.projectId, null);
  if (!projectId) throw new Error("projectId is required");
  const fromDate = startOfDay(filterObj.from);
  const toDate = endOfDay(filterObj.to);
  const settings = await getProjectSettings(projectId);
  const doneStatuses = new Set(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages)
      .filter((stage) => stage.counterGroup === "done")
      .map((stage) => stage.key),
  );
  const doneStatusList = [...doneStatuses];
  const scopedWhere = deps.buildTaskPrismaWhere({
    projectId,
    limitProjectsToMemberUserId: filterObj.limitProjectsToMemberUserId,
  });
  const sprintRangeWhere =
    fromDate || toDate
      ? {
          AND: [
            scopedWhere,
            {
              createdAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            },
          ],
        }
      : scopedWhere;
  const [sprints, sprintStatusRows] = await Promise.all([
    getSprints({ projectId }),
    prisma.task.groupBy({
      by: ["sprintId", "status"],
      where: {
        AND: [sprintRangeWhere, { sprintId: { not: null } }],
      },
      _count: { _all: true },
      _sum: { storyPoints: true },
    }),
  ]);
  const bySprint = new Map();
  sprintStatusRows.forEach((row) => {
    const sprintId = row.sprintId ? String(row.sprintId) : "";
    if (!sprintId) return;
    const current = bySprint.get(sprintId) || {
      plannedPoints: 0,
      completedPoints: 0,
      totalTasks: 0,
      completedTasks: 0,
    };
    const points = Number(row._sum?.storyPoints || 0);
    const taskCount = Number(row._count?._all || 0);
    current.plannedPoints += points;
    current.totalTasks += taskCount;
    if (doneStatusList.includes(String(row.status || ""))) {
      current.completedPoints += points;
      current.completedTasks += taskCount;
    }
    bySprint.set(sprintId, current);
  });
  const velocityTrend = sprints.map((sprint) => {
    const stats = bySprint.get(String(sprint.id)) || {
      plannedPoints: 0,
      completedPoints: 0,
      totalTasks: 0,
      completedTasks: 0,
    };
    return {
      sprintId: sprint.id,
      label: sprint.name,
      value: stats.completedPoints,
      plannedPoints: stats.plannedPoints,
      completedPoints: stats.completedPoints,
      completionRate: stats.totalTasks
        ? (stats.completedTasks / stats.totalTasks) * 100
        : 0,
      carryOverPoints: Math.max(stats.plannedPoints - stats.completedPoints, 0),
    };
  });

  return { velocityTrend };
}

export async function getSummaryFlowAnalyticsWithDeps(
  filters: Record<string, unknown> = {},
  deps: { buildTaskPrismaWhere: (filters: Record<string, unknown>) => Record<string, any> },
) {
  const filterObj = asObjectRecord(filters);
  const projectId = asUuid(filterObj.projectId, null);
  if (!projectId) throw new Error("projectId is required");
  const interval = filterObj.interval === "month" ? "month" : "week";
  const fromDate = startOfDay(filterObj.from);
  const toDate = endOfDay(filterObj.to);
  const settings = await getProjectSettings(projectId);
  const doneStatuses = new Set(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages)
      .filter((stage) => stage.counterGroup === "done")
      .map((stage) => stage.key),
  );
  const doneStatusList = [...doneStatuses];
  const scopedWhere = deps.buildTaskPrismaWhere({
    projectId,
    limitProjectsToMemberUserId: filterObj.limitProjectsToMemberUserId,
  });
  const doneInRange = await prisma.task.findMany({
    where: {
      AND: [
        scopedWhere,
        { status: { in: doneStatusList } },
        ...(fromDate || toDate
          ? [
              {
                updatedAt: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const throughputMap = new Map();
  doneInRange.forEach((task) => {
    const key = bucketDate(task.updatedAt, interval);
    throughputMap.set(key, (throughputMap.get(key) || 0) + 1);
  });
  const throughput = [...throughputMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const wipByStatusRows = await prisma.task.groupBy({
    by: ["status"],
    where: {
      AND: [scopedWhere, { status: { notIn: doneStatusList } }],
    },
    _count: { _all: true },
  });

  const doneTaskIds = doneInRange.map((task) => task.id);
  let cycleStartByTask = new Map();
  if (doneTaskIds.length) {
    const result = await prisma.taskActivity.groupBy({
      by: ["taskId"],
      where: {
        taskId: { in: doneTaskIds },
        action: "task_moved",
        meta: { path: ["to"], equals: "in_progress" },
      },
      _min: { createdAt: true },
    });
    cycleStartByTask = new Map(
      result.map((row) => [String(row.taskId), row._min?.createdAt || null]),
    );
  }

  const leadTimes = doneInRange
    .map((task) => daysBetween(task.createdAt, task.updatedAt))
    .filter((value) => value != null);
  const cycleTimes = doneInRange
    .map((task) =>
      daysBetween(
        cycleStartByTask.get(String(task.id)) || task.createdAt,
        task.updatedAt,
      ),
    )
    .filter((value) => value != null);

  return {
    throughput,
    wipByStatus: wipByStatusRows.map((row) => ({
      label: String(row.status || ""),
      value: Number(row._count?._all || 0),
    })),
    cycleLead: {
      avgLeadTimeDays: leadTimes.length
        ? leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length
        : 0,
      avgCycleTimeDays: cycleTimes.length
        ? cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length
        : 0,
    },
  };
}

export async function getSummaryWorkloadAnalyticsWithDeps(
  filters: Record<string, unknown> = {},
  deps: { buildTaskPrismaWhere: (filters: Record<string, unknown>) => Record<string, any> },
) {
  const filterObj = asObjectRecord(filters);
  const projectId = asUuid(filterObj.projectId, null);
  if (!projectId) throw new Error("projectId is required");
  const settings = await getProjectSettings(projectId);
  const doneStatuses = new Set(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages)
      .filter((stage) => stage.counterGroup === "done")
      .map((stage) => stage.key),
  );
  const doneStatusList = [...doneStatuses];
  const scopedWhere = await buildScopedSummaryTaskWhere(filterObj, deps.buildTaskPrismaWhere);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [projectMembers, groupedAssigneeRows, groupedOverdueRows, agingCounts] =
    await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
      }),
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: scopedWhere,
        _count: { _all: true },
        _sum: { storyPoints: true },
      }),
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: {
          AND: [
            scopedWhere,
            { dueDate: { lt: new Date() } },
            { status: { notIn: doneStatusList } },
          ],
        },
        _count: { _all: true },
      }),
      Promise.all([
        prisma.task.count({
          where: {
            AND: [
              scopedWhere,
              { status: { notIn: doneStatusList } },
              { createdAt: { gte: sevenDaysAgo } },
            ],
          },
        }),
        prisma.task.count({
          where: {
            AND: [
              scopedWhere,
              { status: { notIn: doneStatusList } },
              { createdAt: { lt: sevenDaysAgo, gte: fourteenDaysAgo } },
            ],
          },
        }),
        prisma.task.count({
          where: {
            AND: [
              scopedWhere,
              { status: { notIn: doneStatusList } },
              { createdAt: { lt: fourteenDaysAgo, gte: thirtyDaysAgo } },
            ],
          },
        }),
        prisma.task.count({
          where: {
            AND: [
              scopedWhere,
              { status: { notIn: doneStatusList } },
              { createdAt: { lt: thirtyDaysAgo } },
            ],
          },
        }),
      ]),
    ]);
  const usersById = new Map(
    projectMembers
      .filter((member) => member.user)
      .map((member) => [String(member.user.id), member.user]),
  );
  const projectMemberIds = new Set(
    projectMembers.map((member) => String(member.userId)),
  );
  const byAssignee = new Map();
  projectMemberIds.forEach((memberId) => {
    const assigneeUser: any = usersById.get(memberId);
    byAssignee.set(memberId, {
      label: assigneeUser
        ? `${assigneeUser.name}${assigneeUser.isActive === false ? " (Disabled)" : ""}`
        : "Unknown",
      value: 0,
      storyPoints: 0,
      overdue: 0,
    });
  });
  if (!byAssignee.has("unassigned")) {
    byAssignee.set("unassigned", {
      label: "Unassigned",
      value: 0,
      storyPoints: 0,
      overdue: 0,
    });
  }
  groupedAssigneeRows.forEach((groupRow) => {
    const assigneeKey = groupRow.assigneeId
      ? String(groupRow.assigneeId)
      : "unassigned";
    const assigneeUser: any = usersById.get(assigneeKey);
    const assigneeLabel =
      assigneeKey === "unassigned"
        ? "Unassigned"
        : assigneeUser
          ? `${assigneeUser.name}${assigneeUser.isActive === false ? " (Disabled)" : ""}`
          : "Unknown";
    const assigneeRow = byAssignee.get(assigneeKey) || {
      label: assigneeLabel,
      value: 0,
      storyPoints: 0,
      overdue: 0,
    };
    assigneeRow.value += Number(groupRow._count?._all || 0);
    assigneeRow.storyPoints += Number(groupRow._sum?.storyPoints || 0);
    byAssignee.set(assigneeKey, assigneeRow);
  });
  groupedOverdueRows.forEach((row) => {
    const assigneeKey = row.assigneeId ? String(row.assigneeId) : "unassigned";
    const existing = byAssignee.get(assigneeKey);
    if (existing) {
      existing.overdue += Number(row._count?._all || 0);
      byAssignee.set(assigneeKey, existing);
    }
  });
  const agingBuckets = {
    "0-7 days": Number(agingCounts?.[0] || 0),
    "8-14 days": Number(agingCounts?.[1] || 0),
    "15-30 days": Number(agingCounts?.[2] || 0),
    "30+ days": Number(agingCounts?.[3] || 0),
  };

  return {
    assigneeLoad: [...byAssignee.values()].sort((a, b) => b.value - a.value),
    agingBuckets: Object.entries(agingBuckets).map(([label, value]) => ({
      label,
      value,
    })),
  };
}

async function buildXlsxWorkbookBuffer(
  sheets: Array<{ name: string; rows: Array<Record<string, any>> }> = [],
) {
  const workbook = new ExcelJS.Workbook();
  (sheets || []).forEach((sheet) => {
    const name = String(sheet?.name || "").trim() || "Sheet";
    const rows: Array<Record<string, any>> =
      Array.isArray(sheet?.rows) && sheet.rows.length > 0
        ? sheet.rows
        : [{ note: "No data" }];
    const worksheet = workbook.addWorksheet(name.slice(0, 31));
    const headers = Object.keys(rows[0] || {});
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headers.forEach((header) => {
      const values = rows.map((row) => {
        const value = row?.[header];
        return value == null ? "" : String(value);
      });
      const maxValueLength = values.reduce(
        (max, value) => Math.max(max, value.length),
        String(header).length,
      );
      const column = worksheet.getColumn(headers.indexOf(header) + 1);
      column.width = Math.min(60, Math.max(12, maxValueLength + 2));
    });
    rows.forEach((row) => {
      worksheet.addRow(headers.map((header) => row?.[header] ?? ""));
    });
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  });
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

async function getSummaryExportTaskRows(
  filters: Record<string, unknown> = {},
  deps: { buildTaskPrismaWhere: (filters: Record<string, unknown>) => Record<string, any> },
) {
  const filterObj = asObjectRecord(filters);
  const projectId = asUuid(filterObj.projectId, null);
  if (!projectId) return [];
  const settings = await getProjectSettings(projectId);
  const statusNameByKey = new Map(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages).map(
      (stage) => [
        String(stage.key || ""),
        String(stage.name || stage.key || ""),
      ],
    ),
  );
  const fromDate = startOfDay(filterObj.from);
  const toDate = endOfDay(filterObj.to);
  const hasExplicitRange = Boolean(fromDate || toDate);
  const activeSprintDefault = hasExplicitRange
    ? null
    : await resolveActiveSprintDefault(projectId);
  const where = deps.buildTaskPrismaWhere({
    projectId,
    limitProjectsToMemberUserId: filterObj.limitProjectsToMemberUserId,
  });
  if (hasExplicitRange) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  } else if (activeSprintDefault?.sprintId) {
    where.sprintId = activeSprintDefault.sprintId;
  }
  const rows = await prisma.task.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      storyPoints: true,
      createdAt: true,
      sprintId: true,
      taskNumber: true,
      project: { select: { projectKey: true } },
      assignee: { select: { name: true } },
      creator: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => ({
    "Task Key":
      row.project?.projectKey && row.taskNumber != null
        ? `${row.project.projectKey}-${row.taskNumber}`
        : "",
    Name: row.title || "",
    "Created Date": formatDateDdMmYyyy(row.createdAt),
    Status: statusNameByKey.get(String(row.status || "")) || row.status || "",
    Priority: row.priority || "",
    Assignee: row.assignee?.name || "Unassigned",
    Reporter: row.creator?.name || "",
    "Story Point": row.storyPoints ?? "",
  }));
}

export async function buildSummaryReportExportWithDeps(
  filters: Record<string, unknown> = {},
  deps: { buildTaskPrismaWhere: (filters: Record<string, unknown>) => Record<string, any> },
) {
  const filterObj = asObjectRecord(filters);
  const type = String(filterObj.type || "overview")
    .trim()
    .toLowerCase();
  let rows = [];
  let overviewForGraphic: any = null;
  if (type === "sprint") {
    const sprint = await getSummarySprintAnalyticsWithDeps(filterObj, deps);
    rows = (sprint.velocityTrend || []).map((row) => ({
      sprint: row.label,
      completedPoints: row.completedPoints,
      plannedPoints: row.plannedPoints,
      carryOverPoints: row.carryOverPoints,
      completionRate: Number(row.completionRate || 0).toFixed(2),
    }));
  } else if (type === "workload") {
    const workload = await getSummaryWorkloadAnalyticsWithDeps(filterObj, deps);
    rows = (workload.assigneeLoad || []).map((row) => ({
      assignee: row.label,
      taskCount: row.value,
      storyPoints: row.storyPoints,
      overdueTasks: row.overdue,
    }));
  } else {
    const overview = await getSummaryOverviewAnalyticsWithDeps(filterObj, deps);
    overviewForGraphic = overview;
    rows = formatMetricRows([
      { label: "Total tasks", value: overview.kpis.totalTasks },
      { label: "Completed tasks", value: overview.kpis.completedTasks },
      { label: "Overdue tasks", value: overview.kpis.overdueTasks },
      {
        label: "Completion rate (%)",
        value: Number(overview.kpis.completionRate || 0).toFixed(2),
      },
    ]);
  }

  const taskRows = await getSummaryExportTaskRows(filterObj, deps);
  const statusDistributionRows =
    type === "overview"
      ? (overviewForGraphic?.statusDistribution || []).map((item) => ({
          Metric: `Status: ${item.label || item.status || ""}`,
          Value: Number(item.value || 0),
        }))
      : [];
  const summaryRows = [
    {
      Metric: "Included Tasks",
      Value: taskRows.length,
    },
    ...rows,
    ...(statusDistributionRows.length > 0
      ? [{ Metric: "-----", Value: "" }, ...statusDistributionRows]
      : []),
  ];

  return {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    buffer: await buildXlsxWorkbookBuffer([
      { name: "Summary", rows: summaryRows },
      { name: "All Tasks", rows: taskRows },
    ]),
  };
}
