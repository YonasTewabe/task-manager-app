import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { createUploadMiddleware, handleUploadError } from "../utils/upload.js";
import {
  assignSprintTasksHandler,
  boardHandler,
  boardPagedHandler,
  bootstrapHandler,
  completeSprintHandler,
  createProjectHandler,
  createSprintHandler,
  createUserGroupHandler,
  createUserHandler,
  deleteProjectHandler,
  deleteSprintHandler,
  deleteUserGroupHandler,
  deleteUserHandler,
  disableUserHandler,
  enableUserHandler,
  patchProjectHandler,
  patchProjectSettingsHandler,
  patchSprintHandler,
  patchUserGroupHandler,
  patchUserHandler,
  projectSettingsHandler,
  removeSprintTaskHandler,
  startSprintHandler,
} from "../controllers/taskManagementAdminController.js";
import {
  analyticsFlowHandler,
  analyticsOverviewHandler,
  analyticsSprintHandler,
  analyticsWorkloadHandler,
  assignedTasksHandler,
  backlogHandler,
  backlogPagedHandler,
  backlogRowsHandler,
  dashboardHandler,
  exportReportHandler,
  getGithubSettingsHandler,
  getGithubSummaryHandler,
  listProjectsHandler,
  pagedProjectsHandler,
  patchGithubSettingsHandler,
  sendEmailHandler,
  sprintTasksHandler,
  sprintsHandler,
  tasksHandler,
  tasksPagedHandler,
  tasksSearchHandler,
  userGroupsHandler,
  usersHandler,
  usersPagedHandler,
} from "../controllers/taskManagementController.js";
import {
  addCommentHandler,
  createTaskHandler,
  deleteCommentHandler,
  deleteTaskHandler,
  getTaskBundleHandler,
  moveTaskHandler,
  patchTaskHandler,
  updateCommentHandler,
} from "../controllers/taskOperationsController.js";

const router = Router();
router.use(requireAuth);
const upload = createUploadMiddleware({
  subDir: "task-management",
  allowedMimeTypes: [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ],
});

router.get("/bootstrap", bootstrapHandler);

router.get("/me/assigned-tasks", assignedTasksHandler);

router.get("/app-settings/github", requireRole("admin"), getGithubSettingsHandler);

/** Org + flags only (no secrets); any signed-in user — for project settings / integration UI. */
router.get("/app-settings/github/summary", getGithubSummaryHandler);

router.patch("/app-settings/github", requireRole("admin"), patchGithubSettingsHandler);

router.post("/upload", (req, res) => {
  const middleware = upload.single("file");
  middleware(req, res, (error) => {
    const uploadErrorResponse = handleUploadError(error, res);
    if (uploadErrorResponse) return uploadErrorResponse;
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const publicPath = `/uploads/task-management/${req.file.filename}`;
    const publicUrl = `${req.protocol}://${req.get("host")}${publicPath}`;
    return res.status(201).json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      url: publicUrl,
    });
  });
});

router.post("/email/send", sendEmailHandler);

router.get("/projects", listProjectsHandler);

router.get("/projects/paged", pagedProjectsHandler);

router.post("/projects", createProjectHandler);

router.patch("/projects/:projectId", patchProjectHandler);

router.delete("/projects/:projectId", deleteProjectHandler);

router.get("/projects/:projectId/settings", projectSettingsHandler);

router.patch("/projects/:projectId/settings", patchProjectSettingsHandler);

router.get("/board", boardHandler);

router.get("/board/paged", boardPagedHandler);

router.get("/tasks/search", tasksSearchHandler);

router.get("/dashboard", dashboardHandler);

router.get("/analytics/overview", analyticsOverviewHandler);

router.get("/analytics/sprint", analyticsSprintHandler);

router.get("/analytics/flow", analyticsFlowHandler);

router.get("/analytics/workload", analyticsWorkloadHandler);

router.get("/reports/export", exportReportHandler);

router.get("/users", usersHandler);

router.get("/users/paged", usersPagedHandler);

router.get("/user-groups", userGroupsHandler);

router.post("/user-groups", requireRole("admin"), createUserGroupHandler);

router.patch("/user-groups/:groupId", requireRole("admin"), patchUserGroupHandler);

router.delete("/user-groups/:groupId", requireRole("admin"), deleteUserGroupHandler);

router.post("/users", requireRole("admin"), createUserHandler);

router.patch("/users/:userId", requireRole("admin"), patchUserHandler);

router.patch("/users/:userId/disable", requireRole("admin"), disableUserHandler);

router.patch("/users/:userId/enable", requireRole("admin"), enableUserHandler);

router.delete("/users/:userId", requireRole("admin"), deleteUserHandler);

router.get("/sprints", sprintsHandler);

router.post("/sprints", createSprintHandler);

router.patch("/sprints/:sprintId", patchSprintHandler);

router.post("/sprints/:sprintId/start", startSprintHandler);

router.post("/sprints/:sprintId/complete", completeSprintHandler);

router.get("/sprints/:sprintId/tasks", sprintTasksHandler);

router.post("/sprints/:sprintId/tasks", assignSprintTasksHandler);

router.delete("/sprints/:sprintId/tasks/:taskId", removeSprintTaskHandler);

router.delete("/sprints/:sprintId", deleteSprintHandler);

router.get("/tasks", tasksHandler);

router.get("/tasks/paged", tasksPagedHandler);

router.get("/backlog", backlogHandler);

router.get("/backlog/paged", backlogPagedHandler);

router.get("/backlog/rows", backlogRowsHandler);

router.post("/tasks", createTaskHandler);

router.get("/tasks/:taskId", getTaskBundleHandler);

router.patch("/tasks/:taskId", patchTaskHandler);

router.patch("/tasks/:taskId/move", moveTaskHandler);

router.delete("/tasks/:taskId", deleteTaskHandler);

router.post("/tasks/:taskId/comments", addCommentHandler);

router.patch("/tasks/:taskId/comments/:commentId", updateCommentHandler);

router.delete("/tasks/:taskId/comments/:commentId", deleteCommentHandler);

export default router;
