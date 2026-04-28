import { DEFAULT_WORK_TYPE_VALUES } from "../../src/constants/workTypes.js";
import { PRIORITY_OPTIONS } from "../../src/constants/priorities.js";
import XLSX from "xlsx";
import { dbQuery, withDbClient } from "../db/pool.js";
import { asInt } from "../utils/validation.js";
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
  await dbQuery(
    `INSERT INTO project_settings (project_id, workflow_rules) VALUES ($1, $2::jsonb)
     ON CONFLICT (project_id) DO NOTHING`,
    [
      pid,
      JSON.stringify({
        transitions: DEFAULT_WORKFLOW_TRANSITIONS,
      }),
    ],
  );
}

export async function getProjectSettings(projectId) {
  const pid = asUuid(projectId, null);
  if (!pid) return mergeSettingsRow(null);
  const result = await dbQuery(
    `SELECT board_card_fields AS "boardCardFields",
            workflow_rules AS "workflowRules",
            general_rules AS "generalRules",
            updated_at AS "updatedAt"
     FROM project_settings
     WHERE project_id = $1`,
    [pid],
  );
  return mergeSettingsRow(result.rows[0] || null);
}

export async function updateProjectSettings(projectId, patch = {}) {
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
    const removedKeys = [...currentKeys].filter((key) => !nextKeys.has(key));
    if (removedKeys.length > 0) {
      const migrations =
        patch.workflowStageMigrations &&
        typeof patch.workflowStageMigrations === "object"
          ? patch.workflowStageMigrations
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
        await dbQuery(
          `UPDATE tasks
           SET status = $1, updated_at = NOW()
           WHERE project_id = $2 AND status = $3`,
          [targetKey, pid, removedKey],
        );
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
  const result = await dbQuery(
    `UPDATE project_settings
     SET board_card_fields = $1::jsonb,
         workflow_rules = $2::jsonb,
         general_rules = $3::jsonb,
         updated_at = NOW()
     WHERE project_id = $4
     RETURNING board_card_fields AS "boardCardFields",
               workflow_rules AS "workflowRules",
               general_rules AS "generalRules",
               updated_at AS "updatedAt"`,
    [
      JSON.stringify(next.boardCardFields),
      JSON.stringify(next.workflowRules),
      JSON.stringify(next.generalRules),
      pid,
    ],
  );
  return mergeSettingsRow(result.rows[0] || null);
}

export async function getUsers() {
  const usersResult = await dbQuery(
    `SELECT
       id,
       name,
       email,
       role,
       is_active AS "isActive",
       disabled_at AS "disabledAt",
       disable_reason AS "disableReason",
       must_change_password AS "mustChangePassword",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM users
     ORDER BY LOWER(TRIM(COALESCE(name, ''))) ASC, id ASC`,
  );
  const users = usersResult.rows;
  if (!users.length) return users;
  const userIds = users.map((row) => row.id);
  const groupsResult = await dbQuery(
    `SELECT
       ugm.user_id AS "userId",
       g.id,
       g.name
     FROM user_group_members ugm
     INNER JOIN user_groups g ON g.id = ugm.group_id
     WHERE ugm.user_id = ANY($1::uuid[])`,
    [userIds],
  );
  const groupsByUser = new Map();
  groupsResult.rows.forEach((row) => {
    const key = String(row.userId);
    const list = groupsByUser.get(key) || [];
    list.push({ id: row.id, name: row.name });
    groupsByUser.set(key, list);
  });
  return users.map((user) => ({
    ...user,
    groups: groupsByUser.get(String(user.id)) || [],
  }));
}

export async function getUsersPage({
  limit = 30,
  cursor = "",
  isActive = undefined,
} = {}) {
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
  const params = [];
  let where = "";
  const whereParts = [];
  if (isActive === true || isActive === false) {
    params.push(isActive);
    whereParts.push(`u.is_active = $${params.length}`);
  }
  if (decoded) {
    params.push(decoded.nameKey, decoded.id);
    whereParts.push(
      `(LOWER(TRIM(COALESCE(u.name, ''))), u.id) > ($${params.length - 1}, $${params.length}::uuid)`,
    );
  }
  if (whereParts.length) {
    where = `WHERE ${whereParts.join(" AND ")}`;
  }
  params.push(pageSize + 1);
  const limitPlaceholder = `$${params.length}`;
  const result = await dbQuery(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.role,
       u.is_active AS "isActive",
       u.disabled_at AS "disabledAt",
       u.disable_reason AS "disableReason",
       u.must_change_password AS "mustChangePassword",
       u.created_at AS "createdAt",
       u.updated_at AS "updatedAt"
     FROM users u
     ${where}
     ORDER BY LOWER(TRIM(COALESCE(u.name, ''))) ASC, u.id ASC
     LIMIT ${limitPlaceholder}`,
    params,
  );
  const hasMore = result.rows.length > pageSize;
  const items = hasMore ? result.rows.slice(0, pageSize) : result.rows;
  if (items.length) {
    const groupsResult = await dbQuery(
      `SELECT
         ugm.user_id AS "userId",
         g.id,
         g.name
       FROM user_group_members ugm
       INNER JOIN user_groups g ON g.id = ugm.group_id
       WHERE ugm.user_id = ANY($1::uuid[])`,
      [items.map((row) => row.id)],
    );
    const groupsByUser = new Map();
    groupsResult.rows.forEach((row) => {
      const key = String(row.userId);
      const list = groupsByUser.get(key) || [];
      list.push({ id: row.id, name: row.name });
      groupsByUser.set(key, list);
    });
    items.forEach((item) => {
      item.groups = groupsByUser.get(String(item.id)) || [];
    });
  }
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
  const result = await dbQuery(
    `SELECT
       g.id,
       g.name,
       g.created_at AS "createdAt",
       COALESCE(
         JSON_AGG(JSON_BUILD_OBJECT('id', u.id, 'name', u.name, 'email', u.email))
         FILTER (WHERE u.id IS NOT NULL),
         '[]'::json
       ) AS members
     FROM user_groups g
     LEFT JOIN user_group_members ugm ON ugm.group_id = g.id
     LEFT JOIN users u ON u.id = ugm.user_id AND u.is_active = TRUE
     GROUP BY g.id
     ORDER BY g.name ASC`,
  );
  return result.rows;
}

async function setGroupMembers(groupId, userIds) {
  await dbQuery("DELETE FROM user_group_members WHERE group_id = $1", [
    asUuid(groupId),
  ]);
  const normalized = [
    ...new Set(
      (userIds || []).map((id) => asUuid(id)).filter((id) => id != null),
    ),
  ];
  if (!normalized.length) return;
  const activeUsersResult = await dbQuery(
    `SELECT id
     FROM users
     WHERE is_active = TRUE
       AND id = ANY($1::uuid[])`,
    [normalized],
  );
  const activeUserIds = activeUsersResult.rows.map((row) => String(row.id));
  if (!activeUserIds.length) return;
  const valuesSql = activeUserIds
    .map((_, index) => `($1, $${index + 2})`)
    .join(", ");
  await dbQuery(
    `INSERT INTO user_group_members (group_id, user_id) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
    [asUuid(groupId), ...activeUserIds],
  );
}

export async function createUserGroup({ name, memberIds = [] }) {
  const result = await dbQuery(
    `INSERT INTO user_groups (name) VALUES ($1)
     RETURNING id`,
    [String(name || "").trim()],
  );
  const groupId = result.rows[0]?.id;
  if (groupId && memberIds) await setGroupMembers(groupId, memberIds);
  const groups = await getUserGroups();
  return groups.find((g) => String(g.id) === String(groupId)) || null;
}

export async function updateUserGroup(groupId, patch = {}) {
  if (patch.name !== undefined) {
    await dbQuery(`UPDATE user_groups SET name = $1 WHERE id = $2`, [
      String(patch.name).trim(),
      asUuid(groupId),
    ]);
  }
  if (patch.memberIds !== undefined) {
    await setGroupMembers(groupId, patch.memberIds);
  }
  const groups = await getUserGroups();
  return groups.find((g) => String(g.id) === String(groupId)) || null;
}

export async function deleteUserGroup(groupId) {
  const normalizedGroupId = asUuid(groupId);
  const settingsRows = await dbQuery(
    `SELECT project_id AS "projectId", workflow_rules AS "workflowRules"
     FROM project_settings`,
  );
  for (const row of settingsRows.rows) {
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
      await dbQuery(
        `UPDATE project_settings
         SET workflow_rules = $1::jsonb, updated_at = NOW()
         WHERE project_id = $2`,
        [JSON.stringify({ transitions: nextTransitions }), asUuid(row.projectId)],
      );
    }
  }
  const result = await dbQuery("DELETE FROM user_groups WHERE id = $1", [
    normalizedGroupId,
  ]);
  return result.rowCount > 0;
}

