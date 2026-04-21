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

  const sprint = await dbQuery(
    `INSERT INTO sprints (name, status)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    ["Sprint 1", "active"],
  );

  const sprintId =
    sprint.rows[0]?.id ||
    (
      await dbQuery("SELECT id FROM sprints WHERE name = $1 LIMIT 1", ["Sprint 1"])
    ).rows[0]?.id;

  const admin = (
    await dbQuery("SELECT id FROM users WHERE email = $1 LIMIT 1", ["admin@local.dev"])
  ).rows[0];

  await dbQuery(
    `INSERT INTO tasks (title, description, type, priority, status, story_points, assignee_id, sprint_id, created_by)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9),
       ($10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT DO NOTHING`,
    [
      "Set up authentication",
      "Implement login/register and protected routes",
      "story",
      "high",
      "blocked",
      5,
      admin.id,
      sprintId,
      admin.id,
      "Build first board screen",
      "Render blocked/todo/in-progress/done columns with task cards",
      "task",
      "medium",
      "in_progress",
      3,
      admin.id,
      sprintId,
      admin.id,
    ],
  );
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
