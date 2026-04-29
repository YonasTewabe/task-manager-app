import { prisma } from "../db/prisma.js";
import { asObjectRecord } from "../utils/guards.js";
import { asUuid } from "./taskServiceCoreUtils.js";

export async function getSprints(filters: Record<string, unknown> = {}) {
  const filterObj = asObjectRecord(filters);
  const rows = await prisma.sprint.findMany({
    where: {
      ...(filterObj.projectId
        ? { projectId: asUuid(filterObj.projectId) }
        : {}),
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
    orderBy: [{ startDate: "asc" }, { endDate: "asc" }, { name: "asc" }],
  });
  return rows;
}

export async function getActiveSprintForProject(projectId: string) {
  const pid = asUuid(projectId, null);
  if (!pid) return null;
  return prisma.sprint.findFirst({
    where: { projectId: pid, status: "active" },
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
}
