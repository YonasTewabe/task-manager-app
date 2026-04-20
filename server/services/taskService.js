import { dbQuery } from "../db/pool.js";
import { asInt } from "../utils/validation.js";

export const STATUS_COLUMNS = ["blocked", "todo", "in_progress", "done"];
export const SPRINT_STATUSES = ["planned", "active", "completed"];

function asUuid(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

const DEFAULT_SYSTEM_SETTINGS = {
  boardCardFields: {
    showStoryPoints: true,
    showPriority: true,
    showAssignee: true,
    showLabel: true,
  },
  workflowRules: {
    allowBackMoveFromDone: false,
    requireAssigneeForInProgress: true,
    autoMoveToBacklogOnSprintComplete: true,
  },
  generalRules: {
    defaultStoryPoints: 3,
    enforceUniqueTaskTitlesInSprint: false,
  },
};

export async function getUsers() {
  const result = await dbQuery(
    "SELECT id, name, email, role, created_at AS \"createdAt\" FROM users ORDER BY id ASC",
  );
  return result.rows;
}

export async function getSystemSettings() {
  const result = await dbQuery(
    `SELECT board_card_fields AS "boardCardFields",
            workflow_rules AS "workflowRules",
            general_rules AS "generalRules",
            updated_at AS "updatedAt"
     FROM system_settings
     ORDER BY updated_at DESC
     LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) {
    return { ...DEFAULT_SYSTEM_SETTINGS };
  }
  return {
    boardCardFields: {
      ...DEFAULT_SYSTEM_SETTINGS.boardCardFields,
      ...(row.boardCardFields || {}),
    },
    workflowRules: {
      ...DEFAULT_SYSTEM_SETTINGS.workflowRules,
      ...(row.workflowRules || {}),
    },
    generalRules: {
      ...DEFAULT_SYSTEM_SETTINGS.generalRules,
      ...(row.generalRules || {}),
    },
    updatedAt: row.updatedAt,
  };
}

export async function updateSystemSettings(patch = {}) {
  const current = await getSystemSettings();
  const idResult = await dbQuery("SELECT id FROM system_settings ORDER BY updated_at DESC LIMIT 1");
  const settingsId = idResult.rows[0]?.id;
  if (!settingsId) {
    throw new Error("System settings row missing");
  }
  const next = {
    boardCardFields: {
      ...current.boardCardFields,
      ...(patch.boardCardFields || {}),
    },
    workflowRules: {
      ...current.workflowRules,
      ...(patch.workflowRules || {}),
    },
    generalRules: {
      ...current.generalRules,
      ...(patch.generalRules || {}),
    },
  };
  const result = await dbQuery(
    `UPDATE system_settings
     SET board_card_fields = $1::jsonb,
         workflow_rules = $2::jsonb,
         general_rules = $3::jsonb,
         updated_at = NOW()
     WHERE id = $4
     RETURNING board_card_fields AS "boardCardFields",
               workflow_rules AS "workflowRules",
               general_rules AS "generalRules",
               updated_at AS "updatedAt"`,
    [
      JSON.stringify(next.boardCardFields),
      JSON.stringify(next.workflowRules),
      JSON.stringify(next.generalRules),
      settingsId,
    ],
  );
  return result.rows[0] || next;
}

export async function createUser({ name, email, passwordHash, role }) {
  const result = await dbQuery(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at AS "createdAt"`,
    [name, email, passwordHash, role || "member"],
  );
  return result.rows[0];
}

export async function updateUser(userId, patch) {
  const allowedMap = {
    name: "name",
    email: "email",
    role: "role",
    passwordHash: "password_hash",
  };

  const fields = [];
  const params = [];
  let idx = 1;
  for (const [key, dbKey] of Object.entries(allowedMap)) {
    if (patch[key] === undefined) continue;
    fields.push(`${dbKey} = $${idx}`);
    params.push(patch[key]);
    idx += 1;
  }
  if (fields.length === 0) return null;
  params.push(userId);

  const result = await dbQuery(
    `UPDATE users SET ${fields.join(", ")}
     WHERE id = $${idx}
     RETURNING id, name, email, role, created_at AS "createdAt"`,
    params,
  );
  return result.rows[0] || null;
}

export async function deleteUser(userId) {
  const result = await dbQuery("DELETE FROM users WHERE id = $1", [userId]);
  return result.rowCount > 0;
}

export async function getSprints() {
  const result = await dbQuery(
    `SELECT id, name, start_date AS "startDate", end_date AS "endDate",
            status, created_at AS "createdAt"
     FROM sprints ORDER BY id DESC`,
  );
  return result.rows;
}

function normalizeMemberIds(memberIds = []) {
  return [...new Set((memberIds || []).map((id) => asUuid(id)).filter((id) => id != null))];
}

async function setProjectMembers(projectId, memberIds) {
  await dbQuery("DELETE FROM project_members WHERE project_id = $1", [projectId]);
  const normalized = normalizeMemberIds(memberIds);
  if (!normalized.length) return;

  const valuesSql = normalized.map((_, index) => `($1, $${index + 2})`).join(", ");
  await dbQuery(
    `INSERT INTO project_members (project_id, user_id) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
    [projectId, ...normalized],
  );
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
     LEFT JOIN users u ON u.id = pm.user_id
     GROUP BY p.id
     ORDER BY p.id DESC`,
  );
  return result.rows;
}

export async function createProject({ name, projectKey, description, memberIds }) {
  const result = await dbQuery(
    `INSERT INTO projects (name, project_key, description)
     VALUES ($1, $2, $3)
     RETURNING id, name, project_key AS "projectKey", description, created_at AS "createdAt"`,
    [name, projectKey, description || ""],
  );
  const project = result.rows[0];
  await setProjectMembers(project.id, memberIds || []);
  const projects = await getProjects();
  return projects.find((item) => item.id === project.id) || project;
}

export async function updateProject(projectId, patch) {
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
    params.push(projectId);
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
  const result = await dbQuery("DELETE FROM projects WHERE id = $1", [projectId]);
  return result.rowCount > 0;
}

export async function createSprint({ name, startDate, endDate, status }) {
  const result = await dbQuery(
    `INSERT INTO sprints (name, start_date, end_date, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, start_date AS "startDate", end_date AS "endDate",
               status, created_at AS "createdAt"`,
    [name, startDate || null, endDate || null, status || "planned"],
  );
  return result.rows[0];
}

export async function updateSprint(id, patch) {
  const fields = [];
  const params = [];
  let idx = 1;

  for (const [incomingKey, value] of Object.entries(patch)) {
    const dbKeyMap = {
      name: "name",
      startDate: "start_date",
      endDate: "end_date",
      status: "status",
    };
    const dbKey = dbKeyMap[incomingKey];
    if (!dbKey) continue;
    fields.push(`${dbKey} = $${idx}`);
    params.push(value);
    idx += 1;
  }

  if (fields.length === 0) return null;
  params.push(id);

  const result = await dbQuery(
    `UPDATE sprints SET ${fields.join(", ")}
     WHERE id = $${idx}
     RETURNING id, name, start_date AS "startDate", end_date AS "endDate",
               status, created_at AS "createdAt"`,
    params,
  );
  return result.rows[0] || null;
}

function mapTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    label: row.label || "",
    type: row.type,
    priority: row.priority,
    status: row.status,
    storyPoints: row.storyPoints,
    assigneeId: row.assigneeId,
    sprintId: row.sprintId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
  if (filters.priority) {
    where.push(`t.priority = $${idx}`);
    params.push(filters.priority);
    idx += 1;
  }
  if (filters.label) {
    where.push(`LOWER(t.label) = LOWER($${idx})`);
    params.push(String(filters.label).trim());
    idx += 1;
  }
  if (filters.search) {
    where.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx} OR t.label ILIKE $${idx})`);
    params.push(`%${String(filters.search).trim()}%`);
    idx += 1;
  }

  const query = `
    SELECT t.id, t.title, t.description, t.label, t.type, t.priority, t.status,
           t.story_points AS "storyPoints", t.assignee_id AS "assigneeId",
           t.sprint_id AS "sprintId", t.created_by AS "createdBy",
           t.created_at AS "createdAt", t.updated_at AS "updatedAt"
    FROM tasks t
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY t.id DESC
  `;
  const result = await dbQuery(query, params);
  return result.rows.map(mapTaskRow);
}

export async function getTaskById(id) {
  const result = await dbQuery(
    `SELECT t.id, t.title, t.description, t.label, t.type, t.priority, t.status,
            t.story_points AS "storyPoints", t.assignee_id AS "assigneeId",
            t.sprint_id AS "sprintId", t.created_by AS "createdBy",
            t.created_at AS "createdAt", t.updated_at AS "updatedAt"
     FROM tasks t WHERE t.id = $1`,
    [asUuid(id)],
  );
  return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
}

export async function createTask(payload, createdBy) {
  const result = await dbQuery(
    `INSERT INTO tasks (
        title, description, label, type, priority, status, story_points, assignee_id, sprint_id, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, title, description, label, type, priority, status,
               story_points AS "storyPoints", assignee_id AS "assigneeId",
               sprint_id AS "sprintId", created_by AS "createdBy",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      payload.title,
      payload.description || "",
      payload.label || "",
      payload.type || "task",
      payload.priority || "medium",
      payload.status || "todo",
      asInt(payload.storyPoints, 1),
      asUuid(payload.assigneeId),
      asUuid(payload.sprintId),
      asUuid(createdBy),
    ],
  );
  return mapTaskRow(result.rows[0]);
}

