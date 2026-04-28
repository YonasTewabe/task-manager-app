import { DEFAULT_WORK_TYPE_VALUES } from "../../src/constants/workTypes.js";
import { PRIORITY_OPTIONS } from "../../src/constants/priorities.js";
import XLSX from "xlsx";
import { prisma } from "../db/prisma.js";
import { asInt } from "../utils/validation.js";
import { asObjectRecord } from "../utils/guards.js";
import { createAndDispatchNotifications } from "./notificationService.js";

export const DEFAULT_WORKFLOW_STAGES = [
  {
    key: "blocked",
    name: "Blocked",
    counterGroup: "upcoming",
  },
  {
    key: "todo",
    name: "To Do",
    counterGroup: "upcoming",
  },
  {
    key: "in_progress",
    name: "In Progress",
    counterGroup: "active",
  },
  {
    key: "done",
    name: "Done",
    counterGroup: "done",
  },
];

/** @deprecated use getWorkflowStageKeys(settings) */
export const STATUS_COLUMNS = DEFAULT_WORKFLOW_STAGES.map((s) => s.key);

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

function inferCounterGroup(key) {
  if (key === "done") return "done";
  if (key === "in_progress") return "active";
  if (key === "blocked" || key === "todo") return "upcoming";
  return "upcoming";
}

export function normalizeWorkflowStages(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const key = String(item.key || "").trim();
    if (!/^[a-z][a-z0-9_-]{0,62}$/.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = String(item.name || key).trim() || key;
    const description = String(item.description ?? "").trim();
    const badge = String(item.badge ?? "").trim();
    let counterGroup = item.counterGroup;
    if (
      counterGroup !== "upcoming" &&
      counterGroup !== "active" &&
      counterGroup !== "done"
    ) {
      counterGroup = inferCounterGroup(key);
    }
    cleaned.push({ key, name, description, badge, counterGroup });
  }
  if (cleaned.length === 0) {
    return DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s }));
  }
  return cleaned;
}

function defaultWorkflowTransitions(stages) {
  const list = Array.isArray(stages) ? stages : [];
  const transitions = [];
  for (let i = 0; i < list.length - 1; i += 1) {
    const from = list[i]?.key;
    const to = list[i + 1]?.key;
    if (!from || !to) continue;
    transitions.push({
      from,
      to,
      allowAllUsers: true,
      allowedUserIds: [],
      allowedGroupIds: [],
    });
  }
  return transitions;
}

const DEFAULT_WORKFLOW_TRANSITIONS = defaultWorkflowTransitions(
  DEFAULT_WORKFLOW_STAGES,
);

