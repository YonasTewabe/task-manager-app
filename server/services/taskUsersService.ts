import { prisma } from "../db/prisma.js";
import { asObjectRecord } from "../utils/guards.js";
import {
  asUuid,
  encodeCursor,
  normalizeEmail,
} from "./taskServiceCoreUtils.js";

export async function getUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      disabledAt: true,
      disableReason: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
      groupMembers: {
        select: {
          group: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    disabledAt: user.disabledAt,
    disableReason: user.disableReason,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    groups: (user.groupMembers || []).map((member) => ({
      id: member.group.id,
      name: member.group.name,
    })),
  }));
}

export async function getUsersPage({
  limit = 30,
  cursor = "",
  isActive = undefined,
}: any = {}) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 30, 200));
  const decodeUsersCursor = (rawCursor) => {
    const raw = String(rawCursor || "").trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      const nameKey = String(parsed?.nameKey || "").trim();
      const id = String(parsed?.id || "").trim();
      if (!nameKey || !id) return null;
      return { nameKey, id };
    } catch {
      return null;
    }
  };
  const decoded = decodeUsersCursor(cursor);
  const users = await prisma.user.findMany({
    where: {
      ...(isActive === true || isActive === false ? { isActive } : {}),
      ...(decoded
        ? {
            OR: [
              { name: { gt: decoded.nameKey } },
              {
                AND: [
                  { name: { equals: decoded.nameKey } },
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
      email: true,
      role: true,
      isActive: true,
      disabledAt: true,
      disableReason: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
      groupMembers: {
        select: {
          group: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: pageSize + 1,
  });
  const hasMore = users.length > pageSize;
  const items = (hasMore ? users.slice(0, pageSize) : users).map((item) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    role: item.role,
    isActive: item.isActive,
    disabledAt: item.disabledAt,
    disableReason: item.disableReason,
    mustChangePassword: item.mustChangePassword,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    groups: (item.groupMembers || []).map((member) => ({
      id: member.group.id,
      name: member.group.name,
    })),
  }));
  const tail = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore
      ? encodeCursor({
          nameKey: String(tail?.name || ""),
          id: tail?.id,
        })
      : "",
    hasMore,
  };
}

export async function getUserGroups() {
  const groups = await prisma.userGroup.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: {
        where: { user: { isActive: true } },
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    members: (group.members || []).map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
    })),
  }));
}

async function setGroupMembers(groupId, userIds) {
  await prisma.userGroupMember.deleteMany({
    where: { groupId: asUuid(groupId) },
  });
  const normalized = [
    ...new Set(
      (userIds || []).map((id) => asUuid(id)).filter((id) => id != null),
    ),
  ];
  if (!normalized.length) return;
  const activeUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { in: normalized },
    },
    select: { id: true },
  });
  const activeUserIds = activeUsers.map((row) => String(row.id));
  if (!activeUserIds.length) return;
  await prisma.userGroupMember.createMany({
    data: activeUserIds.map((id) => ({
      groupId: asUuid(groupId),
      userId: id,
    })),
    skipDuplicates: true,
  });
}

export async function createUserGroup({ name, memberIds = [] }) {
  const group = await prisma.userGroup.create({
    data: {
      name: String(name || "").trim(),
    },
    select: { id: true },
  });
  const groupId = group?.id;
  if (groupId && memberIds) await setGroupMembers(groupId, memberIds);
  const groups = await getUserGroups();
  return groups.find((g) => String(g.id) === String(groupId)) || null;
}

export async function updateUserGroup(groupId, patch: any = {}) {
  if (patch.name !== undefined) {
    await prisma.userGroup.update({
      where: { id: asUuid(groupId) },
      data: { name: String(patch.name).trim() },
    });
  }
  if (patch.memberIds !== undefined) {
    await setGroupMembers(groupId, patch.memberIds);
  }
  const groups = await getUserGroups();
  return groups.find((g) => String(g.id) === String(groupId)) || null;
}

export async function deleteUserGroup(groupId) {
  const normalizedGroupId = asUuid(groupId);
  const settingsRows = await prisma.projectSettings.findMany({
    select: {
      projectId: true,
      workflowRules: true,
    },
  });
  for (const row of settingsRows) {
    const transitions = Array.isArray(row.workflowRules?.transitions)
      ? row.workflowRules.transitions
      : [];
    let changed = false;
    const nextTransitions = transitions.map((transition) => {
      const existing = Array.isArray(transition?.allowedGroupIds)
        ? transition.allowedGroupIds.map((id) => String(id))
        : [];
      const filtered = existing.filter(
        (id) => String(id) !== String(normalizedGroupId),
      );
      if (filtered.length !== existing.length) {
        changed = true;
      }
      return {
        ...transition,
        allowedGroupIds: filtered,
      };
    });
    if (changed) {
      await prisma.projectSettings.update({
        where: { projectId: asUuid(row.projectId) },
        data: { workflowRules: { transitions: nextTransitions } },
      });
    }
  }
  const result = await prisma.userGroup.deleteMany({
    where: { id: normalizedGroupId },
  });
  return result.count > 0;
}