export async function updateTask(taskId, patch) {
  const allowedMap = {
    title: "title",
    description: "description",
    label: "label",
    type: "type",
    priority: "priority",
    status: "status",
    storyPoints: "story_points",
    assigneeId: "assignee_id",
    sprintId: "sprint_id",
  };

  const fields = [];
  const params = [];
  let idx = 1;
  for (const [key, dbKey] of Object.entries(allowedMap)) {
    if (patch[key] === undefined) continue;
    fields.push(`${dbKey} = $${idx}`);
    if (key === "storyPoints") {
      params.push(asInt(patch[key], null));
    } else if (key === "assigneeId" || key === "sprintId") {
      params.push(asUuid(patch[key], null));
    } else {
      params.push(patch[key]);
    }
    idx += 1;
  }
  if (fields.length === 0) return null;
  fields.push("updated_at = NOW()");
  params.push(taskId);

  const result = await dbQuery(
    `UPDATE tasks SET ${fields.join(", ")}
     WHERE id = $${idx}
     RETURNING id, title, description, label, type, priority, status,
               story_points AS "storyPoints", assignee_id AS "assigneeId",
               sprint_id AS "sprintId", created_by AS "createdBy",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
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

export async function buildBoard(sprintId, filters = {}) {
  const tasks = await getTasks({ sprintId, ...filters });
  return STATUS_COLUMNS.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));
}

export async function completeSprint(sprintId, moveIncompleteToBacklog = true) {
  const updatedSprint = await updateSprint(sprintId, { status: "completed" });
  if (!updatedSprint) return null;

  if (moveIncompleteToBacklog) {
    await dbQuery(
      `UPDATE tasks SET sprint_id = NULL, updated_at = NOW()
       WHERE sprint_id = $1 AND status <> 'done'`,
      [sprintId],
    );
  }
  return updatedSprint;
}

export async function assignTaskToSprint(taskId, sprintId) {
  const result = await dbQuery(
    `UPDATE tasks
     SET sprint_id = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, title, description, type, priority, status,
               story_points AS "storyPoints", assignee_id AS "assigneeId",
               sprint_id AS "sprintId", created_by AS "createdBy",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [sprintId, taskId],
  );
  return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
}

export async function removeTaskFromSprint(taskId, sprintId) {
  const result = await dbQuery(
    `UPDATE tasks
     SET sprint_id = NULL, updated_at = NOW()
     WHERE id = $1 AND sprint_id = $2
     RETURNING id, title, description, type, priority, status,
               story_points AS "storyPoints", assignee_id AS "assigneeId",
               sprint_id AS "sprintId", created_by AS "createdBy",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [taskId, sprintId],
  );
  return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
}
