import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { isNonEmptyString } from "../utils/validation.js";
import {
  STATUS_COLUMNS,
  addTaskActivity,
  addTaskComment,
  assignTaskToSprint,
  buildBoard,
  completeSprint,
  createProject,
  createSprint,
  createTask,
  createUser,
  deleteProject,
  deleteUser,
  deleteTask,
  getProjects,
  getSprints,
  getTaskActivity,
  getTaskById,
  getTaskComments,
  getTasks,
  getUsers,
  getSystemSettings,
  removeTaskFromSprint,
  updateSystemSettings,
  updateUser,
  updateProject,
  updateSprint,
  updateTask,
} from "../services/taskService.js";

const router = Router();
router.use(requireAuth);

router.get("/bootstrap", async (req, res) => {
  const [users, sprints, tasks, projects] = await Promise.all([
    getUsers(),
    getSprints(),
    getTasks(),
    getProjects(),
  ]);
  res.json({
    currentUser: req.user,
    columns: STATUS_COLUMNS,
    users,
    sprints,
    tasks,
    projects,
  });
});

router.get("/projects", async (_req, res) => {
  const projects = await getProjects();
  return res.json(projects);
});

router.post("/projects", async (req, res) => {
  if (!isNonEmptyString(req.body?.name) || !isNonEmptyString(req.body?.projectKey)) {
    return res.status(400).json({ error: "name and projectKey are required" });
  }
  try {
    const project = await createProject({
      name: req.body.name.trim(),
      projectKey: req.body.projectKey.trim().toUpperCase(),
      description: req.body.description || "",
      memberIds: req.body.memberIds || [],
    });
    return res.status(201).json(project);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Project key already exists" });
    }
    return res.status(500).json({ error: "Failed to create project" });
  }
});

router.patch("/projects/:projectId", async (req, res) => {
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body.projectKey !== undefined) patch.projectKey = String(req.body.projectKey).trim().toUpperCase();
  if (req.body.description !== undefined) patch.description = String(req.body.description);
  if (req.body.memberIds !== undefined) patch.memberIds = req.body.memberIds;

  try {
    const project = await updateProject(req.params.projectId, patch);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    return res.json(project);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Project key already exists" });
    }
    return res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/projects/:projectId", async (req, res) => {
  const deleted = await deleteProject(req.params.projectId);
  if (!deleted) {
    return res.status(404).json({ error: "Project not found" });
  }
  return res.status(204).send();
});

router.get("/board", async (req, res) => {
  const sprintId = req.query.sprintId ? String(req.query.sprintId) : "";
  const filters = {
    assigneeId: req.query.assigneeId,
    status: req.query.status,
    priority: req.query.priority,
    label: req.query.label,
    search: req.query.search,
  };
  const columns = await buildBoard(sprintId || null, filters);
  return res.json({ columns });
});

router.get("/users", async (_req, res) => {
  const users = await getUsers();
  return res.json(users);
});

router.get("/settings", async (_req, res) => {
  const settings = await getSystemSettings();
  return res.json(settings);
});

router.patch("/settings", requireRole("admin"), async (req, res) => {
  const settings = await updateSystemSettings(req.body || {});
  return res.json(settings);
});

router.post("/users", requireRole("admin"), async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "name and email are required" });
  }
  const passwordHash = await bcrypt.hash(req.body.password || "ChangeMe123!", 10);
  try {
    const created = await createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role: req.body.role || "member",
    });
    return res.status(201).json(created);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/users/:userId", requireRole("admin"), async (req, res) => {
  const payload = {};
  if (isNonEmptyString(req.body?.name)) payload.name = req.body.name.trim();
  if (isNonEmptyString(req.body?.email)) payload.email = req.body.email.trim().toLowerCase();
  if (isNonEmptyString(req.body?.role)) payload.role = req.body.role;
  if (isNonEmptyString(req.body?.password)) {
    payload.passwordHash = await bcrypt.hash(req.body.password, 10);
  }

  const updated = await updateUser(req.params.userId, payload);
  if (!updated) {
    return res.status(404).json({ error: "User not found or no valid fields to update" });
  }
  return res.json(updated);
});

router.delete("/users/:userId", requireRole("admin"), async (req, res) => {
  const targetUserId = String(req.params.userId);
  if (targetUserId === String(req.user.id)) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  const deleted = await deleteUser(targetUserId);
  if (!deleted) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.status(204).send();
});

router.get("/sprints", async (_req, res) => {
  const sprints = await getSprints();
  return res.json(sprints);
});

router.post("/sprints", requireRole("admin"), async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }
  const sprint = await createSprint(req.body);
  return res.status(201).json(sprint);
});

