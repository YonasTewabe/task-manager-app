import path from "path";
import XLSX from "xlsx";
import { dbQuery, pool } from "../db/pool.js";

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeLookup(value) {
  return asText(value).toLowerCase();
}

function slugifyStatus(value) {
  const base = asText(value).toLowerCase();
  if (!base) return "todo";
  return base
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function parseIssueNumber(issueKey) {
  const text = asText(issueKey);
  const match = text.match(/-(\d+)\s*$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function convertJiraInlineLinksToHtml(text) {
  const source = String(text || "");
  if (!source) return "";

  const tokens = [];
  const withTokens = source.replace(
    /\[([^\]]+)\]/g,
    (match, inner) => {
      const parts = String(inner || "")
        .split("|")
        .map((part) => String(part || "").trim())
        .filter(Boolean);
      if (parts.length < 2) return match;

      let label = parts[0];
      let href = parts.find((part) => /^https?:\/\//i.test(part)) || "";
      if (!href) return match;
      if (/^\+.*\+$/.test(label)) {
        label = label.slice(1, -1).trim();
      }
      if (!label) label = href;
      const token = `__JIRA_LINK_TOKEN_${tokens.length}__`;
      tokens.push({ label, href });
      return token;
    },
  );

  const escaped = escapeHtml(withTokens);
  return escaped.replace(/__JIRA_LINK_TOKEN_(\d+)__/g, (_m, idx) => {
    const item = tokens[Number(idx)];
    if (!item) return "";
    const safeHref = escapeHtml(item.href);
    const safeLabel = escapeHtml(item.label);
    return `<a href="${safeHref}" target="_blank" rel="noreferrer">${safeLabel}</a>`;
  });
}

function toRichDescriptionHtml(value) {
  const text = asText(value);
  if (!text) return "";
  const chunks = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (!chunks.length) return "";
  return chunks
    .map((chunk) =>
      `<p>${convertJiraInlineLinksToHtml(chunk).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

function parseDateTime(value) {
  if (value == null || value === "") return null;

  const toJsDateFromExcelSerial = (serial) => {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed) return null;
    const year = Number(parsed.y);
    const month = Number(parsed.m);
    const day = Number(parsed.d);
    const hour = Number(parsed.H || 0);
    const minute = Number(parsed.M || 0);
    const second = Number(parsed.S || 0);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  if (typeof value === "number" && Number.isFinite(value)) {
    return toJsDateFromExcelSerial(value);
  }

  const text = asText(value);
  if (!text) return null;

  // Numeric-looking text often comes from Excel serials. Parse as serial first.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial)) {
      const serialDate = toJsDateFromExcelSerial(serial);
      if (serialDate) return serialDate;
    }
    return null;
  }

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
  const month = monthMap[normalizeLookup(match[2])];
  const yearRaw = Number(match[3]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  let hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const meridiem = asText(match[6]).toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (!Number.isFinite(month)) return null;

  const date = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseDateOnly(value) {
  const dt = parseDateTime(value);
  if (!dt) return null;
  return dt.toISOString().slice(0, 10);
}

function parseStoryPoints(row) {
  const raw = asText(
    row["Story point"] ??
      row["Story Points"] ??
      row.storyPoint ??
      row.storyPoints ??
      row["Story point estimate"],
  );
  if (!raw) return null;
  const normalized = raw.replace(/,/g, ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseLastSprintName(rawSprintValue) {
  const text = asText(rawSprintValue);
  if (!text) return "";
  const nameMatches = [...text.matchAll(/name=([^,\]]+)/gi)]
    .map((m) => asText(m[1]))
    .filter(Boolean);
  if (nameMatches.length) return nameMatches[nameMatches.length - 1];
  const sprintChunks = text
    .split(",")
    .map((chunk) => asText(chunk))
    .filter(Boolean);
  if (sprintChunks.length) return sprintChunks[sprintChunks.length - 1];
  return text;
}

function parseRowSprint(row) {
  const values = [];
  values.push(asText(row.Sprint));
  values.push(asText(row.sprint));
  values.push(asText(row["Sprint Name"]));
  values.push(asText(row["Sprint(s)"]));
  for (const [key, value] of Object.entries(row || {})) {
    if (/^sprint_\d+$/i.test(asText(key))) {
      values.push(asText(value));
    }
  }
  const nonEmpty = values.filter(Boolean);
  if (!nonEmpty.length) return "";
  return nonEmpty[nonEmpty.length - 1];
}

function parseSprintChunk(chunk) {
  const idMatch = chunk.match(/(?:^|,)id=([^,\]]+)/i);
  const nameMatch = chunk.match(/(?:^|,)name=([^,\]]+)/i);
  const stateMatch = chunk.match(/(?:^|,)state=([^,\]]+)/i);
  const startMatch = chunk.match(/(?:^|,)startDate=([^,\]]+)/i);
  const endMatch = chunk.match(/(?:^|,)endDate=([^,\]]+)/i);
  const id = asText(idMatch?.[1]);
  const name = asText(nameMatch?.[1]);
  const state = normalizeLookup(stateMatch?.[1]);
  const startDate = parseDateOnly(startMatch?.[1]);
  const endDate = parseDateOnly(endMatch?.[1]);
  if (!id && !name) return null;
  return { id, name: name || id, state, startDate, endDate };
}

function parseJiraSprints(rawSprintValue) {
  const text = asText(rawSprintValue);
  if (!text) return [];
  const chunks = [...text.matchAll(/\[([^\]]+)\]/g)]
    .map((m) => asText(m[1]))
    .filter(Boolean);
  if (!chunks.length) {
    const fallbackName = parseLastSprintName(text);
    return fallbackName ? [{ id: "", name: fallbackName, state: "", startDate: null, endDate: null }] : [];
  }
  return chunks.map(parseSprintChunk).filter(Boolean);
}

function parseLastSprint(rawSprintValue) {
  const sprints = parseJiraSprints(rawSprintValue);
  if (!sprints.length) return null;
  return sprints[sprints.length - 1];
}

async function createImportProject(rows, sourcePath) {
  const firstIssueKey = asText(rows[0]?.["Issue key"] || rows[0]?.issueKey);
  const projectPrefix = firstIssueKey.includes("-")
    ? firstIssueKey.split("-")[0]
    : "JIRA";
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const projectKey = projectPrefix.slice(0, 30);
  const projectName = `${projectPrefix} Jira Import ${stamp}`;
  const description = `Auto-created from Jira Excel import: ${sourcePath}`;

  const existing = await dbQuery(
    `SELECT id, name, project_key AS "projectKey" FROM projects WHERE project_key = $1 LIMIT 1`,
    [projectKey],
  );
  if (existing.rows[0]?.id) {
    return existing.rows[0];
  }

  const inserted = await dbQuery(
    `INSERT INTO projects (name, project_key, description)
     VALUES ($1, $2, $3)
     RETURNING id, name, project_key AS "projectKey"`,
    [projectName, projectKey, description],
  );
  const project = inserted.rows[0];

  await dbQuery(
    `INSERT INTO project_settings (project_id)
     VALUES ($1)
     ON CONFLICT (project_id) DO NOTHING`,
    [project.id],
  );
  return project;
}

async function buildUserMaps() {
  const usersRes = await dbQuery(
    `SELECT id, name FROM users WHERE is_active = TRUE ORDER BY created_at ASC`,
  );
  const byName = new Map();
  for (const row of usersRes.rows) {
    const key = normalizeLookup(row.name);
    if (key && !byName.has(key)) byName.set(key, row.id);
  }
  return { byName };
}

async function createSprintsForProject(projectId, rows) {
  const sprints = [];
  const seen = new Set();

  for (const row of rows) {
    const sprint = parseLastSprint(parseRowSprint(row));
    if (!sprint) continue;
    const key = sprint.id
      ? `id:${normalizeLookup(sprint.id)}`
      : `name:${normalizeLookup(sprint.name)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sprints.push(sprint);
  }

  const sprintBySourceKey = new Map();
  for (const sprint of sprints) {
    let status = "planned";
    if (sprint.state === "active") status = "active";
    else if (sprint.state === "closed") status = "completed";
    const inserted = await dbQuery(
      `INSERT INTO sprints (name, project_id, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id, name`,
      [sprint.name, projectId, sprint.startDate, sprint.endDate, status],
    );
    let insertedRow = inserted.rows[0];
    if (!insertedRow) {
      const existingSprint = await dbQuery(
        `SELECT id, name FROM sprints WHERE project_id = $1 AND name = $2 ORDER BY created_at DESC LIMIT 1`,
        [projectId, sprint.name],
      );
      insertedRow = existingSprint.rows[0];
    }
    if (!insertedRow) continue;
    const sourceKey = sprint.id
      ? `id:${normalizeLookup(sprint.id)}`
      : `name:${normalizeLookup(sprint.name)}`;
    sprintBySourceKey.set(sourceKey, insertedRow.id);
  }
  return sprintBySourceKey;
}

async function applyProjectBoardColumns(projectId, rows) {
  const statuses = [];
  const seen = new Set();
  for (const row of rows) {
    const raw = asText(row.Status || row.status || "To Do");
    const key = slugifyStatus(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    statuses.push({
      key,
      name: raw || key,
      description: "",
      badge: "",
      counterGroup: "upcoming",
    });
  }
  if (!statuses.length) {
    statuses.push({
      key: "todo",
      name: "To Do",
      description: "",
      badge: "",
      counterGroup: "upcoming",
    });
  }

  await dbQuery(
    `UPDATE project_settings
     SET board_card_fields = COALESCE(board_card_fields, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE project_id = $1`,
    [projectId, JSON.stringify({ workflowStages: statuses })],
  );
}

async function applyProjectTypes(projectId, rows) {
  const types = [...new Set(rows.map((r) => normalizeLookup(r["Issue Type"] || r.issueType)).filter(Boolean))];
  if (!types.length) return;
  await dbQuery(
    `UPDATE project_settings
     SET general_rules = COALESCE(general_rules, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE project_id = $1`,
    [projectId, JSON.stringify({ types })],
  );
}

async function importJiraExcel() {
  const sourcePath =
    process.argv[2] || path.resolve(process.cwd(), "..", "Jira.xlsx");
  const workbook = XLSX.readFile(sourcePath, { raw: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("No sheet found in workbook.");

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    defval: "",
  });
  if (!rows.length) {
    console.log("No rows found in Jira Excel file.");
    return;
  }

  const project = await createImportProject(rows, sourcePath);
  const { byName: usersByName } = await buildUserMaps();
  const sprintsBySourceKey = await createSprintsForProject(project.id, rows);
  await applyProjectBoardColumns(project.id, rows);
  await applyProjectTypes(project.id, rows);

  let importedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const summary = asText(row.Summary || row.summary);
    const description = toRichDescriptionHtml(row.Description || row.description);
    const issueType = normalizeLookup(row["Issue Type"] || row.issueType) || "task";
    const issueKey = asText(row["Issue key"] || row.issueKey);
    const taskNumber = parseIssueNumber(issueKey);
    const status = slugifyStatus(row.Status || row.status || "To Do");
    const storyPoints = parseStoryPoints(row);
    const dueDate = parseDateOnly(row["Due date"] || row.dueDate);
    const createdAt = parseDateTime(row.Created || row.created);
    const updatedAt = parseDateTime(row.Updated || row.updated);

    const assigneeName = asText(row.Assignee || row.assignee);
    const reporterName = asText(row.Reporter || row.reporter);
    const assigneeId = usersByName.get(normalizeLookup(assigneeName)) || null;
    const reporterId = usersByName.get(normalizeLookup(reporterName)) || null;

    const lastSprint = parseLastSprint(parseRowSprint(row));
    const sprintLookupKey = lastSprint
      ? lastSprint.id
        ? `id:${normalizeLookup(lastSprint.id)}`
        : `name:${normalizeLookup(lastSprint.name)}`
      : "";
    const sprintId = (sprintLookupKey && sprintsBySourceKey.get(sprintLookupKey)) || null;

    if (!summary || !taskNumber) {
      skippedCount += 1;
      continue;
    }

    await dbQuery(
      `INSERT INTO tasks (
         title, description, acceptance_criteria, label, version, type, priority, status,
         story_points, due_date, project_id, assignee_id, sprint_id, created_by, task_number, created_at, updated_at
       ) VALUES (
         $1, $2, '[]'::jsonb, '', $3, $4, 'medium', $5,
         $6, $7, $8, $9, $10, $11, $12, COALESCE($13, NOW()), COALESCE($14, NOW())
       )
       ON CONFLICT (project_id, task_number) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           version = EXCLUDED.version,
           type = EXCLUDED.type,
           status = EXCLUDED.status,
           story_points = EXCLUDED.story_points,
           due_date = EXCLUDED.due_date,
           assignee_id = EXCLUDED.assignee_id,
           sprint_id = EXCLUDED.sprint_id,
           created_by = EXCLUDED.created_by,
           updated_at = COALESCE(EXCLUDED.updated_at, NOW())`,
      [
        summary,
        description,
        issueKey,
        issueType,
        status,
        storyPoints,
        dueDate,
        project.id,
        assigneeId,
        sprintId,
        reporterId,
        taskNumber,
        createdAt,
        updatedAt,
      ],
    );
    importedCount += 1;
  }

  await dbQuery(
    `INSERT INTO project_task_seq (project_id, last_value)
     SELECT $1, COALESCE(MAX(task_number), 0)
     FROM tasks
     WHERE project_id = $1
     ON CONFLICT (project_id) DO UPDATE
     SET last_value = GREATEST(project_task_seq.last_value, EXCLUDED.last_value)`,
    [project.id],
  );

  console.log(
    `Jira Excel import completed. Project: ${project.name} (${project.projectKey}). Imported: ${importedCount}, skipped: ${skippedCount}`,
  );
}

importJiraExcel()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Jira Excel import failed:", error.message || error);
    await pool.end();
    process.exit(1);
  });