function normalizeWorkflowRules(rawRules, stages) {
  const stageKeys = new Set((stages || []).map((s) => s.key));
  const raw = rawRules && typeof rawRules === "object" ? rawRules : {};
  const incoming = Array.isArray(raw.transitions) ? raw.transitions : [];
  const seen = new Set();
  const transitions = [];

  for (const item of incoming) {
    const from = String(item?.from || "").trim();
    const to = String(item?.to || "").trim();
    if (!from || !to || from === to) continue;
    if (!stageKeys.has(from) || !stageKeys.has(to)) continue;
    const pair = `${from}->${to}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const allowedUserIds = [
      ...new Set(
        (Array.isArray(item?.allowedUserIds) ? item.allowedUserIds : [])
          .map((id) => asUuid(id, null))
          .filter((id) => id != null),
      ),
    ];
    transitions.push({
      from,
      to,
      allowAllUsers: item?.allowAllUsers === true,
      allowedUserIds,
      allowedGroupIds: [
        ...new Set(
          (Array.isArray(item?.allowedGroupIds) ? item.allowedGroupIds : [])
            .map((id) => asUuid(id, null))
            .filter((id) => id != null),
        ),
      ],
    });
  }

  return {
    transitions: transitions.length
      ? transitions
      : defaultWorkflowTransitions(stages),
  };
}

export function validateWorkflowStagesForSave(raw) {
  if (!Array.isArray(raw) || raw.length < 1) {
    throw new Error("At least one workflow stage is required");
  }
  const keys = new Set();
  const names = new Set();
  for (const item of raw) {
    const key = String(item?.key || "").trim();
    if (!/^[a-z][a-z0-9_-]{0,62}$/.test(key)) {
      throw new Error(
        `Invalid stage key "${key}". Use a lowercase letter first, then letters, numbers, hyphens, or underscores.`,
      );
    }
    if (keys.has(key)) throw new Error(`Duplicate stage key: ${key}`);
    keys.add(key);
    if (!String(item?.name || "").trim()) {
      throw new Error(`Stage "${key}" needs a display name`);
    }
    const nameKey = String(item?.name || "")
      .trim()
      .toLowerCase();
    if (names.has(nameKey)) {
      throw new Error(
        `Duplicate stage name: ${String(item?.name || "").trim()}`,
      );
    }
    names.add(nameKey);
    if (
      item?.counterGroup !== "upcoming" &&
      item?.counterGroup !== "active" &&
      item?.counterGroup !== "done"
    ) {
      throw new Error(`Stage "${key}" requires a backlog roll-up`);
    }
  }
  return raw.map((item) => {
    return {
      key: String(item.key).trim(),
      name: String(item.name).trim(),
      description: String(item.description ?? "").trim(),
      badge: String(item.badge ?? "").trim(),
      counterGroup: item.counterGroup,
    };
  });
}

export function getWorkflowStageKeys(settings) {
  return normalizeWorkflowStages(settings?.boardCardFields?.workflowStages).map(
    (s) => s.key,
  );
}

export function isValidWorkflowStatus(status, settings) {
  return getWorkflowStageKeys(settings).includes(String(status || "").trim());
}

function asUuid(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function encodeCursor(payload) {
  if (!payload) return "";
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  const raw = String(cursor || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const updatedAt = String(parsed.updatedAt || "").trim();
    const id = String(parsed.id || "").trim();
    if (!updatedAt || !id) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

/** Formerly stored under workflow_rules; now general_rules (workflow_rules reserved for future workflow config). */
const LEGACY_WORKFLOW_RULE_KEYS = [
  "allowBackMoveFromDone",
  "requireAssigneeForInProgress",
  "autoMoveToBacklogOnSprintComplete",
];

const REMOVED_BOARD_CARD_FIELD_KEYS = [
  "showStoryPoints",
  "showPriority",
  "showAssignee",
  "showLabel",
];

function sanitizeBoardCardFields(obj) {
  const o = { ...(obj && typeof obj === "object" ? obj : {}) };
  REMOVED_BOARD_CARD_FIELD_KEYS.forEach((k) => {
    delete o[k];
  });
  return o;
}

function stripLegacyWorkflowRuleKeys(obj) {
  const o = { ...(obj && typeof obj === "object" ? obj : {}) };
  LEGACY_WORKFLOW_RULE_KEYS.forEach((k) => {
    delete o[k];
  });
  return o;
}

const DEFAULT_SETTINGS = {
  boardCardFields: {
    workflowStages: DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s })),
  },
  workflowRules: {},
  generalRules: {
    labels: [],
    types: DEFAULT_WORK_TYPE_VALUES,
    versions: [],
  },
};
const LABEL_COLOR_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#eab308",
  "#6366f1",
];

function normalizeHexLabelColor(value) {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  return "";
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (n) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function getUniqueLabelColor(index, usedColors) {
  const preset = LABEL_COLOR_PALETTE[index % LABEL_COLOR_PALETTE.length];
  if (!usedColors.has(preset)) return preset;
  let offset = 0;
  while (offset < 720) {
    const hue = (index * 47 + offset * 19) % 360;
    const generated = hslToHex(hue, 0.65, 0.56);
    if (!usedColors.has(generated)) return generated;
    offset += 1;
  }
  return "";
}

function normalizeLabelsWithUniqueColors(labels = []) {
  const source = Array.isArray(labels) ? labels : [];
  const seenNames = new Set();
  const usedColors = new Set();
  return source
    .map((label, index) => {
      const name =
        typeof label === "string"
          ? String(label || "").trim()
          : String(label?.name || "").trim();
      if (!name) return null;
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) return null;
      seenNames.add(nameKey);
      const preferred = normalizeHexLabelColor(label?.color);
      const color =
        preferred && !usedColors.has(preferred)
          ? preferred
          : getUniqueLabelColor(index, usedColors);
      if (!color) return null;
      usedColors.add(color);
      return { name, color };
    })
    .filter(Boolean);
}

function mergeGeneralRules(rowGeneral, rowWorkflow) {
  const base =
    rowGeneral && typeof rowGeneral === "object" ? { ...rowGeneral } : {};
  const legacy =
    rowWorkflow && typeof rowWorkflow === "object" ? rowWorkflow : {};
  for (const k of LEGACY_WORKFLOW_RULE_KEYS) {
    if (base[k] === undefined && legacy[k] !== undefined) {
      base[k] = legacy[k];
    }
  }
  delete base.allowBackMoveFromDone;
  delete base.enforceUniqueTaskTitlesInSprint;
  const labels = Array.isArray(base.labels) ? base.labels : [];
  base.labels = normalizeLabelsWithUniqueColors(labels);
  const types = Array.isArray(base.types) ? base.types : [];
  const sanitizedTypes = [
    ...new Set(
      types
        .map((type) =>
          String(type || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
  base.types = sanitizedTypes.length
    ? sanitizedTypes
    : [...DEFAULT_SETTINGS.generalRules.types];
  const versions = Array.isArray(base.versions) ? base.versions : [];
  base.versions = [
    ...new Set(
      versions.map((version) => String(version || "").trim()).filter(Boolean),
    ),
  ];
  return base;
}

function pullLegacyFromWorkflowPatch(workflowPatch) {
  const pulled = {};
  if (!workflowPatch || typeof workflowPatch !== "object") return pulled;
  for (const k of LEGACY_WORKFLOW_RULE_KEYS) {
    if (workflowPatch[k] !== undefined) pulled[k] = workflowPatch[k];
  }
  return pulled;
}

function mergeSettingsRow(row) {
  if (!row) {
    const mergedBoard = sanitizeBoardCardFields({
      ...DEFAULT_SETTINGS.boardCardFields,
    });
    mergedBoard.workflowStages = normalizeWorkflowStages(
      mergedBoard.workflowStages,
    );
    return {
      boardCardFields: mergedBoard,
      workflowRules: normalizeWorkflowRules({}, mergedBoard.workflowStages),
      generalRules: { ...DEFAULT_SETTINGS.generalRules },
      updatedAt: undefined,
    };
  }
  const mergedBoard = sanitizeBoardCardFields({
    ...DEFAULT_SETTINGS.boardCardFields,
    ...(row.boardCardFields || {}),
  });
  mergedBoard.workflowStages = normalizeWorkflowStages(
    mergedBoard.workflowStages,
  );
  return {
    boardCardFields: mergedBoard,
    workflowRules: normalizeWorkflowRules(
      stripLegacyWorkflowRuleKeys(row.workflowRules || {}),
      mergedBoard.workflowStages,
    ),
    generalRules: mergeGeneralRules(row.generalRules, row.workflowRules),
    updatedAt: row.updatedAt,
  };
}

export function getDefaultSettings() {
  return mergeSettingsRow(null);
}

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
  const normalizedNameKey = (value) =>
    String(value || "")
      .trim()
      .toLocaleLowerCase();
  const decoded = decodeUsersCursor(cursor);
  const users = await prisma.user.findMany({
    where: {
      ...(isActive === true || isActive === false ? { isActive } : {}),
      ...(decoded
        ? {
            OR: [
              { name: { gt: decoded.nameKey, mode: "insensitive" } },
              {
                AND: [
                  { name: { equals: decoded.nameKey, mode: "insensitive" } },
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
          nameKey: normalizedNameKey(tail?.name),
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
  return prisma.user.create({
    data: {
      name,
      email: normalizeEmail(email),
      passwordHash,
      role: role || "member",
      mustChangePassword: mustChangePassword === true,
      passwordChangedAt: mustChangePassword === true ? null : new Date(),
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

export async function getSprints(filters: Record<string, unknown> = {}) {
  const filterObj = asObjectRecord(filters);
  const rows = await prisma.sprint.findMany({
    where: {
      ...(filterObj.projectId ? { projectId: asUuid(filterObj.projectId) } : {}),
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

function normalizeMemberIds(memberIds = []) {
  return [
    ...new Set(
      (memberIds || []).map((id) => asUuid(id)).filter((id) => id != null),
    ),
  ];
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
    const prevAdmin = new Set(
      prev.map((r) => String(r.userId)),
    );
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
  const params = [normalizedName, normalizedKey];
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
    orderBy: [{ id: "desc" }],
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

export async function getProjectsPage({ limit = 30, cursor = "" }: any = {}) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 30, 200));
  const decoded = decodeCursor(cursor);
  const rows = await prisma.project.findMany({
    where: decoded
      ? {
          OR: [
            { createdAt: { lt: new Date(decoded.updatedAt) } },
            {
              AND: [
                { createdAt: { equals: new Date(decoded.updatedAt) } },
                { id: { lt: String(decoded.id || "") } },
              ],
            },
          ],
        }
      : {},
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
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
      ? encodeCursor({ updatedAt: tail?.createdAt, id: tail?.id })
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
  const projectMemberIds = await getProjectMemberIds(task.projectId);
  if (!projectMemberIds.includes(actorId)) return false;

  // Backward-compatible default: if a transition has no explicit user/group
  // restrictions, allow any project member to move the task.
  if (
    transition?.allowAllUsers !== true &&
    allowedUserIds.length === 0 &&
    allowedGroupIds.length === 0
  ) {
    return true;
  }
  if (transition?.allowAllUsers === true) {
    return true;
  }
  if (allowedUserIds.length > 0) {
    if (allowedUserIds.includes(actorId)) return true;
  }
  if (allowedGroupIds.length > 0) {
    const actorGroupIds = await getUserGroupIdsForProjectMember(
      task.projectId,
      actorId,
    );
    if (actorGroupIds.some((groupId) => allowedGroupIds.includes(groupId)))
      return true;
  }
  return false;
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
          startDate: startDate || null,
          endDate: endDate || null,
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
            name: { equals: String(nextName || "").trim(), mode: "insensitive" },
            id: { not: asUuid(id) },
          },
          select: { id: true },
        });
        if (sprintNameConflict) throw new Error(SPRINT_NAME_CONFLICT_MESSAGE);
      }
      const data: Record<string, any> = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.projectId !== undefined) data.projectId = asUuid(patch.projectId);
      if (patch.startDate !== undefined) data.startDate = patch.startDate;
      if (patch.endDate !== undefined) data.endDate = patch.endDate;
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
  if (filterObj.label) where.label = { equals: String(filterObj.label).trim(), mode: "insensitive" };
  if (filterObj.search) {
    const search = String(filterObj.search).trim();
    const compactSearch = search.replace(/\s+/g, "");
    const numericOnlyMatch = compactSearch.match(/^\d+$/);
    const keyMatch = compactSearch.match(/^([A-Za-z0-9][A-Za-z0-9]*)-(\d+)$/);
    const keyPrefixMatch = compactSearch.match(/^([A-Za-z0-9][A-Za-z0-9]*)-(\d*)$/);
    const keyPrefixRanges: Array<{ gte: number; lte: number }> = [];
    if (keyPrefixMatch && keyPrefixMatch[2]) {
      const numericPrefixText = String(keyPrefixMatch[2]);
      const numericPrefix = Number(numericPrefixText);
      if (Number.isFinite(numericPrefix) && numericPrefix >= 0) {
        const maxDigits = 9;
        const prefixDigits = numericPrefixText.length;
        for (let extraDigits = 0; extraDigits <= Math.max(0, maxDigits - prefixDigits); extraDigits += 1) {
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
        for (let extraDigits = 0; extraDigits <= Math.max(0, maxDigits - prefixDigits); extraDigits += 1) {
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
        ...(keyPrefixMatch
          ? [
              {
                project: {
                  projectKey: { equals: keyPrefixMatch[1], mode: "insensitive" },
                },
              },
            ]
          : []),
        ...(keyMatch
          ? [
              {
                project: {
                  projectKey: { equals: keyMatch[1], mode: "insensitive" },
                },
                taskNumber: Number(keyMatch[2]),
              },
            ]
          : []),
        ...(keyPrefixMatch && keyPrefixRanges.length > 0
          ? keyPrefixRanges.map((range) => ({
              project: {
                projectKey: { equals: keyPrefixMatch[1], mode: "insensitive" },
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
  const rows = await prisma.task.findMany({
    where: buildTaskPrismaWhere(filterObj),
    include: {
      project: { select: { projectKey: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => mapTaskRow({ ...row, projectKey: row.project?.projectKey || "", version: row.versionLabel }));
}

export async function getTasksPage(
  filters: TaskQueryFilters = {},
  { limit = 50, cursor = "" }: { limit?: number | string; cursor?: string } = {},
) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = await prisma.task.findMany({
    where: buildTaskPrismaWhere(filters, { includeCursor: true, cursor }),
    include: {
      project: { select: { projectKey: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const items = (hasMore ? rows.slice(0, pageSize) : rows).map((row) =>
    mapTaskRow({ ...row, projectKey: row.project?.projectKey || "", version: row.versionLabel }),
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
  { limit = 12 }: { limit?: number | string } = {},
) {
  const rawLimit = Number(limit);
  const pageSize =
    String(limit || "").trim() === ""
      ? null
      : Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(rawLimit, 1000))
        : 12;
  const rows = await prisma.task.findMany({
    where: buildTaskPrismaWhere(filters),
    select: {
      id: true,
      title: true,
      projectId: true,
      taskNumber: true,
      project: { select: { projectKey: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    ...(pageSize != null ? { take: pageSize } : {}),
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    taskNumber: row.taskNumber,
    taskKey:
      row.project?.projectKey && row.taskNumber != null
        ? `${row.project.projectKey}-${row.taskNumber}`
        : null,
  }));
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
          const taskNumber = await allocateNextTaskNumber(payload.projectId, tx);
          return tx.task.create({
            data: {
              title: payload.title,
              description: payload.description || "",
              acceptanceCriteria: normalizeAcceptanceCriteria(payload.acceptanceCriteria),
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
  const expectedRowVersion = Number.isFinite(Number(patchObj.expectedRowVersion))
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
    if (!isValidWorkflowStatus(normalizeTaskStatus(patchObj.status), settings)) {
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
  if (!updatedCount.count && (expectedUpdatedAt || expectedRowVersion != null)) {
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
  const task = await prisma.task.findUnique({ where: { id: asUuid(taskId) }, select: { id: true } });
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

export async function addTaskActivity(taskId, userId, action, meta: unknown = {}) {
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
      row.payloadJson && typeof row.payloadJson === "object" ? row.payloadJson : {};
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

export async function moveTaskStatusForAutomation(taskId, nextStatus, sourceMeta: any = {}) {
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

function parseIsoDate(value, fallback = null) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function startOfDay(value) {
  const date = parseIsoDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = parseIsoDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function daysBetween(older, newer) {
  const start = parseIsoDate(older);
  const end = parseIsoDate(newer);
  if (!start || !end) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function bucketDate(dateValue, interval = "week") {
  const date = parseIsoDate(dateValue);
  if (!date) return "";
  const year = date.getUTCFullYear();
  if (interval === "month") {
    return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const firstJan = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - firstJan) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function filterByDateRange(tasks, fromDate, toDate, field = "createdAt") {
  return tasks.filter((task) => {
    const at = parseIsoDate(task?.[field]);
    if (!at) return false;
    if (fromDate && at < fromDate) return false;
    if (toDate && at > toDate) return false;
    return true;
  });
}

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

function formatMetricRows(metrics = []) {
  return metrics.map((metric) => ({
    metric: metric.label,
    value: metric.value,
    notes: metric.sublabel || "",
  }));
}

async function getTaskFactsForAnalytics(filters: TaskQueryFilters = {}) {
  return prisma.task.findMany({
    where: buildTaskPrismaWhere(filters),
    select: {
      id: true,
      status: true,
      storyPoints: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      sprintId: true,
      assigneeId: true,
      projectId: true,
      type: true,
      priority: true,
    },
  });
}

export async function getSummaryOverviewAnalytics(filters: SummaryFilters = {}) {
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
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages).map((stage) => [
      stage.key,
      stage.name,
    ]),
  );
  const fromDate = startOfDay(filterObj.from);
  const toDate = endOfDay(filterObj.to);
  const hasExplicitRange = Boolean(fromDate || toDate);
  const activeSprintDefault = hasExplicitRange
    ? null
    : await resolveActiveSprintDefault(projectId);
  const tasks = await getTaskFactsForAnalytics({
    projectId,
    limitProjectsToMemberUserId: filterObj.limitProjectsToMemberUserId,
  });
  const rangeTasks = hasExplicitRange
    ? filterByDateRange(tasks, fromDate, toDate)
    : activeSprintDefault?.sprintId
      ? tasks.filter(
          (task) => String(task?.sprintId || "") === activeSprintDefault.sprintId,
        )
      : tasks;
  const doneTasks = rangeTasks.filter((task) => doneStatuses.has(task.status));
  const openTasks = rangeTasks.filter((task) => !doneStatuses.has(task.status));
  const overdueTasks = openTasks.filter((task) => {
    const due = parseIsoDate(task.dueDate);
    return due && due < new Date();
  });
  const totalStoryPoints = rangeTasks.reduce(
    (sum, task) => sum + Number(task.storyPoints || 0),
    0,
  );
  const completedStoryPoints = doneTasks.reduce(
    (sum, task) => sum + Number(task.storyPoints || 0),
    0,
  );
  const avgOpenAgeDays =
    openTasks.length > 0
      ? openTasks.reduce(
          (sum, task) => sum + (daysBetween(task.createdAt, new Date()) || 0),
          0,
        ) / openTasks.length
      : 0;
  const statusCounts = new Map();
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
  rangeTasks.forEach((task) => {
    const key = String(task.status || "");
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
    const priorityKey = String(task.priority || "unknown").toLowerCase();
    priorityCounts.set(priorityKey, (priorityCounts.get(priorityKey) || 0) + 1);
    const typeKey = String(task.type || "unknown").toLowerCase();
    typeCounts.set(typeKey, Number(typeCounts.get(typeKey) || 0) + 1);
  });
  const statusDistribution = [...statusCounts.entries()]
    .map(([status, count]) => ({
      label: statusLabels.get(status) || status,
      value: count,
      status,
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

  const [totalTasks, linkedRows] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.taskDevLink.findMany({
      where: { task: { projectId } },
      distinct: ["taskId"],
      select: { taskId: true },
    }),
  ]);
  const linkedTasks = Number(linkedRows.length || 0);

  return {
    kpis: {
      totalTasks: rangeTasks.length,
      completedTasks: doneTasks.length,
      overdueTasks: overdueTasks.length,
      completionRate: rangeTasks.length ? (doneTasks.length / rangeTasks.length) * 100 : 0,
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

export async function getSummarySprintAnalytics(filters: SummaryFilters = {}) {
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
  const [sprints, tasks] = await Promise.all([
    getSprints({ projectId }),
    getTaskFactsForAnalytics({
      projectId,
      limitProjectsToMemberUserId: filterObj.limitProjectsToMemberUserId,
    }),
  ]);
  const rangeTasks = fromDate || toDate ? filterByDateRange(tasks, fromDate, toDate) : tasks;
  const bySprint = new Map();
  rangeTasks.forEach((task) => {
    const sprintId = task.sprintId ? String(task.sprintId) : "";
    if (!sprintId) return;
    const current = bySprint.get(sprintId) || {
      plannedPoints: 0,
      completedPoints: 0,
      totalTasks: 0,
      completedTasks: 0,
    };
    const points = Number(task.storyPoints || 0);
    current.plannedPoints += points;
    current.totalTasks += 1;
    if (doneStatuses.has(task.status)) {
      current.completedPoints += points;
      current.completedTasks += 1;
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

export async function getSummaryFlowAnalytics(filters: SummaryFilters = {}) {
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
  const tasks = await getTaskFactsForAnalytics({
    projectId,
    limitProjectsToMemberUserId: filterObj.limitProjectsToMemberUserId,
  });
  const doneTasks = tasks.filter((task) => doneStatuses.has(task.status));
  const doneInRange = fromDate || toDate ? filterByDateRange(doneTasks, fromDate, toDate, "updatedAt") : doneTasks;
  const throughputMap = new Map();
  doneInRange.forEach((task) => {
    const key = bucketDate(task.updatedAt, interval);
    throughputMap.set(key, (throughputMap.get(key) || 0) + 1);
  });
  const throughput = [...throughputMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const wipByStatusMap = new Map();
  tasks
    .filter((task) => !doneStatuses.has(task.status))
    .forEach((task) => {
      wipByStatusMap.set(task.status, (wipByStatusMap.get(task.status) || 0) + 1);
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
      daysBetween(cycleStartByTask.get(String(task.id)) || task.createdAt, task.updatedAt),
    )
    .filter((value) => value != null);

  return {
    throughput,
    wipByStatus: [...wipByStatusMap.entries()].map(([label, value]) => ({
      label,
      value,
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

export async function getSummaryWorkloadAnalytics(filters: SummaryFilters = {}) {
  const filterObj = asObjectRecord(filters);
  const projectId = asUuid(filterObj.projectId, null);
  if (!projectId) throw new Error("projectId is required");
  const fromDate = startOfDay(filterObj.from);
  const toDate = endOfDay(filterObj.to);
  const hasExplicitRange = Boolean(fromDate || toDate);
  const activeSprintDefault = hasExplicitRange
    ? null
    : await resolveActiveSprintDefault(projectId);
  const settings = await getProjectSettings(projectId);
  const doneStatuses = new Set(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages)
      .filter((stage) => stage.counterGroup === "done")
      .map((stage) => stage.key),
  );
  const [tasks, projectMembers] = await Promise.all([
    getTaskFactsForAnalytics({
      projectId,
      limitProjectsToMemberUserId: filterObj.limitProjectsToMemberUserId,
    }),
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
  ]);
  const usersById = new Map(
    projectMembers
      .filter((member) => member.user)
      .map((member) => [String(member.user.id), member.user]),
  );
  const projectMemberIds = new Set(projectMembers.map((member) => String(member.userId)));
  const rangeTasks = hasExplicitRange
    ? filterByDateRange(tasks, fromDate, toDate)
    : activeSprintDefault?.sprintId
      ? tasks.filter(
          (task) => String(task?.sprintId || "") === activeSprintDefault.sprintId,
        )
      : tasks;
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
  const now = new Date();
  rangeTasks.forEach((task) => {
    const assigneeKey = task.assigneeId ? String(task.assigneeId) : "unassigned";
    const assigneeUser: any = usersById.get(assigneeKey);
    const assigneeLabel =
      assigneeKey === "unassigned"
        ? "Unassigned"
        : assigneeUser
          ? `${assigneeUser.name}${assigneeUser.isActive === false ? " (Disabled)" : ""}`
          : "Unknown";
    const row = byAssignee.get(assigneeKey) || {
      label: assigneeLabel,
      value: 0,
      storyPoints: 0,
      overdue: 0,
    };
    row.value += 1;
    row.storyPoints += Number(task.storyPoints || 0);
    const due = parseIsoDate(task.dueDate);
    if (due && due < now && !doneStatuses.has(task.status)) {
      row.overdue += 1;
    }
    byAssignee.set(assigneeKey, row);
  });
  const agingBuckets = {
    "0-7 days": 0,
    "8-14 days": 0,
    "15-30 days": 0,
    "30+ days": 0,
  };
  rangeTasks
    .filter((task) => !doneStatuses.has(task.status))
    .forEach((task) => {
      const age = daysBetween(task.createdAt, now) || 0;
      if (age <= 7) agingBuckets["0-7 days"] += 1;
      else if (age <= 14) agingBuckets["8-14 days"] += 1;
      else if (age <= 30) agingBuckets["15-30 days"] += 1;
      else agingBuckets["30+ days"] += 1;
    });

  return {
    assigneeLoad: [...byAssignee.values()].sort((a, b) => b.value - a.value),
    agingBuckets: Object.entries(agingBuckets).map(([label, value]) => ({ label, value })),
  };
}

function buildXlsxBuffer(rows = [], sheetName = "Summary") {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "No data" }]);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export async function buildSummaryReportExport(filters: SummaryFilters = {}) {
  const filterObj = asObjectRecord(filters);
  const type = String(filterObj.type || "overview").trim().toLowerCase();
  let rows = [];
  if (type === "sprint") {
    const sprint = await getSummarySprintAnalytics(filterObj);
    rows = (sprint.velocityTrend || []).map((row) => ({
      sprint: row.label,
      completedPoints: row.completedPoints,
      plannedPoints: row.plannedPoints,
      carryOverPoints: row.carryOverPoints,
      completionRate: Number(row.completionRate || 0).toFixed(2),
    }));
  } else if (type === "workload") {
    const workload = await getSummaryWorkloadAnalytics(filterObj);
    rows = (workload.assigneeLoad || []).map((row) => ({
      assignee: row.label,
      taskCount: row.value,
      storyPoints: row.storyPoints,
      overdueTasks: row.overdue,
    }));
  } else {
    const [overview, flow] = await Promise.all([
      getSummaryOverviewAnalytics(filterObj),
      getSummaryFlowAnalytics(filterObj),
    ]);
    rows = formatMetricRows([
      { label: "Total tasks", value: overview.kpis.totalTasks },
      { label: "Completed tasks", value: overview.kpis.completedTasks },
      { label: "Overdue tasks", value: overview.kpis.overdueTasks },
      {
        label: "Completion rate (%)",
        value: Number(overview.kpis.completionRate || 0).toFixed(2),
      },
      {
        label: "Avg lead time (days)",
        value: Number(flow.cycleLead.avgLeadTimeDays || 0).toFixed(2),
      },
      {
        label: "Avg cycle time (days)",
        value: Number(flow.cycleLead.avgCycleTimeDays || 0).toFixed(2),
      },
    ]);
  }

  return {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    buffer: buildXlsxBuffer(rows, "Summary"),
  };
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
  const projectsForUser =
    scopedUserId
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
  const assignedTasks = await getTasks({
    assigneeId: uid,
    ...(scopedUserId
      ? { limitProjectsToMemberUserId: scopedUserId }
      : {}),
  });
  const sorted = [...assignedTasks]
    .filter((task) =>
      scopedUserId ? allowedProjectIds.has(String(task.projectId || "")) : true,
    )
    .sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
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
          (stage) => [String(stage.key || ""), stage.counterGroup || "upcoming"],
        ),
      );
      projectStageToBucket.set(String(row.projectId || ""), stageToBucket);
    });
  }
  sorted.forEach((task) => {
    const key = String(task.projectId || "");
    projectCounts.set(key, (projectCounts.get(key) || 0) + 1);
    const stageToBucket =
      projectStageToBucket.get(key) || defaultStageToBucket;
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
    assignedTasks: sorted,
    recentTasks: sorted,
    bucketCounts,
    projectCards,
  };
}

export async function getBacklogRows({
  projectId,
  selectedSprintId = "",
  filters = {},
  limitProjectsToMemberUserId = null,
}) {
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
  if (selectedSprintId) {
    const selectedSprintKey = String(selectedSprintId);
    const selected = sprints.find((sprint) => String(sprint.id) === selectedSprintKey);
    if (!selected) return [];
    const selectedTasks = await getTasks({
      ...normalizedFilters,
      sprintId: selectedSprintKey,
    });
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

  const allTasks = await getTasks(normalizedFilters);
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
