import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../index.js";
import { dbQuery, pool } from "../db/pool.js";
import { initSchema } from "../db/initSchema.js";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "true";
const app = createApp();

async function resetData() {
  await dbQuery("DELETE FROM task_activity");
  await dbQuery("DELETE FROM task_comments");
  await dbQuery("DELETE FROM tasks");
  await dbQuery("DELETE FROM sprints");
  await dbQuery("DELETE FROM users");
}

test("auth + board + sprint smoke flow", { skip: !shouldRun }, async () => {
  await initSchema();
  await resetData();

  const register = await request(app).post("/api/auth/register").send({
    name: "Smoke Admin",
    email: "smoke-admin@local.dev",
    password: "Admin123!",
  });
  assert.equal(register.status, 201);
  const token = register.body.token;
  assert.ok(token);

  const sprint = await request(app)
    .post("/api/task-management/sprints")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Smoke Sprint", status: "planned" });
  assert.equal(sprint.status, 201);

  const started = await request(app)
    .post(`/api/task-management/sprints/${sprint.body.id}/start`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
  assert.equal(started.status, 200);
  assert.equal(started.body.status, "active");

  const task = await request(app)
    .post("/api/task-management/tasks")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Smoke Task", sprintId: sprint.body.id, storyPoints: 3 });
  assert.equal(task.status, 201);

  const moved = await request(app)
    .patch(`/api/task-management/tasks/${task.body.id}/move`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "done" });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.status, "done");

  const completed = await request(app)
    .post(`/api/task-management/sprints/${sprint.body.id}/complete`)
    .set("Authorization", `Bearer ${token}`)
    .send({ moveIncompleteToBacklog: true });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.status, "completed");
});

test.after(async () => {
  await pool.end();
});
