import {
  completeSprintApi,
  createSprintApi,
  deleteSprintApi,
  deleteTaskApi,
  fetchSprintsApi,
  startSprintApi,
  updateSprintApi,
} from "../../taskManagement/api.js";
import type { Notify, RefetchAfterCrud } from "./shared.js";

export async function createSprintController(
  draft: AnyRecord,
  deps: {
    currentProjectId: string;
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    setSprints: (updater: (prev: AnyRecord[]) => AnyRecord[]) => void;
  },
) {
  if (!deps.currentProjectId) return;
  try {
    const created = await createSprintApi({
      name: draft.name,
      projectId: deps.currentProjectId,
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
      status: "planned",
    });
    deps.setSprints((prev) =>
      [created, ...prev].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    );
    deps.notify("Sprint created.");
    void deps
      .refetchAfterCrud({ includeProject: true, includeDashboard: true })
      .catch((error: any) => {
        deps.notify(error?.message || "Failed to refresh data after creating sprint.", "error");
      });
    return created;
  } catch (error: any) {
    deps.notify(error?.message || "Failed to create sprint.", "error");
    throw error;
  }
}

export async function updateSprintController(
  sprintId: string,
  draft: AnyRecord,
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    setSprints: (updater: (prev: AnyRecord[]) => AnyRecord[]) => void;
  },
) {
  const updated = await updateSprintApi(sprintId, draft);
  deps.setSprints((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  void deps
    .refetchAfterCrud({ includeProject: true, includeDashboard: true })
    .catch((error: any) => {
      deps.notify(error?.message || "Failed to refresh data after updating sprint.", "error");
    });
  deps.notify("Sprint updated.");
}

export async function deleteTaskController(
  taskId: string,
  deps: {
    notify: Notify;
    taskBundle: AnyRecord | null;
    setTaskBundle: (bundle: AnyRecord | null) => void;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
    requestConfirmation: (payload: {
      title: string;
      message: string;
      confirmLabel?: string;
    }) => Promise<boolean>;
  },
) {
  const confirmed = await deps.requestConfirmation({
    title: "Delete task",
    message: "Delete this task? ",
    confirmLabel: "Delete task",
  });
  if (!confirmed) return;
  try {
    await deleteTaskApi(taskId);
    if (String(deps.taskBundle?.task?.id) === String(taskId)) deps.setTaskBundle(null);
    await deps.refetchAfterCrud({ includeProject: true, includeDashboard: true });
    deps.notify("Task deleted.");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to delete task.", "error");
    throw error;
  }
}

export async function startSprintController(
  sprintId: string,
  deps: {
    currentProjectId: string;
    notify: Notify;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
    setSprints: (value: AnyRecord[]) => void;
  },
) {
  try {
    await startSprintApi(sprintId);
    deps.setSprints(await fetchSprintsApi(deps.currentProjectId));
    await deps.refetchAfterCrud({ includeProject: true, includeDashboard: true });
  } catch (error: any) {
    deps.notify(error?.message || "Failed to start sprint.", "error");
  }
}

export async function completeSprintController(
  sprintId: string,
  moveIncompleteToSprintId: string | null,
  deps: {
    currentProjectId: string;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
    setSprints: (value: AnyRecord[]) => void;
  },
) {
  await completeSprintApi(sprintId, moveIncompleteToSprintId);
  deps.setSprints(await fetchSprintsApi(deps.currentProjectId));
  await deps.refetchAfterCrud({
    includeBootstrap: true,
    includeProject: true,
    includeDashboard: true,
  });
}

export async function deleteSprintController(
  sprintId: string,
  deps: {
    currentProjectId: string;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
    setSprints: (value: AnyRecord[]) => void;
  },
) {
  await deleteSprintApi(sprintId);
  deps.setSprints(await fetchSprintsApi(deps.currentProjectId));
  await deps.refetchAfterCrud({ includeProject: true, includeDashboard: true });
}