router.patch("/sprints/:sprintId", requireRole("admin"), async (req, res) => {
  const sprint = await updateSprint(req.params.sprintId, req.body || {});
  if (!sprint) {
    return res.status(404).json({ error: "Sprint not found or no fields to update" });
  }
  return res.json(sprint);
});

router.post("/sprints/:sprintId/start", requireRole("admin"), async (req, res) => {
  const sprint = await updateSprint(req.params.sprintId, { status: "active" });
  if (!sprint) {
    return res.status(404).json({ error: "Sprint not found" });
  }
  return res.json(sprint);
});

router.post("/sprints/:sprintId/complete", requireRole("admin"), async (req, res) => {
  const moveIncompleteToBacklog = req.body?.moveIncompleteToBacklog !== false;
  const sprint = await completeSprint(req.params.sprintId, moveIncompleteToBacklog);
  if (!sprint) {
    return res.status(404).json({ error: "Sprint not found" });
  }
  return res.json(sprint);
});

router.get("/sprints/:sprintId/tasks", async (req, res) => {
  const tasks = await getTasks({ sprintId: req.params.sprintId });
  return res.json(tasks);
});

router.post("/sprints/:sprintId/tasks", requireRole("admin"), async (req, res) => {
  const sprintId = String(req.params.sprintId);
  const taskIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
  if (!taskIds.length) {
    return res.status(400).json({ error: "taskIds is required" });
  }

  const updatedTasks = [];
  for (const taskId of taskIds) {
    const updated = await assignTaskToSprint(String(taskId), sprintId);
    if (updated) updatedTasks.push(updated);
  }
  return res.json({ updatedTasks });
});

router.delete("/sprints/:sprintId/tasks/:taskId", requireRole("admin"), async (req, res) => {
  const removed = await removeTaskFromSprint(
    String(req.params.taskId),
    String(req.params.sprintId),
  );
  if (!removed) {
    return res.status(404).json({ error: "Task not found in sprint" });
  }
  return res.json(removed);
});

router.get("/tasks", async (req, res) => {
  const tasks = await getTasks({
    sprintId: req.query.sprintId,
    assigneeId: req.query.assigneeId,
    status: req.query.status,
    priority: req.query.priority,
    label: req.query.label,
    search: req.query.search,
  });
  return res.json(tasks);
});

router.get("/backlog", async (req, res) => {
  const tasks = await getTasks({
    sprintId: "backlog",
    assigneeId: req.query.assigneeId,
    status: req.query.status,
    priority: req.query.priority,
    label: req.query.label,
    search: req.query.search,
  });
  return res.json(tasks);
});

router.post("/tasks", async (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  const created = await createTask(req.body, req.user.id);
  await addTaskActivity(created.id, req.user.id, "task_created", { title: created.title });
  return res.status(201).json(created);
});

router.get("/tasks/:taskId", async (req, res) => {
  const task = await getTaskById(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const comments = await getTaskComments(req.params.taskId);
  const activity = await getTaskActivity(req.params.taskId);
  return res.json({ task, comments, activity });
});

router.patch("/tasks/:taskId", async (req, res) => {
  const current = await getTaskById(req.params.taskId);
  if (!current) {
    return res.status(404).json({ error: "Task not found" });
  }

  const updated = await updateTask(req.params.taskId, req.body || {});
  if (!updated) {
    return res.status(400).json({ error: "No valid fields provided" });
  }

  await addTaskActivity(updated.id, req.user.id, "task_updated", {
    before: current.status,
    after: updated.status,
  });
  return res.json(updated);
});

router.patch("/tasks/:taskId/move", async (req, res) => {
  const nextStatus = req.body?.status;
  if (!STATUS_COLUMNS.includes(nextStatus)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const current = await getTaskById(req.params.taskId);
  if (!current) {
    return res.status(404).json({ error: "Task not found" });
  }
  const updated = await updateTask(req.params.taskId, { status: nextStatus });
  await addTaskActivity(updated.id, req.user.id, "task_moved", {
    from: current.status,
    to: updated.status,
  });
  return res.json(updated);
});

router.delete("/tasks/:taskId", async (req, res) => {
  const deleted = await deleteTask(req.params.taskId);
  if (!deleted) {
    return res.status(404).json({ error: "Task not found" });
  }
  return res.status(204).send();
});

router.post("/tasks/:taskId/comments", async (req, res) => {
  if (!isNonEmptyString(req.body?.body)) {
    return res.status(400).json({ error: "Comment body is required" });
  }

  const task = await getTaskById(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const comment = await addTaskComment(req.params.taskId, req.user.id, req.body.body.trim());
  await addTaskActivity(req.params.taskId, req.user.id, "comment_added", {});
  return res.status(201).json(comment);
});

export default router;
