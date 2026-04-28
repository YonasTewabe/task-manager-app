import {
  createProjectApi,
  deleteProjectApi,
  patchProjectSettingsApi,
  updateProjectApi,
} from "../../taskManagement/api.js";
import { refetchAll, type Notify, type RefetchAfterCrud } from "./shared.js";

export async function createProjectController(
  payload: AnyRecord,
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    setProjects: (updater: (prev: AnyRecord[]) => AnyRecord[]) => void;
    setCurrentProjectId: (id: string) => void;
    setActiveView: (view: string) => void;
    navigate: (path: string) => void;
  },
) {
  try {
    const created = await createProjectApi(payload);
    deps.setProjects((prev) => [created, ...prev]);
    const id = String(created.id);
    deps.setCurrentProjectId(id);
    deps.setActiveView("settings");
    deps.navigate(`/project/${id}/settings`);
    deps.notify("Project created.");
    void deps
      .refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
        projectId: id,
      })
      .catch((error: any) => {
        deps.notify(error?.message || "Failed to refresh data after creating project.", "error");
      });
    return created;
  } catch (error: any) {
    deps.notify(error?.message || "Failed to create project.", "error");
    throw error;
  }
}

export async function updateProjectController(
  projectId: string,
  draft: AnyRecord,
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    setProjects: (updater: (prev: AnyRecord[]) => AnyRecord[]) => void;
  },
) {
  try {
    const updated = await updateProjectApi(projectId, draft);
    deps.setProjects((prev) =>
      prev.map((project) => (project.id === updated.id ? updated : project)),
    );
    deps.notify("Project updated.");
    refetchAll(deps.refetchAfterCrud, deps.notify, "updating project");
    return updated;
  } catch (error: any) {
    deps.notify(error?.message || "Failed to update project.", "error");
    throw error;
  }
}

export async function deleteProjectController(
  projectId: string,
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    requestConfirmation: (payload: {
      title: string;
      message: string;
      confirmLabel?: string;
    }) => Promise<boolean>;
    currentProjectId: string;
    setProjects: (updater: (prev: AnyRecord[]) => AnyRecord[]) => void;
    setCurrentProjectId: (id: string) => void;
    setActiveView: (view: string) => void;
    navigate: (path: string, opts?: AnyRecord) => void;
  },
) {
  const confirmed = await deps.requestConfirmation({
    title: "Delete project",
    message: "Delete this project? This removes all tasks and configurations permanently.",
    confirmLabel: "Delete project",
  });
  if (!confirmed) return;
  await deleteProjectApi(projectId);
  deps.setProjects((prev) =>
    prev.filter((project) => String(project.id) !== String(projectId)),
  );
  if (String(deps.currentProjectId) === String(projectId)) {
    deps.setCurrentProjectId("");
    deps.setActiveView("dashboard");
    deps.navigate("/dashboard", { replace: true });
  }
  await deps.refetchAfterCrud({
    includeBootstrap: true,
    includeProject: true,
    includeDashboard: true,
  });
  deps.notify("Project deleted.");
}

export async function saveProjectSettingsController(
  currentProjectId: string,
  nextSettings: AnyRecord,
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    setProjectSettings: (settings: AnyRecord | null) => void;
  },
) {
  if (!currentProjectId) return null;
  const updated = await patchProjectSettingsApi(currentProjectId, nextSettings);
  deps.setProjectSettings(updated);
  void deps
    .refetchAfterCrud({ includeProject: true, includeDashboard: true })
    .catch((error: any) => {
      deps.notify(error?.message || "Failed to refresh project settings data.", "error");
    });
  return updated;
}

export async function saveProjectMembersController(
  currentProjectId: string,
  memberIds: string[],
  projectAdminMemberIds: string[],
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    setProjects: (updater: (prev: AnyRecord[]) => AnyRecord[]) => void;
  },
) {
  if (!currentProjectId) return null;
  const updated = await updateProjectApi(currentProjectId, {
    memberIds,
    projectAdminMemberIds,
  });
  deps.setProjects((prev) =>
    prev.map((project) => (project.id === updated.id ? updated : project)),
  );
  deps.notify("Project users saved.");
  refetchAll(deps.refetchAfterCrud, deps.notify, "saving project users");
  return updated;
}
