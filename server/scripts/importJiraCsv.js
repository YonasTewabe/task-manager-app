import path from "path";
import XLSX from "xlsx";
import { dbQuery, pool } from "../db/pool.js";
import {
  getProjectSettings,
  getWorkflowStageKeys,
} from "../services/taskService.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLookup(value) {
  return normalizeText(value).toLowerCase();
}

function mapPriority(value) {
  const key = normalizeLookup(value);
  if (key === "highest") return "highest";
  if (key === "high") return "high";
  if (key === "medium") return "medium";
  if (key === "low") return "low";
  if (key === "lowest") return "low";
  return "medium";
}

function mapType(value) {
  const key = normalizeLookup(value);
  if (key === "story") return "story";
  if (key === "bug") return "bug";
  if (key === "task") return "task";
  if (key === "hot-fix" || key === "hotfix") return "task";
  return "task";
}

function mapStatus(value, allowedStatuses = []) {
  const key = normalizeLookup(value);
  const byPriority = [];
  if (key === "done" || key === "closed" || key === "resolved") {
    byPriority.push("done");
  } else if (
    key === "in progress" ||
    key === "in_progress" ||
    key === "doing" ||
    key === "active"
  ) {
    byPriority.push("in_progress", "doing");
  } else if (
    key === "blocked" ||
    key === "on hold" ||
    key === "on_hold" ||
    key === "hold"
  ) {
    byPriority.push("blocked");
  } else {
    byPriority.push("todo", "to_do", "backlog");
  }

  const existing = new Set((allowedStatuses || []).map((s) => String(s)));
  for (const candidate of byPriority) {
    if (existing.has(candidate)) return candidate;
  }
  return allowedStatuses[0] || "todo";
}