export async function createUser({
  name,
  email,
  passwordHash,
  role,
  mustChangePassword = false,
}) {
  const result = await dbQuery(
    `INSERT INTO users (name, email, password_hash, role, must_change_password, password_changed_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NULL ELSE NOW() END, NOW())
     RETURNING id, name, email, role, is_active AS "isActive",
               disabled_at AS "disabledAt", disable_reason AS "disableReason",
               must_change_password AS "mustChangePassword",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [name, normalizeEmail(email), passwordHash, role || "member", mustChangePassword === true],
  );
  return result.rows[0];
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

  const fields = [];
  const params = [];
  let idx = 1;
  for (const [key, dbKey] of Object.entries(allowedMap)) {
    if (patch[key] === undefined) continue;
    fields.push(`${dbKey} = $${idx}`);
    if (key === "email") {
      params.push(normalizeEmail(patch[key]));
    } else {
      params.push(patch[key]);
    }
    idx += 1;
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = NOW()`);
  params.push(userId);

  const result = await dbQuery(
    `UPDATE users SET ${fields.join(", ")}
     WHERE id = $${idx}
     RETURNING id, name, email, role, is_active AS "isActive",
               disabled_at AS "disabledAt", disable_reason AS "disableReason",
               must_change_password AS "mustChangePassword",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    params,
  );
  return result.rows[0] || null;
}

export async function disableUser(userId, actorUserId, reason = "") {
  await dbQuery(`DELETE FROM user_group_members WHERE user_id = $1`, [asUuid(userId)]);
  const result = await dbQuery(
    `UPDATE users
     SET is_active = FALSE,
         disabled_at = NOW(),
         disabled_by = $2,
         disable_reason = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, is_active AS "isActive",
               disabled_at AS "disabledAt", disable_reason AS "disableReason",
               must_change_password AS "mustChangePassword",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [asUuid(userId), asUuid(actorUserId, null), String(reason || "").trim()],
  );
  return result.rows[0] || null;
}

export async function enableUser(userId) {
  const result = await dbQuery(
    `UPDATE users
     SET is_active = TRUE,
         disabled_at = NULL,
         disabled_by = NULL,
         disable_reason = '',
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, is_active AS "isActive",
               disabled_at AS "disabledAt", disable_reason AS "disableReason",
               must_change_password AS "mustChangePassword",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [asUuid(userId)],
  );
  return result.rows[0] || null;
}

export async function deleteUser(userId) {
  const result = await dbQuery("DELETE FROM users WHERE id = $1", [asUuid(userId)]);
  return result.rowCount > 0;
}

export async function findUserAuthByEmail(email) {
  const result = await dbQuery(
    `SELECT id, name, email, role, password_hash, is_active AS "isActive",
            must_change_password AS "mustChangePassword"
     FROM users
     WHERE email = $1`,
    [normalizeEmail(email)],
  );
  return result.rows[0] || null;
}

export async function getUserAuthById(userId) {
  const result = await dbQuery(
    `SELECT id, name, email, role, password_hash, is_active AS "isActive",
            must_change_password AS "mustChangePassword"
     FROM users
     WHERE id = $1`,
    [asUuid(userId)],
  );
  return result.rows[0] || null;
}

export async function createPasswordResetToken({ userId, tokenHash, expiresAt, ipAddress = "" }) {
  const result = await dbQuery(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_by_ip)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id AS "userId", token_hash AS "tokenHash",
               expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt"`,
    [asUuid(userId), tokenHash, expiresAt, String(ipAddress || "").slice(0, 120)],
  );
  return result.rows[0] || null;
}

