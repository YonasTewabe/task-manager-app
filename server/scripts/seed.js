import bcrypt from "bcryptjs";
import { initSchema } from "../db/initSchema.js";
import { dbQuery, pool } from "../db/pool.js";

async function seed() {
  await initSchema();

  const existing = await dbQuery("SELECT id FROM users WHERE email = $1", [
    "admin@local.dev",
  ]);
  if (existing.rowCount === 0) {
    const passwordHash = await bcrypt.hash("Admin123!", 10);
    await dbQuery(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)",
      ["Admin User", "admin@local.dev", passwordHash, "admin"],
    );
  }

  const admin = (
    await dbQuery("SELECT id FROM users WHERE email = $1 LIMIT 1", [
      "admin@local.dev",
    ])
  ).rows[0];

  let projectId;
  const projectLookup = await dbQuery(
    "SELECT id FROM projects WHERE project_key = $1 LIMIT 1",
    ["SEED"],
  );
  if (projectLookup.rowCount === 0) {
    const inserted = await dbQuery(
      `INSERT INTO projects (name, project_key, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ["Seed project", "SEED", "Local development seed data"],
    );
    projectId = inserted.rows[0].id;
    await dbQuery(
      `INSERT INTO project_settings (project_id) VALUES ($1)
       ON CONFLICT (project_id) DO NOTHING`,
      [projectId],
    );
    await dbQuery(
      `INSERT INTO project_members (project_id, user_id, is_project_admin)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (project_id, user_id) DO UPDATE SET is_project_admin = TRUE`,
      [projectId, admin.id],
    );
  } else {
    projectId = projectLookup.rows[0].id;
  }

  let sprintId;
  const sprintLookup = await dbQuery(
    `SELECT id FROM sprints WHERE project_id = $1 AND name = $2 LIMIT 1`,
    [projectId, "Sprint 1"],
  );
  if (sprintLookup.rowCount === 0) {
    const sprintIns = await dbQuery(
      `INSERT INTO sprints (name, project_id, status)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ["Sprint 1", projectId, "active"],
    );
    sprintId = sprintIns.rows[0].id;
  } else {
    sprintId = sprintLookup.rows[0].id;
  }

  const taskCount = await dbQuery(
    `SELECT COUNT(*)::int AS c FROM tasks WHERE project_id = $1`,
    [projectId],
  );
  if (Number(taskCount.rows[0]?.c || 0) === 0) {
    await dbQuery(
      `INSERT INTO tasks (
        title, description, acceptance_criteria, label, version, type, priority, status,
        story_points, assignee_id, sprint_id, project_id, created_by, task_number
      ) VALUES
        ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14),
        ($15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
      [
        "Set up authentication",
        "Implement login/register and protected routes",
        "[]",
        "",
        "",
        "story",
        "high",
        "blocked",
        5,
        admin.id,
        sprintId,
        projectId,
        admin.id,
        1,
        "Build first board screen",
        "Render blocked/todo/in-progress/done columns with task cards",
        "[]",
        "",
        "",
        "task",
        "medium",
        "in_progress",
        3,
        admin.id,
        sprintId,
        projectId,
        admin.id,
        2,
      ],
    );
    await dbQuery(
      `INSERT INTO project_task_seq (project_id, last_value) VALUES ($1, $2)
       ON CONFLICT (project_id) DO UPDATE
       SET last_value = GREATEST(project_task_seq.last_value, EXCLUDED.last_value)`,
      [projectId, 2],
    );
  }
}

seed()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await pool.end();
    process.exit(1);
  });
