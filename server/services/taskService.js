import { DEFAULT_WORK_TYPE_VALUES } from "../../src/constants/workTypes.js";
import { dbQuery } from "../db/pool.js";
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
  base.labels = [
    ...new Set(
      labels.map((label) => String(label || "").trim()).filter(Boolean),
    ),
  ];
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
       u.updated_at AS "updatedAt",
       COALESCE(
         JSON_AGG(JSON_BUILD_OBJECT('id', g.id, 'name', g.name))
         FILTER (WHERE g.id IS NOT NULL),
         '[]'::json
       ) AS groups
     FROM users u
     LEFT JOIN user_group_members ugm ON ugm.user_id = u.id
     LEFT JOIN user_groups g ON g.id = ugm.group_id
     GROUP BY u.id
     ORDER BY u.id ASC`,
  );
  return result.rows;
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

async function setProjectMembers(projectId, memberIds) {
  await dbQuery("DELETE FROM project_members WHERE project_id = $1", [
    projectId,
  ]);
  const normalized = normalizeMemberIds(memberIds);
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
    `INSERT INTO project_members (project_id, user_id) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
    [projectId, ...activeUserIds],
  );
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
  const result = await dbQuery(
    `SELECT
       p.id,
       p.name,
       p.project_key AS "projectKey",
       p.description,
       p.created_at AS "createdAt",
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT('id', u.id, 'name', u.name, 'email', u.email)
         ) FILTER (WHERE u.id IS NOT NULL),
         '[]'::json
       ) AS members
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id
     LEFT JOIN users u ON u.id = pm.user_id AND u.is_active = TRUE
     GROUP BY p.id
     ORDER BY p.id DESC`,
  );
  return result.rows;
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

  if (fields.length) {
    params.push(projectIdNormalized);
    const updated = await dbQuery(
      `UPDATE projects SET ${fields.join(", ")}
       WHERE id = $${idx}
       RETURNING id`,
      params,
    );
    if (!updated.rows[0]) return null;
  }

  if (patch.memberIds !== undefined) {
    await setProjectMembers(projectId, patch.memberIds);
  }

  const projects = await getProjects();
  return projects.find((item) => String(item.id) === String(projectId)) || null;
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

export async function getTasks(filters = {}) {
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
  if (filters.assigneeId != null && String(filters.assigneeId).trim() !== "") {
    if (String(filters.assigneeId) === "unassigned") {
      where.push("t.assignee_id IS NULL");
    } else {
      where.push(`t.assignee_id = $${idx}`);
      params.push(asUuid(filters.assigneeId));
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
    ORDER BY t.id DESC
  `;
  const result = await dbQuery(query, params);
  return result.rows.map(mapTaskRow);
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

async function allocateNextTaskNumber(projectId) {
  const pid = asUuid(projectId, null);
  if (!pid) throw new Error("projectId is required");
  const result = await dbQuery(
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
  const taskNumber = await allocateNextTaskNumber(payload.projectId);
  const result = await dbQuery(
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
  const pk = await dbQuery(
    `SELECT project_key AS "projectKey" FROM projects WHERE id = $1`,
    [asUuid(payload.projectId)],
  );
  return mapTaskRow({ ...result.rows[0], projectKey: pk.rows[0]?.projectKey });
}

export async function updateTask(taskId, patch) {
  let existing = null;
  const needsExisting =
    patch.status !== undefined ||
    patch.title !== undefined ||
    patch.projectId !== undefined;
  if (needsExisting) {
    existing = await getTaskById(taskId);
    if (!existing) return null;
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
  for (const [key, dbKey] of Object.entries(allowedMap)) {
    if (patch[key] === undefined) continue;
    fields.push(`${dbKey} = $${idx}`);
    if (key === "storyPoints") {
      params.push(asInt(patch[key], null));
    } else if (key === "acceptanceCriteria") {
      params.push(JSON.stringify(normalizeAcceptanceCriteria(patch[key])));
    } else if (key === "priority") {
      params.push(normalizeTaskPriority(patch[key]));
    } else if (key === "type") {
      params.push(normalizeTaskType(patch[key]));
    } else if (key === "status") {
      params.push(normalizeTaskStatus(patch[key]));
    } else if (key === "dueDate") {
      params.push(patch[key] ? String(patch[key]) : null);
    } else if (
      key === "assigneeId" ||
      key === "sprintId" ||
      key === "projectId"
    ) {
      params.push(asUuid(patch[key], null));
    } else {
      params.push(patch[key]);
    }
    idx += 1;
  }
  if (allocatedTaskNumber != null) {
    fields.push(`task_number = $${idx}`);
    params.push(allocatedTaskNumber);
    idx += 1;
  }
  if (fields.length === 0) return null;
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
  for (const row of result.rows) {
    const base = {
      id: row.externalId,
      owner: row.owner || "",
      repo: row.repo || "",
      url: row.url || "",
      title: row.titleOrMessage || "",
      status: row.status || "",
      defaultBranch: row.defaultBranch || "develop",
      updatedAt: row.updatedAt,
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

export async function buildBoard(sprintId, projectId, filters = {}) {
  const settings = await getProjectSettings(projectId);
  const stages = normalizeWorkflowStages(
    settings.boardCardFields?.workflowStages,
  );
  const tasks = await getTasks({ sprintId, projectId, ...filters });
  return stages.map((stage) => ({
    status: stage.key,
    name: stage.name,
    description: stage.description,
    badge: stage.badge,
    counterGroup: stage.counterGroup,
    tasks: tasks.filter((task) => task.status === stage.key),
  }));
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