export async function getPasswordResetToken(tokenHash) {
  const result = await dbQuery(
    `SELECT id, user_id AS "userId", token_hash AS "tokenHash",
            expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt"
     FROM password_reset_tokens
     WHERE token_hash = $1`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

export async function consumePasswordResetToken(tokenId) {
  const result = await dbQuery(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE id = $1 AND used_at IS NULL
     RETURNING id`,
    [asUuid(tokenId)],
  );
  return Boolean(result.rows[0]);
}

export async function invalidatePasswordResetTokensForUser(userId) {
  await dbQuery(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [asUuid(userId)],
  );
}

export async function logUserAudit({
  actorUserId = null,
  targetUserId = null,
  action,
  metadata = {},
}) {
  await dbQuery(
    `INSERT INTO user_audit_log (actor_user_id, target_user_id, action, metadata_json)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      asUuid(actorUserId, null),
      asUuid(targetUserId, null),
      String(action || "").trim(),
      JSON.stringify(metadata || {}),
    ],
  );
}

export async function getSprints(filters = {}) {
  const where = [];
  const params = [];
  let idx = 1;
  if (filters.projectId) {
    where.push(`project_id = $${idx}`);
    params.push(asUuid(filters.projectId));
    idx += 1;
  }
  const result = await dbQuery(
    `SELECT id, name, project_id AS "projectId", start_date AS "startDate", end_date AS "endDate",
            status, created_at AS "createdAt"
     FROM sprints
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY start_date ASC NULLS LAST, end_date ASC NULLS LAST, name ASC`,
    params,
  );
  return result.rows;
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
  query = dbQuery,
) {
  const pid = asUuid(projectId);
  const normalized = normalizeMemberIds(memberIds);
  let adminSet = new Set();
  if (projectAdminMemberIds !== undefined) {
    normalizeMemberIds(projectAdminMemberIds).forEach((uid) =>
      adminSet.add(String(uid)),
    );
  } else if (normalized.length) {
    const prev = await query(
      `SELECT user_id, is_project_admin FROM project_members WHERE project_id = $1`,
      [pid],
    );
    const prevAdmin = new Set(
      prev.rows
        .filter((r) => r.is_project_admin === true)
        .map((r) => String(r.user_id)),
    );
    normalized.forEach((uid) => {
      if (prevAdmin.has(String(uid))) adminSet.add(String(uid));
    });
  }

  const activeUsersResult = await query(
    `SELECT id
     FROM users
     WHERE is_active = TRUE
       AND id = ANY($1::uuid[])`,
    [normalized],
  );
  const activeUserIds = activeUsersResult.rows.map((row) => String(row.id));
  const activeUserSet = new Set(activeUserIds.map((id) => String(id)));
  if (activeUserIds.length) {
    const placeholders = [];
    const params = [pid];
    let idx = 2;
    activeUserIds.forEach((uid) => {
      placeholders.push(`($1, $${idx++}, $${idx++})`);
      params.push(uid);
      params.push(adminSet.has(String(uid)));
    });
    await query(
      `INSERT INTO project_members (project_id, user_id, is_project_admin) VALUES ${placeholders.join(", ")}
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET is_project_admin = EXCLUDED.is_project_admin`,
      params,
    );
  }
  const usersToKeep = activeUserIds.length
    ? activeUserIds
    : ["00000000-0000-0000-0000-000000000000"];
  await query(
    `DELETE FROM project_members
     WHERE project_id = $1
       AND NOT (user_id = ANY($2::uuid[]))`,
    [pid, usersToKeep],
  );
  if (projectAdminMemberIds !== undefined && activeUserSet.size > 0) {
    const admins = [...adminSet].filter((id) => activeUserSet.has(String(id)));
    await query(
      `UPDATE project_members
       SET is_project_admin = (user_id = ANY($2::uuid[]))
       WHERE project_id = $1`,
      [pid, admins],
    );
  }
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
  let whereExclusion = "";
  if (excludeProjectId) {
    params.push(asUuid(excludeProjectId));
    whereExclusion = ` AND id <> $3`;
  }
  const result = await dbQuery(
    `SELECT id, name, project_key AS "projectKey"
     FROM projects
     WHERE (
       LOWER(TRIM(name)) = LOWER($1)
       OR LOWER(TRIM(project_key)) = LOWER($2)
     )${whereExclusion}
     LIMIT 1`,
    params,
  );
  const existing = result.rows[0];
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
  const projectsResult = await dbQuery(
    `SELECT
       p.id,
       p.name,
       p.project_key AS "projectKey",
       p.description,
       p.created_at AS "createdAt"
     FROM projects p
     ORDER BY p.id DESC`,
  );
  const projects = projectsResult.rows;
  if (!projects.length) return projects;
  const projectIds = projects.map((project) => project.id);
  const membersResult = await dbQuery(
    `SELECT
       pm.project_id AS "projectId",
       u.id,
       u.name,
       u.email,
       COALESCE(pm.is_project_admin, FALSE) AS "isProjectAdmin"
     FROM project_members pm
     INNER JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ANY($1::uuid[])
       AND u.is_active = TRUE
     ORDER BY pm.project_id ASC, LOWER(TRIM(COALESCE(u.name, ''))) ASC, u.id ASC`,
    [projectIds],
  );
  const membersByProject = new Map();
  membersResult.rows.forEach((row) => {
    const key = String(row.projectId);
    const list = membersByProject.get(key) || [];
    list.push({
      id: row.id,
      name: row.name,
      email: row.email,
      isProjectAdmin: row.isProjectAdmin,
    });
    membersByProject.set(key, list);
  });
  return projects.map((project) => ({
    ...project,
    members: membersByProject.get(String(project.id)) || [],
  }));
}

export async function getProjectsPage({ limit = 30, cursor = "" } = {}) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 30, 200));
  const decoded = decodeCursor(cursor);
  const params = [];
  let where = "";
  if (decoded) {
    params.push(decoded.updatedAt, decoded.id);
    where =
      "WHERE (p.created_at, p.id) < ($1::timestamptz, $2::uuid)";
  }
  params.push(pageSize + 1);
  const limitPlaceholder = `$${params.length}`;
  const result = await dbQuery(
    `SELECT
       p.id,
       p.name,
       p.project_key AS "projectKey",
       p.description,
       p.created_at AS "createdAt"
     FROM projects p
     ${where}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ${limitPlaceholder}`,
    params,
  );
  const hasMore = result.rows.length > pageSize;
  const items = hasMore ? result.rows.slice(0, pageSize) : result.rows;
  if (items.length) {
    const membersResult = await dbQuery(
      `SELECT
         pm.project_id AS "projectId",
         u.id,
         u.name,
         u.email,
         COALESCE(pm.is_project_admin, FALSE) AS "isProjectAdmin"
       FROM project_members pm
       INNER JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ANY($1::uuid[])
         AND u.is_active = TRUE
       ORDER BY pm.project_id ASC, LOWER(TRIM(COALESCE(u.name, ''))) ASC, u.id ASC`,
      [items.map((row) => row.id)],
    );
    const membersByProject = new Map();
    membersResult.rows.forEach((row) => {
      const key = String(row.projectId);
      const list = membersByProject.get(key) || [];
      list.push({
        id: row.id,
        name: row.name,
        email: row.email,
        isProjectAdmin: row.isProjectAdmin,
      });
      membersByProject.set(key, list);
    });
    items.forEach((item) => {
      item.members = membersByProject.get(String(item.id)) || [];
    });
  }
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
  const result = await dbQuery(
    `SELECT
       p.id,
       p.name,
       p.project_key AS "projectKey",
       p.description,
       p.created_at AS "createdAt",
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id', u.id,
             'name', u.name,
             'email', u.email,
             'isProjectAdmin', COALESCE(pm.is_project_admin, FALSE)
           )
         ) FILTER (WHERE u.id IS NOT NULL),
         '[]'::json
       ) AS members
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id
     LEFT JOIN users u ON u.id = pm.user_id AND u.is_active = TRUE
     WHERE p.id = $1
     GROUP BY p.id
     LIMIT 1`,
    [pid],
  );
  return result.rows[0] || null;
}

export async function createProject({
  name,
  projectKey,
  description,
  memberIds,
}) {
  await assertUniqueProjectIdentity({ name, projectKey });
  const result = await dbQuery(
    `INSERT INTO projects (name, project_key, description)
     VALUES ($1, $2, $3)
     RETURNING id, name, project_key AS "projectKey", description, created_at AS "createdAt"`,
    [name, projectKey, description || ""],
  );
  const project = result.rows[0];
  await setProjectMembers(project.id, memberIds || []);
  await ensureProjectSettingsRow(project.id);
  const projects = await getProjects();
  return projects.find((item) => item.id === project.id) || project;
}

