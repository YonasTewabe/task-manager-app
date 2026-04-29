import { prisma } from "../db/prisma.js";
import { asUuid } from "./taskServiceCoreUtils.js";
import { getProjectSettings } from "./taskProjectsService.js";
import { isValidWorkflowStatus } from "./workflowStages.js";

async function getProjectMemberIds(projectId) {
  const rows = await prisma.projectMember.findMany({
    where: { projectId: asUuid(projectId) },
    select: { userId: true },
  });
  return rows.map((r) => String(r.userId));
}

async function getUserGroupIdsForProjectMember(projectId, userId) {
  const rows = await prisma.userGroupMember.findMany({
    where: {
      userId: asUuid(userId),
      user: {
        projectMembers: {
          some: { projectId: asUuid(projectId) },
        },
      },
    },
    select: { groupId: true },
  });
  return rows.map((row) => String(row.groupId));
}

export async function canUserMoveTask(task, nextStatus, actor) {
  const currentStatus = String(task?.status || "");
  const targetStatus = String(nextStatus || "");
  if (!currentStatus || !targetStatus || currentStatus === targetStatus)
    return true;

  const settings = await getProjectSettings(task.projectId);
  if (!isValidWorkflowStatus(targetStatus, settings)) return false;

  const transitions = Array.isArray(settings?.workflowRules?.transitions)
    ? settings.workflowRules.transitions
    : [];
  const transition = transitions.find(
    (item) => item?.from === currentStatus && item?.to === targetStatus,
  );
  if (!transition) return false;

  const actorId = String(actor?.id || "");
  const allowedUserIds = Array.isArray(transition.allowedUserIds)
    ? transition.allowedUserIds
    : [];
  const allowedGroupIds = Array.isArray(transition.allowedGroupIds)
    ? transition.allowedGroupIds
    : [];
  const allowAllUsers = transition.allowAllUsers === true;

  if (allowAllUsers) return true;
  if (
    allowedUserIds.some((id) => String(id) === actorId)
  )
    return true;
  if (String(actor?.role || "").toLowerCase() === "admin") return true;

  const projectMemberIds = await getProjectMemberIds(task.projectId);
  if (!projectMemberIds.some((id) => String(id) === actorId)) return false;

  if (!allowedGroupIds.length) return false;
  const userGroupIds = await getUserGroupIdsForProjectMember(task.projectId, actorId);
  return userGroupIds.some((id) =>
    allowedGroupIds.some((gid) => String(gid) === String(id)),
  );
}
