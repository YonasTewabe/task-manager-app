import {
  addTaskCommentApi,
  deleteTaskCommentApi,
  moveTaskApi,
  patchTaskApi,
  updateTaskCommentApi,
} from "../api.js";

export async function refetchAfterCrudController(
  {
    includeBootstrap = false,
    includeProject = false,
    includeDashboard = false,
    projectId = "",
  }: AnyRecord = {},
  deps: {
    token: string;
    currentUser: AnyRecord | null;
    selectedSprintId: string;
    debouncedFilters: AnyRecord;
    fetchBootstrap: () => Promise<void>;
    fetchProjectSettings: (projectId: string) => Promise<void>;
    refreshViews: (
      sprintId?: string,
      projectId?: string,
      activeFilters?: any,
    ) => Promise<void>;
    fetchMyAssignedTasks: () => Promise<void>;
    setProjectSettings: (settings: AnyRecord | null) => void;
  },
) {
  if (includeBootstrap && deps.token) await deps.fetchBootstrap();
  if (includeProject && deps.token && projectId) {
    await Promise.all([
      deps.fetchProjectSettings(projectId).catch(() => deps.setProjectSettings(null)),
      deps.refreshViews(deps.selectedSprintId, projectId, deps.debouncedFilters),
    ]);
  }
  if (includeDashboard && deps.token && deps.currentUser) {
    await deps.fetchMyAssignedTasks();
  }
}

export async function moveTaskController(
  taskId: string,
  status: string,
  { suppressErrorToast = false }: AnyRecord = {},
  deps: {
    notify: (message: string, kind?: string) => void;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
  },
) {
  try {
    await moveTaskApi(taskId, status);
    await deps.refetchAfterCrud({ includeProject: true, includeDashboard: true });
  } catch (error: any) {
    if (!suppressErrorToast) deps.notify(error?.message || "Failed to move task.", "error");
    throw error;
  }
}

export async function saveTaskController(
  taskId: string,
  patch: AnyRecord,
  options: AnyRecord = {},
  deps: {
    taskBundle: AnyRecord | null;
    openTask: (taskId: string) => Promise<void>;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
    notify: (message: string, kind?: string) => void;
  },
) {
  const lightweight = options?.lightweight === true;
  const activeTaskId = String(deps.taskBundle?.task?.id || "");
  const expectedUpdatedAt =
    activeTaskId === String(taskId || "")
      ? String(deps.taskBundle?.task?.updatedAt || "").trim()
      : "";
  const expectedRowVersion =
    activeTaskId === String(taskId || "") &&
    Number.isFinite(Number(deps.taskBundle?.task?.rowVersion))
      ? Number(deps.taskBundle.task.rowVersion)
      : null;
  const payload =
    !lightweight && (expectedUpdatedAt || expectedRowVersion != null)
      ? {
          ...patch,
          ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
          ...(expectedRowVersion != null ? { expectedRowVersion } : {}),
        }
      : patch;
  const isConflictError = (error: AnyRecord) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("task was updated by another request") || message.includes("conflict");
  };
  const patchTask = (body: AnyRecord) => patchTaskApi(taskId, body);
  try {
    await patchTask(payload);
  } catch (error: any) {
    if (!isConflictError(error)) throw error;
    await deps.openTask(taskId);
    if (lightweight) throw error;
    await patchTask(patch);
  }
  await deps.openTask(taskId);
  if (!lightweight) {
    await deps
      .refetchAfterCrud({ includeProject: true, includeDashboard: true })
      .catch((error: any) =>
        deps.notify(
          error?.message || "Failed to refresh project data after saving task.",
          "error",
        ),
      );
  }
}

export async function addCommentController(
  taskId: string,
  body: string,
  deps: {
    openTask: (taskId: string) => Promise<void>;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
  },
) {
  await addTaskCommentApi(taskId, body);
  await deps.openTask(taskId);
  await deps.refetchAfterCrud({ includeDashboard: true });
}

export async function updateCommentController(
  taskId: string,
  commentId: string,
  body: string,
  deps: {
    openTask: (taskId: string) => Promise<void>;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
  },
) {
  await updateTaskCommentApi(taskId, commentId, body);
  await deps.openTask(taskId);
  await deps.refetchAfterCrud({ includeDashboard: true });
}

export async function deleteCommentController(
  taskId: string,
  commentId: string,
  deps: {
    requestConfirmation: (payload: {
      title: string;
      message: string;
      confirmLabel?: string;
    }) => Promise<boolean>;
    openTask: (taskId: string) => Promise<void>;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
  },
) {
  const confirmed = await deps.requestConfirmation({
    title: "Delete comment",
    message: "Delete this comment? This action cannot be undone.",
    confirmLabel: "Delete comment",
  });
  if (!confirmed) return;
  await deleteTaskCommentApi(taskId, commentId);
  await deps.openTask(taskId);
  await deps.refetchAfterCrud({ includeDashboard: true });
}