export async function updateProject(projectId, patch) {
  const projectIdNormalized = asUuid(projectId);
  const current = await dbQuery(
    `SELECT id, name, project_key AS "projectKey"
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectIdNormalized],
  );
  const currentProject = current.rows[0];
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

  const fields = [];
  const params = [];
  let idx = 1;

  if (patch.name !== undefined) {
    fields.push(`name = $${idx}`);
    params.push(patch.name);
    idx += 1;
  }
  if (patch.projectKey !== undefined) {
    fields.push(`project_key = $${idx}`);
    params.push(patch.projectKey);
    idx += 1;
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${idx}`);
    params.push(patch.description);
    idx += 1;
  }

  await withDbClient(async (client) => {
    const query = (text, paramsArg = []) => client.query(text, paramsArg);
    await query("BEGIN");
    try {
      if (fields.length) {
        params.push(projectIdNormalized);
        const updated = await query(
          `UPDATE projects SET ${fields.join(", ")}
           WHERE id = $${idx}
           RETURNING id`,
          params,
        );
        if (!updated.rows[0]) throw new Error("Project not found");
      }
      if (patch.memberIds !== undefined) {
        await setProjectMembers(
          projectId,
          patch.memberIds,
          patch.projectAdminMemberIds,
          query,
        );
      } else if (patch.projectAdminMemberIds !== undefined) {
        await query(
          `UPDATE project_members
           SET is_project_admin = (user_id = ANY($2::uuid[]))
           WHERE project_id = $1`,
          [asUuid(projectId), normalizeMemberIds(patch.projectAdminMemberIds)],
        );
      }
      await query("COMMIT");
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  });
  return getProjectById(projectIdNormalized);
}

export async function userCanManageProject(userId, projectId, userRole = null) {
  const uid = asUuid(userId);
  const pid = asUuid(projectId);
  if (!uid || !pid) return false;
  if (String(userRole || "").toLowerCase() === "admin") return true;
  const pm = await dbQuery(
    `SELECT 1 FROM project_members
     WHERE project_id = $1 AND user_id = $2 AND is_project_admin = TRUE
     LIMIT 1`,
    [pid, uid],
  );
  return Boolean(pm.rows[0]);
}

export async function getSprintProjectId(sprintId) {
  const sid = asUuid(sprintId);
  if (!sid) return null;
  const r = await dbQuery(
    `SELECT project_id AS "projectId" FROM sprints WHERE id = $1 LIMIT 1`,
    [sid],
  );
  return r.rows[0]?.projectId || null;
}

export async function deleteProject(projectId) {
  const result = await dbQuery("DELETE FROM projects WHERE id = $1", [
    projectId,
  ]);
  return result.rowCount > 0;
}

export async function projectExists(projectId) {
  const result = await dbQuery("SELECT 1 FROM projects WHERE id = $1 LIMIT 1", [
    asUuid(projectId),
  ]);
  return result.rows.length > 0;
}

async function getProjectMemberIds(projectId) {
  const result = await dbQuery(
    `SELECT user_id AS "userId" FROM project_members WHERE project_id = $1`,
    [asUuid(projectId)],
  );
  return result.rows.map((r) => String(r.userId));
}

async function getUserGroupIdsForProjectMember(projectId, userId) {
  const result = await dbQuery(
    `SELECT ugm.group_id AS "groupId"
     FROM user_group_members ugm
     WHERE ugm.user_id = $1
       AND EXISTS (
         SELECT 1 FROM project_members pm
         WHERE pm.project_id = $2 AND pm.user_id = ugm.user_id
       )`,
    [asUuid(userId), asUuid(projectId)],
  );
  return result.rows.map((row) => String(row.groupId));
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
  const existingSprintByName = await dbQuery(
    `SELECT 1
     FROM sprints
     WHERE project_id = $1 AND LOWER(TRIM(name)) = LOWER($2)
     LIMIT 1`,
    [normalizedProjectId, normalizedName],
  );
  if (existingSprintByName.rows[0]) {
    throw new Error(SPRINT_NAME_CONFLICT_MESSAGE);
  }
  if (normalizedStatus === "active") {
    const conflict = await dbQuery(
      `SELECT id
       FROM sprints
       WHERE project_id = $1 AND status = 'active'
       LIMIT 1`,
      [normalizedProjectId],
    );
    if (conflict.rows[0]) {
      throw new Error(ACTIVE_SPRINT_CONFLICT_MESSAGE);
    }
  }
  const result = await dbQuery(
    `INSERT INTO sprints (name, project_id, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, project_id AS "projectId", start_date AS "startDate", end_date AS "endDate",
               status, created_at AS "createdAt"`,
    [
      normalizedName,
      normalizedProjectId,
      startDate || null,
      endDate || null,
      normalizedStatus,
    ],
  );
  return result.rows[0];
}