export async function createUser({
  name,
  email,
  passwordHash,
  role,
  mustChangePassword = false,
}) {
  const normalizedEmail = normalizeEmail(email);
  const nextRole = role || "member";
  const nextMustChangePassword = mustChangePassword === true;
  const nextPasswordChangedAt = nextMustChangePassword ? null : new Date();
  return prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      role: nextRole,
      mustChangePassword: nextMustChangePassword,
      passwordChangedAt: nextMustChangePassword ? null : nextPasswordChangedAt,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      disabledAt: true,
      disableReason: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateUser(userId, patch) {
  const allowedMap = {
    name: "name",
    email: "email",
    role: "role",
    passwordHash: "password_hash",
    mustChangePassword: "must_change_password",
    passwordChangedAt: "password_changed_at",
  };

  const patchObj = asObjectRecord(patch);
  const data: Record<string, any> = {};
  for (const [key, dbKey] of Object.entries(allowedMap)) {
    if (patchObj[key] === undefined) continue;
    if (key === "email") {
      data.email = normalizeEmail(patchObj[key]);
    } else if (dbKey === "password_hash") {
      data.passwordHash = patchObj[key];
    } else if (dbKey === "must_change_password") {
      data.mustChangePassword = patchObj[key];
    } else if (dbKey === "password_changed_at") {
      data.passwordChangedAt = patchObj[key];
    } else {
      data[key] = patchObj[key];
    }
  }
  if (Object.keys(data).length === 0) return null;
  try {
    return await prisma.user.update({
      where: { id: asUuid(userId) },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        disabledAt: true,
        disableReason: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch {
    return null;
  }
}

export async function disableUser(userId, actorUserId, reason = "") {
  await prisma.userGroupMember.deleteMany({
    where: { userId: asUuid(userId) },
  });
  try {
    return await prisma.user.update({
      where: { id: asUuid(userId) },
      data: {
        isActive: false,
        disabledAt: new Date(),
        disabledBy: asUuid(actorUserId, null),
        disableReason: String(reason || "").trim(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        disabledAt: true,
        disableReason: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch {
    return null;
  }
}

export async function enableUser(userId) {
  try {
    return await prisma.user.update({
      where: { id: asUuid(userId) },
      data: {
        isActive: true,
        disabledAt: null,
        disabledBy: null,
        disableReason: "",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        disabledAt: true,
        disableReason: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch {
    return null;
  }
}

export async function deleteUser(userId) {
  const result = await prisma.user.deleteMany({
    where: { id: asUuid(userId) },
  });
  return result.count > 0;
}

export async function findUserAuthByEmail(email) {
  const row = await prisma.user.findFirst({
    where: {
      email: normalizeEmail(email),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      isActive: true,
      mustChangePassword: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    password_hash: row.passwordHash,
  };
}

export async function getUserAuthById(userId) {
  const row = await prisma.user.findFirst({
    where: {
      id: asUuid(userId),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      isActive: true,
      mustChangePassword: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    password_hash: row.passwordHash,
  };
}

export async function createPasswordResetToken({
  userId,
  tokenHash,
  expiresAt,
  ipAddress = "",
}) {
  return prisma.passwordResetToken.create({
    data: {
      userId: asUuid(userId),
      tokenHash,
      expiresAt,
      createdByIp: String(ipAddress || "").slice(0, 120),
    },
    select: {
      id: true,
      userId: true,
      tokenHash: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  });
}

export async function getPasswordResetToken(tokenHash) {
  return prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
    },
    select: {
      id: true,
      userId: true,
      tokenHash: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  });
}

export async function consumePasswordResetToken(tokenId) {
  const result = await prisma.passwordResetToken.updateMany({
    where: {
      id: asUuid(tokenId),
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });
  return result.count > 0;
}

export async function invalidatePasswordResetTokensForUser(userId) {
  await prisma.passwordResetToken.updateMany({
    where: {
      userId: asUuid(userId),
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });
}

export async function logUserAudit({
  actorUserId = null,
  targetUserId = null,
  action,
  metadata = {},
}) {
  await prisma.userAuditLog.create({
    data: {
      actorUserId: asUuid(actorUserId, null),
      targetUserId: asUuid(targetUserId, null),
      action: String(action || "").trim(),
      metadata: asObjectRecord(metadata),
    },
  });
}
