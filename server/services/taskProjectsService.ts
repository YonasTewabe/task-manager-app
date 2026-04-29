import { prisma } from "../db/prisma.js";
import { asUuid, encodeCursor, normalizeMemberIds } from "./taskServiceCoreUtils.js";
import {
  mergeSettingsRow,
  pullLegacyFromWorkflowPatch,
  sanitizeBoardCardFields,
  stripLegacyWorkflowRuleKeys,
} from "./taskSettingsUtils.js";
import {
  DEFAULT_WORKFLOW_TRANSITIONS,
  normalizeWorkflowRules,
  validateWorkflowStagesForSave,
} from "./workflowStages.js";

const PROJECT_NAME_CONFLICT_MESSAGE =
  "A project with this name already exists.";
const PROJECT_KEY_CONFLICT_MESSAGE =
  "A project with this short code already exists.";

async function ensureProjectSettingsRow(projectId) {
  const pid = asUuid(projectId, null);
  if (!pid) return;
  await prisma.projectSettings.upsert({
    where: { projectId: pid },
    create: {
      projectId: pid,
      workflowRules: {
        transitions: DEFAULT_WORKFLOW_TRANSITIONS,
      },
    },
    update: {},
  });
}

export async function getProjectSettings(projectId) {
  const pid = asUuid(projectId, null);
  if (!pid) return mergeSettingsRow(null);
  const row = await prisma.projectSettings.findUnique({
    where: { projectId: pid },
    select: {
      boardCardFields: true,
      workflowRules: true,
      generalRules: true,
      updatedAt: true,
    },
  });
  return mergeSettingsRow(row || null);
}

export async function updateProjectSettings(projectId, patch: any = {}) {
  const pid = asUuid(projectId, null);
  if (!pid) throw new Error("Invalid project id");
  await ensureProjectSettingsRow(pid);
  const current = await getProjectSettings(pid);
  const nextBoard = sanitizeBoardCardFields({
    ...current.boardCardFields,
    ...(patch.boardCardFields || {}),
  });
  if (patch.boardCardFields?.workflowStages != null) {
    nextBoard.workflowStages = validateWorkflowStagesForSave(
      patch.boardCardFields.workflowStages,
    );
  }
  if (patch.boardCardFields?.workflowStages != null) {
    const currentKeys = new Set(
      (current.boardCardFields?.workflowStages || []).map((stage) => stage.key),
    );
    const nextKeys = new Set(
      (nextBoard.workflowStages || []).map((stage) => stage.key),
    );
    const removedKeys = [...currentKeys]
      .map((key) => String(key))
      .filter((key) => !nextKeys.has(key));
    if (removedKeys.length > 0) {
      const migrations: Record<string, string> =
        patch.workflowStageMigrations &&
        typeof patch.workflowStageMigrations === "object"
          ? (patch.workflowStageMigrations as Record<string, string>)
          : {};
      for (const removedKey of removedKeys) {
        const targetKey = String(migrations[removedKey] || "").trim();
        if (
          !targetKey ||
          !nextKeys.has(targetKey) ||
          targetKey === removedKey
        ) {
          throw new Error(
            `Missing valid migration target for removed column "${removedKey}"`,
          );
        }
        await prisma.task.updateMany({
          where: {
            projectId: pid,
            status: removedKey,
          },
          data: {
            status: targetKey,
          },
        });
      }
    }
  }
  const migratedFromWorkflowPatch = pullLegacyFromWorkflowPatch(
    patch.workflowRules,
  );
  const next = {
    boardCardFields: nextBoard,
    workflowRules: normalizeWorkflowRules(
      stripLegacyWorkflowRuleKeys({
        ...current.workflowRules,
        ...(patch.workflowRules || {}),
      }),
      nextBoard.workflowStages,
    ),
    generalRules: {
      ...current.generalRules,
      ...migratedFromWorkflowPatch,
      ...(patch.generalRules || {}),
    },
  };
  delete next.generalRules.allowBackMoveFromDone;
  delete next.generalRules.enforceUniqueTaskTitlesInSprint;
  const row = await prisma.projectSettings.update({
    where: { projectId: pid },
    data: {
      boardCardFields: next.boardCardFields,
      workflowRules: next.workflowRules,
      generalRules: next.generalRules,
    },
    select: {
      boardCardFields: true,
      workflowRules: true,
      generalRules: true,
      updatedAt: true,
    },
  });
  return mergeSettingsRow(row || null);
}

