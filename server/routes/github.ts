import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectManagementAccess } from "../middleware/projectManagement.js";
import {
  createPrHandler,
  createProjectRepoHandler,
  deleteProjectRepoHandler,
  listAutomationRulesHandler,
  listBranchesHandler,
  listProjectReposHandler,
  listReposHandler,
  prStatusHandler,
  replaceAutomationRulesHandler,
  resyncProjectLinksHandler,
  updateProjectRepoHandler,
  webhookHandler,
} from "../controllers/githubController.js";
const router = Router();
const requireProjectManageForParam = async (req, res, next) => {
  if (!(await requireProjectManagementAccess(req, res, req.params.projectId))) {
    return;
  }
  return next();
};

router.get("/repos", listReposHandler);
router.post("/webhook", webhookHandler);

router.use(requireAuth);

router.get("/projects/:projectId/repos", listProjectReposHandler);

router.post(
  "/projects/:projectId/repos",
  requireProjectManageForParam,
  createProjectRepoHandler,
);

router.put(
  "/projects/:projectId/repos/:repoId",
  requireProjectManageForParam,
  updateProjectRepoHandler,
);

router.post(
  "/projects/:projectId/resync",
  requireProjectManageForParam,
  resyncProjectLinksHandler,
);

router.delete(
  "/projects/:projectId/repos/:repoId",
  requireProjectManageForParam,
  deleteProjectRepoHandler,
);

router.get("/projects/:projectId/automation-rules", listAutomationRulesHandler);

router.put(
  "/projects/:projectId/automation-rules",
  requireProjectManageForParam,
  replaceAutomationRulesHandler,
);

router.get("/branches", listBranchesHandler);

router.post("/create-pr", createPrHandler);

router.post("/pr-status", prStatusHandler);

export default router;