function parseJiraDateToIsoDate(value) {
  const parsed = parseJiraDateTime(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseJiraDateTime(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = text.match(
    /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/,
  );
  if (!match) return null;
  const monthMap = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const day = Number(match[1]);
  const month = monthMap[String(match[2] || "").toLowerCase()];
  const yearRaw = Number(match[3]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  let hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const meridiem = String(match[6] || "").toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (!Number.isFinite(month)) return null;

  const date = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function extractIssueNumber(issueKey) {
  const key = normalizeText(issueKey);
  const match = key.match(/-(\d+)$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) return null;
  return number;
}

async function resolveImportActorUserId() {
  const admin = await dbQuery(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1`,
  );
  if (admin.rows[0]?.id) return admin.rows[0].id;
  const anyUser = await dbQuery(
    `SELECT id FROM users WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1`,
  );
  if (!anyUser.rows[0]?.id) {
    throw new Error(
      "No active users found. Create at least one user before importing.",
    );
  }
  return anyUser.rows[0].id;
}

async function ensureProjectForKey(projectKey, actorUserId) {
  const normalizedKey = normalizeText(projectKey).toUpperCase();
  const existing = await dbQuery(
    `SELECT id FROM projects WHERE project_key = $1 LIMIT 1`,
    [normalizedKey],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const created = await dbQuery(
    `INSERT INTO projects (name, project_key, description)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `${normalizedKey} Imported`,
      normalizedKey,
      `Auto-created during Jira CSV import for ${normalizedKey}.`,
    ],
  );
  const projectId = created.rows[0].id;

  await dbQuery(
    `INSERT INTO project_settings (project_id) VALUES ($1)
     ON CONFLICT (project_id) DO NOTHING`,
    [projectId],
  );
  await dbQuery(
    `INSERT INTO project_members (project_id, user_id, is_project_admin)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (project_id, user_id) DO UPDATE SET is_project_admin = TRUE`,
    [projectId, actorUserId],
  );

  return projectId;
}

async function importCsv() {
  const csvPath = path.resolve(process.cwd(), "..", "Jira.csv");
  const workbook = XLSX.readFile(csvPath, { raw: false });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
  });
  if (!rows.length) {
    console.log("No rows found in Jira.csv");
    return;
  }

  const actorUserId = await resolveImportActorUserId();
  const users = await dbQuery(
    `SELECT id, name FROM users WHERE is_active = TRUE ORDER BY created_at ASC`,
  );
  const usersByName = new Map(
    users.rows.map((row) => [normalizeLookup(row.name), row.id]),
  );

  const projectIdsByKey = new Map();
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const issueKey = normalizeText(row["Issue key"]);
    const issueNumber = extractIssueNumber(issueKey);
    const summary = normalizeText(row.Summary);
    if (!issueKey || !summary || !issueNumber) {
      skippedCount += 1;
      continue;
    }

    const projectKey = issueKey.includes("-")
      ? issueKey.split("-")[0]
      : "IMPORTED";
    let projectId = projectIdsByKey.get(projectKey);
    if (!projectId) {
      projectId = await ensureProjectForKey(projectKey, actorUserId);
      projectIdsByKey.set(projectKey, projectId);
    }

    const existing = await dbQuery(
      `SELECT id
       FROM tasks
       WHERE project_id = $1
         AND (version = $2 OR task_number = $3)
       LIMIT 1`,
      [projectId, issueKey, issueNumber],
    );

    const settings = await getProjectSettings(projectId);
    const workflowStatuses = getWorkflowStageKeys(settings);
    const status = mapStatus(row.Status, workflowStatuses);

    const assigneeName = normalizeText(row.Assignee);
    const assigneeId = assigneeName
      ? usersByName.get(normalizeLookup(assigneeName)) || null
      : null;

    const labels = Object.entries(row)
      .filter(([key]) => normalizeLookup(key).startsWith("labels"))
      .map(([, value]) => normalizeText(value))
      .filter(Boolean);

    const createdDate = parseJiraDateToIsoDate(row.Created);
    const createdAt = parseJiraDateTime(row.Created);
    const updatedAt = parseJiraDateTime(row.Updated);
    const dueDate = parseJiraDateToIsoDate(row["Due date"]);
    const reporter = normalizeText(row.Reporter);
    const reporterUserId = reporter
      ? usersByName.get(normalizeLookup(reporter)) || actorUserId
      : actorUserId;

    const payload = {
      title: summary,
      description: "",
      type: mapType(row["Issue Type"]),
      priority: mapPriority(row.Priority),
      status,
      dueDate,
      assigneeId,
      sprintId: null,
      projectId,
      version: issueKey,
      label: labels[0] || "",
      createdBy: reporterUserId,
      createdAt: createdAt || null,
      updatedAt: updatedAt || createdAt || null,
      taskNumber: issueNumber,
      storyPoints: null,
    };

    if (existing.rows[0]?.id) {
      await dbQuery(
        `UPDATE tasks
         SET title = $1,
             description = $2,
             type = $3,
             priority = $4,
             status = $5,
             due_date = $6,
             assignee_id = $7,
             sprint_id = $8,
             version = $9,
             label = $10,
             created_by = $11,
             task_number = $12,
             story_points = $13,
             created_at = COALESCE($14, created_at),
             updated_at = COALESCE($15, NOW())
         WHERE id = $16`,
        [
          payload.title,
          payload.description,
          payload.type,
          payload.priority,
          payload.status,
          payload.dueDate,
          payload.assigneeId,
          payload.sprintId,
          payload.version,
          payload.label,
          payload.createdBy,
          payload.taskNumber,
          payload.storyPoints,
          payload.createdAt,
          payload.updatedAt,
          existing.rows[0].id,
        ],
      );
      updatedCount += 1;
    } else {
      await dbQuery(
        `INSERT INTO tasks (
          title, description, acceptance_criteria, label, version, type, priority, status,
          story_points, due_date, assignee_id, sprint_id, project_id, created_by, task_number, created_at, updated_at
         ) VALUES (
          $1, $2, '[]'::jsonb, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14, COALESCE($15, NOW()), COALESCE($16, NOW())
         )`,
        [
          payload.title,
          payload.description,
          payload.label,
          payload.version,
          payload.type,
          payload.priority,
          payload.status,
          payload.storyPoints,
          payload.dueDate,
          payload.assigneeId,
          payload.sprintId,
          payload.projectId,
          payload.createdBy,
          payload.taskNumber,
          payload.createdAt,
          payload.updatedAt,
        ],
      );
      importedCount += 1;
    }
  }

  for (const projectId of projectIdsByKey.values()) {
    await dbQuery(
      `INSERT INTO project_task_seq (project_id, last_value)
       SELECT $1, COALESCE(MAX(task_number), 0)
       FROM tasks
       WHERE project_id = $1
       ON CONFLICT (project_id) DO UPDATE
       SET last_value = GREATEST(project_task_seq.last_value, EXCLUDED.last_value)`,
      [projectId],
    );
  }

  console.log(
    `Jira import completed. Imported: ${importedCount}, updated: ${updatedCount}, skipped: ${skippedCount}`,
  );
}

importCsv()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Jira CSV import failed:", error);
    await pool.end();
    process.exit(1);
  });
