import {
  getSprintProjectId,
  userCanManageProject,
} from "../services/taskService.js";

export async function requireProjectManagementAccess(req, res, projectId) {
  if (req.user?.role === "admin") return true;
  try {
    const ok = await userCanManageProject(req.user.id, projectId);
    if (!ok) {
      res.status(403).json({ error: "Insufficient permissions" });
      return false;
    }
    return true;
  } catch {
    res.status(500).json({ error: "Failed to verify permissions" });
    return false;
  }
}

export async function requireProjectManagementAccessForSprint(req, res, sprintId) {
  try {
    const projectId = await getSprintProjectId(sprintId);
    if (!projectId) {
      res.status(404).json({ error: "Sprint not found" });
      return false;
    }
    return requireProjectManagementAccess(req, res, projectId);
  } catch {
    res.status(500).json({ error: "Failed to verify permissions" });
    return false;
  }
}