async function setProjectMembers(
  projectId,
  memberIds,
  projectAdminMemberIds = undefined,
  client = prisma,
) {
  const pid = asUuid(projectId);
  const normalized = normalizeMemberIds(memberIds);
  let adminSet = new Set();
  if (projectAdminMemberIds !== undefined) {
    normalizeMemberIds(projectAdminMemberIds).forEach((uid) =>
      adminSet.add(String(uid)),
    );
  } else if (normalized.length) {
    const prev = await client.projectMember.findMany({
      where: { projectId: pid, isProjectAdmin: true },
      select: { userId: true },
    });
    const prevAdmin = new Set(prev.map((r) => String(r.userId)));
    normalized.forEach((uid) => {
      if (prevAdmin.has(String(uid))) adminSet.add(String(uid));
    });
  }

  const activeUsers = await client.user.findMany({
    where: {
      isActive: true,
      id: { in: normalized },
    },
    select: { id: true },
  });
  const activeUserIds = activeUsers.map((row) => String(row.id));
  const activeUserSet = new Set(activeUserIds.map((id) => String(id)));
  await client.projectMember.deleteMany({
    where: { projectId: pid },
  });
  if (!activeUserIds.length) return;
  const admins = [...adminSet].filter((id) => activeUserSet.has(String(id)));
  await client.projectMember.createMany({
    data: activeUserIds.map((uid) => ({
      projectId: pid,
      userId: uid,
      isProjectAdmin: admins.includes(String(uid)),
    })),
    skipDuplicates: true,
  });
}

async function assertUniqueProjectIdentity({
  name,
  projectKey,
  excludeProjectId = null,
}) {
  const normalizedName = String(name || "").trim();
  const normalizedKey = String(projectKey || "").trim();
  if (!normalizedName || !normalizedKey) return;
  const existing = await prisma.project.findFirst({
    where: {
      ...(excludeProjectId ? { id: { not: asUuid(excludeProjectId) } } : {}),
      OR: [
        { name: { equals: normalizedName, mode: "insensitive" } },
        { projectKey: { equals: normalizedKey, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, projectKey: true },
  });
  if (!existing) return;
  if (
    String(existing.name || "")
      .trim()
      .toLowerCase() === normalizedName.toLowerCase()
  ) {
    throw new Error(PROJECT_NAME_CONFLICT_MESSAGE);
  }
  throw new Error(PROJECT_KEY_CONFLICT_MESSAGE);
}

export async function getProjects() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      projectKey: true,
      description: true,
      createdAt: true,
      members: {
        where: { user: { isActive: true } },
        select: {
          isProjectAdmin: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
      },
    },
    orderBy: [{ projectKey: "asc" }, { id: "asc" }],
  });
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    projectKey: project.projectKey,
    description: project.description,
    createdAt: project.createdAt,
    members: (project.members || []).map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      isProjectAdmin: member.isProjectAdmin === true,
    })),
  }));
}