export async function updateSprint(id, patch) {
  const currentResult = await dbQuery(
    `SELECT project_id AS "projectId", status
     FROM sprints
     WHERE id = $1
     LIMIT 1`,
    [asUuid(id)],
  );
  const currentSprint = currentResult.rows[0];
  if (!currentSprint) return null;

  const nextProjectId =
    patch.projectId !== undefined
      ? asUuid(patch.projectId)
      : asUuid(currentSprint.projectId);
  const nextStatus =
    patch.status !== undefined ? patch.status : currentSprint.status;
  const nextName = patch.name !== undefined ? patch.name : undefined;
  if (nextStatus === "active") {
    const conflict = await dbQuery(
      `SELECT id
       FROM sprints
       WHERE project_id = $1 AND status = 'active' AND id <> $2
       LIMIT 1`,
      [nextProjectId, asUuid(id)],
    );
    if (conflict.rows[0]) {
      throw new Error(ACTIVE_SPRINT_CONFLICT_MESSAGE);
    }
  }
  if (nextName !== undefined) {
    const sprintNameConflict = await dbQuery(
      `SELECT 1
       FROM sprints
       WHERE project_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND id <> $3
       LIMIT 1`,
      [nextProjectId, String(nextName || "").trim(), asUuid(id)],
    );
    if (sprintNameConflict.rows[0]) {
      throw new Error(SPRINT_NAME_CONFLICT_MESSAGE);
    }
  }

  const fields = [];
  const params = [];
  let idx = 1;

  for (const [incomingKey, value] of Object.entries(patch)) {
    const dbKeyMap = {
      name: "name",
      projectId: "project_id",
      startDate: "start_date",
      endDate: "end_date",
      status: "status",
    };
    const dbKey = dbKeyMap[incomingKey];
    if (!dbKey) continue;
    fields.push(`${dbKey} = $${idx}`);
    params.push(incomingKey === "projectId" ? asUuid(value) : value);
    idx += 1;
  }

  if (fields.length === 0) return null;
  params.push(id);

  const result = await dbQuery(
    `UPDATE sprints SET ${fields.join(", ")}
     WHERE id = $${idx}
     RETURNING id, name, project_id AS "projectId", start_date AS "startDate", end_date AS "endDate",
               status, created_at AS "createdAt"`,
    params,
  );
  return result.rows[0] || null;
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

function normalizeAssigneeFilterValues(filters = {}) {
  const explicit = Array.isArray(filters.assigneeIds)
    ? filters.assigneeIds
    : [];
  const legacy =
    filters.assigneeId != null && String(filters.assigneeId).trim() !== ""
      ? [filters.assigneeId]
      : [];
  return [
    ...new Set(
      [...explicit, ...legacy]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

function buildTaskWhereClause(filters = {}, { includeCursor = false, cursor = "" } = {}) {
  const where = [];
  const params = [];
  let idx = 1;

  if (filters.sprintId === "backlog") {
    where.push("t.sprint_id IS NULL");
  } else if (filters.sprintId != null) {
    where.push(`t.sprint_id = $${idx}`);
    params.push(asUuid(filters.sprintId));
    idx += 1;
  }
  if (filters.projectId) {
    where.push(`t.project_id = $${idx}`);
    params.push(asUuid(filters.projectId));
    idx += 1;
  }
  if (filters.status) {
    where.push(`t.status = $${idx}`);
    params.push(filters.status);
    idx += 1;
  }
  const assigneeFilters = normalizeAssigneeFilterValues(filters);
  if (assigneeFilters.length > 0) {
    const includeUnassigned = assigneeFilters.includes("unassigned");
    const assignedIds = assigneeFilters
      .filter((value) => value !== "unassigned")
      .map((value) => asUuid(value, null))
      .filter(Boolean);
    if (includeUnassigned && assignedIds.length > 0) {
      where.push(`(t.assignee_id IS NULL OR t.assignee_id = ANY($${idx}::uuid[]))`);
      params.push(assignedIds);
      idx += 1;
    } else if (includeUnassigned) {
      where.push("t.assignee_id IS NULL");
    } else if (assignedIds.length > 0) {
      where.push(`t.assignee_id = ANY($${idx}::uuid[])`);
      params.push(assignedIds);
      idx += 1;
    }
  }
  if (filters.limitProjectsToMemberUserId) {
    where.push(
      `EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $${idx})`,
    );
    params.push(asUuid(filters.limitProjectsToMemberUserId));
    idx += 1;
  }
  if (filters.priority) {
    where.push(`t.priority = $${idx}`);
    params.push(filters.priority);
    idx += 1;
  }
  if (filters.type) {
    where.push(`t.type = $${idx}`);
    params.push(String(filters.type).trim().toLowerCase());
    idx += 1;
  }
  if (filters.label) {
    where.push(`LOWER(t.label) = LOWER($${idx})`);
    params.push(String(filters.label).trim());
    idx += 1;
  }
  if (filters.search) {
    where.push(
      `(t.title ILIKE $${idx} OR CONCAT(p.project_key, '-', t.task_number) ILIKE $${idx})`,
    );
    params.push(`%${String(filters.search).trim()}%`);
    idx += 1;
  }
  if (filters.activeSprintOnly === true) {
    where.push(
      `EXISTS (
        SELECT 1
        FROM sprints s_active
        WHERE s_active.id = t.sprint_id
          AND s_active.status = 'active'
      )`,
    );
  }
  if (filters.backlogScope === true) {
    const includeSprintId = asUuid(filters.includeSprintId, null);
    if (includeSprintId) {
      where.push(
        `(t.sprint_id IS NULL OR EXISTS (
          SELECT 1
          FROM sprints s_scope
          WHERE s_scope.id = t.sprint_id
            AND (s_scope.status IN ('active', 'planned') OR s_scope.id = $${idx})
        ))`,
      );
      params.push(includeSprintId);
      idx += 1;
    } else {
      where.push(
        `(t.sprint_id IS NULL OR EXISTS (
          SELECT 1
          FROM sprints s_scope
          WHERE s_scope.id = t.sprint_id
            AND s_scope.status IN ('active', 'planned')
        ))`,
      );
    }
  }
  if (includeCursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      where.push(
        `(t.updated_at, t.id) < ($${idx}::timestamptz, $${idx + 1}::uuid)`,
      );
      params.push(decoded.updatedAt, decoded.id);
      idx += 2;
    }
  }
  return { where, params, idx };
}

export async function getTasks(filters = {}) {
  const { where, params } = buildTaskWhereClause(filters);

  const query = `
    SELECT t.id, t.title, t.description, t.acceptance_criteria AS "acceptanceCriteria", t.label, t.version, t.type, t.priority, t.status,
           t.story_points AS "storyPoints", t.due_date AS "dueDate", t.assignee_id AS "assigneeId",
           t.sprint_id AS "sprintId", t.project_id AS "projectId", t.task_number AS "taskNumber",
           p.project_key AS "projectKey",
           t.created_by AS "createdBy",
           t.created_at AS "createdAt", t.updated_at AS "updatedAt"
    FROM tasks t
    INNER JOIN projects p ON p.id = t.project_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY t.updated_at DESC, t.id DESC
  `;
  const result = await dbQuery(query, params);
  return result.rows.map(mapTaskRow);
}

export async function getTasksPage(
  filters = {},
  { limit = 50, cursor = "" } = {},
) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 50, 200));
  const { where, params, idx } = buildTaskWhereClause(filters, {
    includeCursor: true,
    cursor,
  });
  params.push(pageSize + 1);
  const query = `
    SELECT t.id, t.title, t.description, t.acceptance_criteria AS "acceptanceCriteria", t.label, t.version, t.type, t.priority, t.status,
           t.story_points AS "storyPoints", t.due_date AS "dueDate", t.assignee_id AS "assigneeId",
           t.sprint_id AS "sprintId", t.project_id AS "projectId", t.task_number AS "taskNumber",
           p.project_key AS "projectKey",
           t.created_by AS "createdBy",
           t.created_at AS "createdAt", t.updated_at AS "updatedAt"
    FROM tasks t
    INNER JOIN projects p ON p.id = t.project_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT $${idx}
  `;
  const result = await dbQuery(query, params);
  const hasMore = result.rows.length > pageSize;
  const items = (hasMore ? result.rows.slice(0, pageSize) : result.rows).map(
    mapTaskRow,
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

export async function getTaskStatusTotals(filters = {}) {
  const { where, params } = buildTaskWhereClause(filters);
  const result = await dbQuery(
    `SELECT t.status, COUNT(*)::int AS count
     FROM tasks t
     INNER JOIN projects p ON p.id = t.project_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY t.status`,
    params,
  );
  const totals = {};
  result.rows.forEach((row) => {
    totals[String(row.status || "")] = Number(row.count || 0);
  });
  return totals;
}

export async function searchTasks(filters = {}, { limit = 12 } = {}) {
  const pageSize = Math.max(1, Math.min(Number(limit) || 12, 50));
  const { where, params, idx } = buildTaskWhereClause(filters);
  params.push(pageSize);
  const result = await dbQuery(
    `SELECT
       t.id,
       t.title,
       t.project_id AS "projectId",
       t.task_number AS "taskNumber",
       p.project_key AS "projectKey"
     FROM tasks t
     INNER JOIN projects p ON p.id = t.project_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT $${idx}`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    taskNumber: row.taskNumber,
    taskKey:
      row.projectKey && row.taskNumber != null
        ? `${row.projectKey}-${row.taskNumber}`
        : null,
  }));
}

export async function getTaskById(id) {
  const result = await dbQuery(
    `SELECT t.id, t.title, t.description, t.acceptance_criteria AS "acceptanceCriteria", t.label, t.version, t.type, t.priority, t.status,
            t.story_points AS "storyPoints", t.due_date AS "dueDate", t.assignee_id AS "assigneeId",
            t.sprint_id AS "sprintId", t.project_id AS "projectId", t.task_number AS "taskNumber",
            p.project_key AS "projectKey",
            t.created_by AS "createdBy",
            t.created_at AS "createdAt", t.updated_at AS "updatedAt"
     FROM tasks t
     INNER JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1`,
    [asUuid(id)],
  );
  return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
}

async function allocateNextTaskNumber(projectId, query = dbQuery) {
  const pid = asUuid(projectId, null);
  if (!pid) throw new Error("projectId is required");
  const result = await query(
    `INSERT INTO project_task_seq (project_id, last_value)
     VALUES ($1, 1)
     ON CONFLICT (project_id)
     DO UPDATE SET last_value = project_task_seq.last_value + 1
     RETURNING last_value AS "lastValue"`,
    [pid],
  );
  return Number(result.rows[0].lastValue);
}