export async function getProjectsPage({
  limit = 30,
  cursor = "",
}: any = {}) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 30, 200));
  const decodeProjectsCursor = (rawCursor) => {
    const raw = String(rawCursor || "").trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      const projectKeyKey = String(parsed?.projectKeyKey || "").trim();
      const id = String(parsed?.id || "").trim();
      if (!projectKeyKey || !id) return null;
      return { projectKeyKey, id };
    } catch {
      return null;
    }
  };
  const decoded = decodeProjectsCursor(cursor);
  const rows = await prisma.project.findMany({
    where: {
      ...(decoded
        ? {
            OR: [
              { projectKey: { gt: decoded.projectKeyKey } },
              {
                AND: [
                  {
                    projectKey: {
                      equals: decoded.projectKeyKey,
                    },
                  },
                  { id: { gt: decoded.id } },
                ],
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      projectKey: true,
      description: true,
      createdAt: true,
      members: {
        where: { user: { isActive: true } },
        select: {
          isProjectAdmin: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
      },
    },
    orderBy: [{ projectKey: "asc" }, { id: "asc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const items = (hasMore ? rows.slice(0, pageSize) : rows).map((item) => ({
    id: item.id,
    name: item.name,
    projectKey: item.projectKey,
    description: item.description,
    createdAt: item.createdAt,
    members: (item.members || []).map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      isProjectAdmin: member.isProjectAdmin === true,
    })),
  }));
  const tail = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore
      ? encodeCursor({
          projectKeyKey: String(tail?.projectKey || ""),
          id: tail?.id,
        })
      : "",
    hasMore,
  };
}

export async function getProjectById(projectId) {
  const pid = asUuid(projectId, null);
  if (!pid) return null;
  const project = await prisma.project.findUnique({
    where: { id: pid },
    select: {
      id: true,
      name: true,
      projectKey: true,
      description: true,
      createdAt: true,
      members: {
        where: { user: { isActive: true } },
        select: {
          isProjectAdmin: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    projectKey: project.projectKey,
    description: project.description,
    createdAt: project.createdAt,
    members: (project.members || []).map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      isProjectAdmin: member.isProjectAdmin === true,
    })),
  };
}

export async function createProject({
  name,
  projectKey,
  description,
  memberIds,
}) {
  await assertUniqueProjectIdentity({ name, projectKey });
  const project = await prisma.project.create({
    data: {
      name,
      projectKey,
      description: description || "",
    },
    select: { id: true },
  });
  await setProjectMembers(project.id, memberIds || []);
  await ensureProjectSettingsRow(project.id);
  const projects = await getProjects();
  return projects.find((item) => item.id === project.id) || project;
}

export async function updateProject(projectId, patch) {
  const projectIdNormalized = asUuid(projectId);
  const currentProject = await prisma.project.findUnique({
    where: { id: projectIdNormalized },
    select: { id: true, name: true, projectKey: true },
  });
  if (!currentProject) return null;
  const nextName = patch.name !== undefined ? patch.name : currentProject.name;
  const nextProjectKey =
    patch.projectKey !== undefined
      ? patch.projectKey
      : currentProject.projectKey;
  await assertUniqueProjectIdentity({
    name: nextName,
    projectKey: nextProjectKey,
    excludeProjectId: projectIdNormalized,
  });

  await prisma.$transaction(async (tx) => {
    const data: Record<string, any> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.projectKey !== undefined) data.projectKey = patch.projectKey;
    if (patch.description !== undefined) data.description = patch.description;
    if (Object.keys(data).length > 0) {
      await tx.project.update({
        where: { id: projectIdNormalized },
        data,
      });
    }
    if (patch.memberIds !== undefined) {
      await setProjectMembers(
        projectId,
        patch.memberIds,
        patch.projectAdminMemberIds,
        tx,
      );
    } else if (patch.projectAdminMemberIds !== undefined) {
      await tx.projectMember.updateMany({
        where: { projectId: asUuid(projectId) },
        data: { isProjectAdmin: false },
      });
      const normalizedAdmins = normalizeMemberIds(patch.projectAdminMemberIds);
      if (normalizedAdmins.length) {
        await tx.projectMember.updateMany({
          where: {
            projectId: asUuid(projectId),
            userId: { in: normalizedAdmins },
          },
          data: { isProjectAdmin: true },
        });
      }
    }
  });
  return getProjectById(projectIdNormalized);
}

export async function userCanManageProject(userId, projectId, userRole = null) {
  const uid = asUuid(userId);
  const pid = asUuid(projectId);
  if (!uid || !pid) return false;
  if (String(userRole || "").toLowerCase() === "admin") return true;
  const pm = await prisma.projectMember.findFirst({
    where: {
      projectId: pid,
      userId: uid,
      isProjectAdmin: true,
    },
    select: { userId: true },
  });
  return Boolean(pm);
}

export async function getSprintProjectId(sprintId) {
  const sid = asUuid(sprintId);
  if (!sid) return null;
  const sprint = await prisma.sprint.findUnique({
    where: { id: sid },
    select: { projectId: true },
  });
  return sprint?.projectId || null;
}

export async function deleteProject(projectId) {
  const result = await prisma.project.deleteMany({
    where: { id: asUuid(projectId) },
  });
  return result.count > 0;
}

export async function projectExists(projectId) {
  const result = await prisma.project.findUnique({
    where: { id: asUuid(projectId) },
    select: { id: true },
  });
  return Boolean(result);
}