export async function createTask(payload, createdBy) {
  return withDbClient(async (client) => {
    const query = (text, paramsArg = []) => client.query(text, paramsArg);
    await query("BEGIN");
    try {
      const taskNumber = await allocateNextTaskNumber(payload.projectId, query);
      const result = await query(
        `INSERT INTO tasks (
            title, description, acceptance_criteria, label, version, type, priority, status, story_points, due_date, assignee_id, sprint_id, project_id, created_by, task_number
         ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id, title, description, acceptance_criteria AS "acceptanceCriteria", label, version, type, priority, status,
                   story_points AS "storyPoints", due_date AS "dueDate", assignee_id AS "assigneeId",
                   sprint_id AS "sprintId", project_id AS "projectId", task_number AS "taskNumber",
                   created_by AS "createdBy",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          payload.title,
          payload.description || "",
          JSON.stringify(normalizeAcceptanceCriteria(payload.acceptanceCriteria)),
          payload.label || "",
          payload.version || "",
          normalizeTaskType(payload.type),
          normalizeTaskPriority(payload.priority),
          normalizeTaskStatus(payload.status),
          asInt(payload.storyPoints, null),
          payload.dueDate ? String(payload.dueDate) : null,
          asUuid(payload.assigneeId),
          asUuid(payload.sprintId),
          asUuid(payload.projectId),
          asUuid(createdBy),
          taskNumber,
        ],
      );
      const pk = await query(
        `SELECT project_key AS "projectKey" FROM projects WHERE id = $1`,
        [asUuid(payload.projectId)],
      );
      await query("COMMIT");
      return mapTaskRow({ ...result.rows[0], projectKey: pk.rows[0]?.projectKey });
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  });
}

export async function updateTask(taskId, patch) {
  const existing = await getTaskById(taskId);
  if (!existing) return null;
  const expectedUpdatedAt = String(patch?.expectedUpdatedAt || "").trim();
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
      conflictError.code = "TASK_CONFLICT";
      throw conflictError;
    }
  }

  if (patch.status !== undefined) {
    const settings = await getProjectSettings(existing.projectId);
    if (!isValidWorkflowStatus(normalizeTaskStatus(patch.status), settings)) {
      return null;
    }
  }

  let allocatedTaskNumber = null;
  if (patch.projectId !== undefined) {
    if (
      String(asUuid(patch.projectId)) !== String(asUuid(existing.projectId))
    ) {
      allocatedTaskNumber = await allocateNextTaskNumber(patch.projectId);
    }
  }

  const allowedMap = {
    title: "title",
    description: "description",
    acceptanceCriteria: "acceptance_criteria",
    label: "label",
    version: "version",
    type: "type",
    priority: "priority",
    status: "status",
    storyPoints: "story_points",
    dueDate: "due_date",
    assigneeId: "assignee_id",
    sprintId: "sprint_id",
    projectId: "project_id",
  };

  const fields = [];
  const params = [];
  let idx = 1;
  const normalizeDateOnly = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    return raw.includes("T") ? raw.split("T")[0] : raw;
  };
  const normalizeUuidString = (value) => String(asUuid(value, null) || "");
  const existingAcceptanceJson = JSON.stringify(
    normalizeAcceptanceCriteria(existing.acceptanceCriteria),
  );
  for (const [key, dbKey] of Object.entries(allowedMap)) {
    if (patch[key] === undefined) continue;
    let nextValue;
    let isChanged = true;
    if (key === "storyPoints") {
      nextValue = asInt(patch[key], null);
      isChanged = nextValue !== asInt(existing.storyPoints, null);
    } else if (key === "acceptanceCriteria") {
      nextValue = JSON.stringify(normalizeAcceptanceCriteria(patch[key]));
      isChanged = nextValue !== existingAcceptanceJson;
    } else if (key === "priority") {
      nextValue = normalizeTaskPriority(patch[key]);
      isChanged = nextValue !== normalizeTaskPriority(existing.priority);
    } else if (key === "type") {
      nextValue = normalizeTaskType(patch[key]);
      isChanged = nextValue !== normalizeTaskType(existing.type);
    } else if (key === "status") {
      nextValue = normalizeTaskStatus(patch[key]);
      isChanged = nextValue !== normalizeTaskStatus(existing.status);
    } else if (key === "dueDate") {
      nextValue = patch[key] ? String(patch[key]) : null;
      isChanged =
        normalizeDateOnly(nextValue) !== normalizeDateOnly(existing.dueDate);
    } else if (
      key === "assigneeId" ||
      key === "sprintId" ||
      key === "projectId"
    ) {
      nextValue = asUuid(patch[key], null);
      isChanged =
        normalizeUuidString(nextValue) !== normalizeUuidString(existing[key]);
    } else {
      nextValue = patch[key];
      isChanged = String(nextValue ?? "") !== String(existing[key] ?? "");
    }
    if (!isChanged) continue;
    fields.push(`${dbKey} = $${idx}`);
    params.push(nextValue);
    idx += 1;
  }
  if (allocatedTaskNumber != null) {
    fields.push(`task_number = $${idx}`);
    params.push(allocatedTaskNumber);
    idx += 1;
  }
  if (fields.length === 0) return existing;
  fields.push("updated_at = NOW()");
  params.push(taskId);

  const result = await dbQuery(
    `UPDATE tasks t
     SET ${fields.join(", ")}
     FROM projects p
     WHERE t.id = $${idx} AND p.id = t.project_id
     RETURNING t.id, t.title, t.description, t.acceptance_criteria AS "acceptanceCriteria", t.label, t.version, t.type, t.priority, t.status,
               t.story_points AS "storyPoints", t.due_date AS "dueDate", t.assignee_id AS "assigneeId",
               t.sprint_id AS "sprintId", t.project_id AS "projectId", t.created_by AS "createdBy",
               t.created_at AS "createdAt", t.updated_at AS "updatedAt",
               t.task_number AS "taskNumber", p.project_key AS "projectKey"`,
    params,
  );
  return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
}

export async function deleteTask(taskId) {
  const result = await dbQuery("DELETE FROM tasks WHERE id = $1", [taskId]);
  return result.rowCount > 0;
}

export async function getTaskComments(taskId) {
  const result = await dbQuery(
    `SELECT c.id, c.task_id AS "taskId", c.user_id AS "userId", c.body,
            c.created_at AS "createdAt", u.name AS "userName"
     FROM task_comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1
     ORDER BY c.id ASC`,
    [taskId],
  );
  return result.rows;
}

export async function addTaskComment(taskId, userId, body) {
  const result = await dbQuery(
    `INSERT INTO task_comments (task_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, task_id AS "taskId", user_id AS "userId", body, created_at AS "createdAt"`,
    [taskId, userId, body],
  );
  return result.rows[0];
}

export async function updateTaskComment(taskId, commentId, userId, body) {
  const result = await dbQuery(
    `UPDATE task_comments
        SET body = $1
      WHERE id = $2 AND task_id = $3 AND user_id = $4
      RETURNING id, task_id AS "taskId", user_id AS "userId", body, created_at AS "createdAt"`,
    [body, commentId, taskId, userId],
  );
  return result.rows[0] || null;
}

export async function deleteTaskComment(taskId, commentId, userId) {
  const result = await dbQuery(
    `DELETE FROM task_comments
      WHERE id = $1 AND task_id = $2 AND user_id = $3`,
    [commentId, taskId, userId],
  );
  return result.rowCount > 0;
}

export async function addTaskActivity(taskId, userId, action, meta = {}) {
  await dbQuery(
    `INSERT INTO task_activity (task_id, user_id, action, meta)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [taskId, userId || null, action, JSON.stringify(meta)],
  );
}

export async function getTaskActivity(taskId) {
  const result = await dbQuery(
    `SELECT a.id, a.task_id AS "taskId", a.user_id AS "userId", a.action, a.meta,
            a.created_at AS "createdAt", u.name AS "userName"
     FROM task_activity a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.task_id = $1
     ORDER BY a.id DESC`,
    [taskId],
  );
  return result.rows;
}

export async function getTaskLinkedDev(taskId) {
  const result = await dbQuery(
    `SELECT links.artifact_type AS "artifactType",
            links.external_id AS "externalId",
            links.owner AS owner,
            links.repo AS repo,
            links.url AS url,
            links.title_or_message AS "titleOrMessage",
            links.status AS status,
            links.payload_json AS "payload",
            COALESCE(repo_cfg.default_branch, 'develop') AS "defaultBranch",
            links.updated_at AS "updatedAt"
     FROM task_dev_links links
     LEFT JOIN tasks t ON t.id = links.task_id
     LEFT JOIN project_github_repos repo_cfg
       ON repo_cfg.project_id = t.project_id
      AND LOWER(repo_cfg.owner) = LOWER(links.owner)
      AND LOWER(repo_cfg.repo) = LOWER(links.repo)
      AND repo_cfg.is_enabled = TRUE
     WHERE links.task_id = $1
     ORDER BY links.updated_at DESC`,
    [asUuid(taskId)],
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
  for (const row of result.rows) {
    const payload =
      row.payload && typeof row.payload === "object" ? row.payload : {};
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
      defaultBranch: row.defaultBranch || "develop",
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

export async function moveTaskStatusForAutomation(taskId, nextStatus, sourceMeta = {}) {
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

function formatMetricRows(metrics = []) {
  return metrics.map((metric) => ({
    metric: metric.label,
    value: metric.value,
    notes: metric.sublabel || "",
  }));
}

export async function getSummaryOverviewAnalytics(filters = {}) {
  const projectId = asUuid(filters.projectId, null);
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
  const fromDate = startOfDay(filters.from);
  const toDate = endOfDay(filters.to);
  const tasks = await getTasks({
    projectId,
    limitProjectsToMemberUserId: filters.limitProjectsToMemberUserId,
  });
  const rangeTasks = fromDate || toDate ? filterByDateRange(tasks, fromDate, toDate) : tasks;
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
  const typeCounts = new Map(
    configuredTypes.map((type) => [String(type || "").toLowerCase(), 0]),
  );
  rangeTasks.forEach((task) => {
    const key = String(task.status || "");
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
    const priorityKey = String(task.priority || "unknown").toLowerCase();
    priorityCounts.set(priorityKey, (priorityCounts.get(priorityKey) || 0) + 1);
    const typeKey = String(task.type || "unknown").toLowerCase();
    typeCounts.set(typeKey, (typeCounts.get(typeKey) || 0) + 1);
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
      label: type.replace(/_/g, " "),
      value: count,
      type,
    }))
    .sort((a, b) => b.value - a.value);

  const linkedCoverage = await dbQuery(
    `SELECT COUNT(DISTINCT t.id)::int AS "totalTasks",
            COUNT(DISTINCT l.task_id)::int AS "linkedTasks"
     FROM tasks t
     LEFT JOIN task_dev_links l ON l.task_id = t.id
     WHERE t.project_id = $1`,
    [projectId],
  );
  const linkedTasks = Number(linkedCoverage.rows[0]?.linkedTasks || 0);
  const totalTasks = Number(linkedCoverage.rows[0]?.totalTasks || 0);

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

export async function getSummarySprintAnalytics(filters = {}) {
  const projectId = asUuid(filters.projectId, null);
  if (!projectId) throw new Error("projectId is required");
  const fromDate = startOfDay(filters.from);
  const toDate = endOfDay(filters.to);
  const settings = await getProjectSettings(projectId);
  const doneStatuses = new Set(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages)
      .filter((stage) => stage.counterGroup === "done")
      .map((stage) => stage.key),
  );
  const [sprints, tasks] = await Promise.all([
    getSprints({ projectId }),
    getTasks({
      projectId,
      limitProjectsToMemberUserId: filters.limitProjectsToMemberUserId,
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

export async function getSummaryFlowAnalytics(filters = {}) {
  const projectId = asUuid(filters.projectId, null);
  if (!projectId) throw new Error("projectId is required");
  const interval = filters.interval === "month" ? "month" : "week";
  const fromDate = startOfDay(filters.from);
  const toDate = endOfDay(filters.to);
  const settings = await getProjectSettings(projectId);
  const doneStatuses = new Set(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages)
      .filter((stage) => stage.counterGroup === "done")
      .map((stage) => stage.key),
  );
  const tasks = await getTasks({
    projectId,
    limitProjectsToMemberUserId: filters.limitProjectsToMemberUserId,
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
    const result = await dbQuery(
      `SELECT task_id AS "taskId", MIN(created_at) AS "enteredAt"
       FROM task_activity
       WHERE task_id = ANY($1::uuid[])
         AND action = 'task_moved'
         AND meta->>'to' = 'in_progress'
       GROUP BY task_id`,
      [doneTaskIds],
    );
    cycleStartByTask = new Map(
      result.rows.map((row) => [String(row.taskId), row.enteredAt]),
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

export async function getSummaryWorkloadAnalytics(filters = {}) {
  const projectId = asUuid(filters.projectId, null);
  if (!projectId) throw new Error("projectId is required");
  const fromDate = startOfDay(filters.from);
  const toDate = endOfDay(filters.to);
  const settings = await getProjectSettings(projectId);
  const doneStatuses = new Set(
    normalizeWorkflowStages(settings?.boardCardFields?.workflowStages)
      .filter((stage) => stage.counterGroup === "done")
      .map((stage) => stage.key),
  );
  const [tasks, users] = await Promise.all([
    getTasks({
      projectId,
      limitProjectsToMemberUserId: filters.limitProjectsToMemberUserId,
    }),
    getUsers(),
  ]);
  const usersById = new Map(users.map((user) => [String(user.id), user]));
  const projects = await getProjects();
  const project = projects.find((item) => String(item.id) === String(projectId));
  const projectMemberIds = new Set(
    (project?.members || []).map((member) => String(member.id)),
  );
  const rangeTasks = fromDate || toDate ? filterByDateRange(tasks, fromDate, toDate) : tasks;
  const byAssignee = new Map();
  projectMemberIds.forEach((memberId) => {
    const assigneeUser = usersById.get(memberId);
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
    const assigneeUser = usersById.get(assigneeKey);
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

export async function buildSummaryReportExport(filters = {}) {
  const type = String(filters.type || "overview").trim().toLowerCase();
  let rows = [];
  if (type === "sprint") {
    const sprint = await getSummarySprintAnalytics(filters);
    rows = (sprint.velocityTrend || []).map((row) => ({
      sprint: row.label,
      completedPoints: row.completedPoints,
      plannedPoints: row.plannedPoints,
      carryOverPoints: row.carryOverPoints,
      completionRate: Number(row.completionRate || 0).toFixed(2),
    }));
  } else if (type === "workload") {
    const workload = await getSummaryWorkloadAnalytics(filters);
    rows = (workload.assigneeLoad || []).map((row) => ({
      assignee: row.label,
      taskCount: row.value,
      storyPoints: row.storyPoints,
      overdueTasks: row.overdue,
    }));
  } else {
    const [overview, flow] = await Promise.all([
      getSummaryOverviewAnalytics(filters),
      getSummaryFlowAnalytics(filters),
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

export async function buildBoard(sprintId, projectId, filters = {}) {
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
  const projects = await getProjects();
  const scopedUserId = limitProjectsToMemberUserId
    ? asUuid(limitProjectsToMemberUserId, null)
    : null;
  const projectsForUser = scopedUserId
    ? projects.filter((project) =>
        (project.members || []).some(
          (member) => String(member.id) === String(scopedUserId),
        ),
      )
    : projects;
  const allowedProjectIds = new Set(
    projectsForUser.map((project) => String(project.id || "")),
  );
  const assignedTasks = await getTasks({
    assigneeId: uid,
    activeSprintOnly: true,
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
    const settingsRows = await dbQuery(
      `SELECT project_id AS "projectId", board_card_fields AS "boardCardFields"
       FROM project_settings
       WHERE project_id = ANY($1::uuid[])`,
      [projectIds],
    );
    settingsRows.rows.forEach((row) => {
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
  const pid = asUuid(projectId, null);
  if (!pid) return [];
  const normalizedFilters = {
    projectId: pid,
    assigneeId: filters.assigneeId,
    status: filters.status,
    priority: filters.priority,
    type: filters.type,
    label: filters.label,
    search: filters.search,
    ...(limitProjectsToMemberUserId
      ? { limitProjectsToMemberUserId: asUuid(limitProjectsToMemberUserId) }
      : {}),
  };
  const [sprints, allTasks, backlogTasks, settings] = await Promise.all([
    getSprints({ projectId: pid }),
    getTasks(normalizedFilters),
    getTasks({ ...normalizedFilters, sprintId: "backlog" }),
    getProjectSettings(pid),
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
  if (selectedSprintId) {
    return sprintRows.filter(
      (row) => String(row.key) === String(selectedSprintId),
    );
  }
  return [backlogRow, ...active, ...planned, ...other];
}

export async function assignTasksToSprint(taskIds = [], sprintId = null) {
  const normalizedTaskIds = [
    ...new Set((taskIds || []).map((id) => asUuid(id, null)).filter(Boolean)),
  ];
  if (!normalizedTaskIds.length) return [];
  const result = await dbQuery(
    `UPDATE tasks t
     SET sprint_id = $1, updated_at = NOW()
     FROM projects p
     WHERE t.id = ANY($2::uuid[]) AND p.id = t.project_id
     RETURNING t.id, t.title, t.description, t.acceptance_criteria AS "acceptanceCriteria", t.label, t.version, t.type, t.priority, t.status,
               t.story_points AS "storyPoints", t.due_date AS "dueDate", t.assignee_id AS "assigneeId",
               t.sprint_id AS "sprintId", t.project_id AS "projectId", t.created_by AS "createdBy",
               t.created_at AS "createdAt", t.updated_at AS "updatedAt",
               t.task_number AS "taskNumber", p.project_key AS "projectKey"`,
    [asUuid(sprintId, null), normalizedTaskIds],
  );
  return result.rows.map(mapTaskRow);
}

export async function completeSprint(
  sprintId,
  moveIncompleteToSprintId = null,
) {
  const updatedSprint = await updateSprint(sprintId, { status: "completed" });
  if (!updatedSprint) return null;

  const sprintRow = await dbQuery(
    `SELECT project_id AS "projectId" FROM sprints WHERE id = $1`,
    [asUuid(sprintId)],
  );
  const sprintProjectId = sprintRow.rows[0]?.projectId;
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
    const destination = await dbQuery(
      `SELECT id, project_id AS "projectId" FROM sprints WHERE id = $1`,
      [destinationSprintId],
    );
    if (!destination.rows[0]) {
      throw new Error("Destination sprint not found");
    }
    if (String(destination.rows[0].projectId) !== String(sprintProjectId)) {
      throw new Error("Destination sprint must belong to the same project");
    }
    if (String(destination.rows[0].id) === String(asUuid(sprintId))) {
      throw new Error("Destination sprint must be different");
    }
  }

  const doneFilter = doneStatuses.length ? doneStatuses : ["done"];
  await dbQuery(
    `UPDATE tasks
     SET sprint_id = $2, updated_at = NOW()
     WHERE sprint_id = $1 AND NOT (status = ANY($3::text[]))`,
    [sprintId, destinationSprintId, doneFilter],
  );
  return updatedSprint;
}

export async function assignTaskToSprint(taskId, sprintId) {
  const result = await dbQuery(
    `UPDATE tasks t
     SET sprint_id = $1, updated_at = NOW()
     FROM projects p
     WHERE t.id = $2 AND p.id = t.project_id
     RETURNING t.id, t.title, t.description, t.acceptance_criteria AS "acceptanceCriteria", t.label, t.version, t.type, t.priority, t.status,
               t.story_points AS "storyPoints", t.due_date AS "dueDate", t.assignee_id AS "assigneeId",
               t.sprint_id AS "sprintId", t.project_id AS "projectId", t.created_by AS "createdBy",
               t.created_at AS "createdAt", t.updated_at AS "updatedAt",
               t.task_number AS "taskNumber", p.project_key AS "projectKey"`,
    [sprintId, taskId],
  );
  return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
}

export async function removeTaskFromSprint(taskId, sprintId) {
  const result = await dbQuery(
    `UPDATE tasks t
     SET sprint_id = NULL, updated_at = NOW()
     FROM projects p
     WHERE t.id = $1 AND t.sprint_id = $2 AND p.id = t.project_id
     RETURNING t.id, t.title, t.description, t.acceptance_criteria AS "acceptanceCriteria", t.label, t.version, t.type, t.priority, t.status,
               t.story_points AS "storyPoints", t.due_date AS "dueDate", t.assignee_id AS "assigneeId",
               t.sprint_id AS "sprintId", t.project_id AS "projectId", t.created_by AS "createdBy",
               t.created_at AS "createdAt", t.updated_at AS "updatedAt",
               t.task_number AS "taskNumber", p.project_key AS "projectKey"`,
    [taskId, sprintId],
  );
  return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
}

export async function deleteSprint(sprintId) {
  const sid = asUuid(sprintId);
  const inUse = await dbQuery(
    `SELECT 1 FROM tasks WHERE sprint_id = $1 LIMIT 1`,
    [sid],
  );
  if (inUse.rows[0]) {
    throw new Error(SPRINT_DELETE_NOT_EMPTY_MESSAGE);
  }
  const result = await dbQuery(`DELETE FROM sprints WHERE id = $1`, [sid]);
  return result.rowCount > 0;
}
