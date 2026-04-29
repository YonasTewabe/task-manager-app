import {
  addTasksToSprintApi,
  createTaskApi,
  patchTaskApi,
  removeTaskFromSprintApi,
  uploadTaskAssetApi,
} from "../api.js";

export async function uploadTaskAssetController(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const uploaded = await uploadTaskAssetApi(formData);
  if (!uploaded?.url) throw new Error("Upload completed but file URL is missing.");
  return uploaded;
}

export async function createTaskController(
  event: { preventDefault: () => void },
  deps: {
    canManageProject: boolean;
    taskTitle: string;
    taskType: string;
    currentProjectId: string;
    activeView: string;
    activeSprintId: string;
    createTaskSprintId: string;
    createTaskDefaultStatus: string;
    storyPoints: string;
    taskDueDate: string;
    taskPriority: string;
    taskLabel: string;
    taskVersion: string;
    assigneeId: string;
    createTaskDescriptionRef: { current: HTMLElement | null };
    setCreateTaskFieldErrors: (errors: AnyRecord) => void;
    setTaskTitle: (value: string) => void;
    setStoryPoints: (value: string) => void;
    setTaskDueDate: (value: string) => void;
    setAssigneeId: (value: string) => void;
    setTaskPriority: (value: string) => void;
    setTaskType: (value: string) => void;
    setTaskLabel: (value: string) => void;
    setTaskVersion: (value: string) => void;
    setCreateTaskSprintId: (value: string) => void;
    setShowCreateTaskModal: (value: boolean) => void;
    notify: (message: string, kind?: string) => void;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
    requiredFieldMessage: string;
  },
) {
  event.preventDefault();
  if (!deps.canManageProject) return;
  const nextErrors: AnyRecord = {};
  if (!deps.taskTitle.trim()) nextErrors.title = deps.requiredFieldMessage;
  if (!String(deps.taskType || "").trim()) nextErrors.type = deps.requiredFieldMessage;
  if (Object.keys(nextErrors).length) return deps.setCreateTaskFieldErrors(nextErrors);
  deps.setCreateTaskFieldErrors({});
  if (!deps.currentProjectId) return;

  const noActiveSprint =
    deps.activeView === "board" && !deps.activeSprintId && !deps.createTaskSprintId;
  if (noActiveSprint) {
    deps.notify("No active sprint found. Start a sprint before creating tasks from board.", "error");
    return;
  }
  const targetSprintId =
    deps.createTaskSprintId || (deps.activeView === "board" ? deps.activeSprintId : "") || null;
  const taskDescription = deps.createTaskDescriptionRef.current?.innerHTML || "";
  await createTaskApi({
    title: deps.taskTitle.trim(),
    description: taskDescription,
    storyPoints: deps.storyPoints === "" ? null : Number(deps.storyPoints),
    dueDate: deps.taskDueDate || null,
    status: deps.createTaskDefaultStatus,
    priority: deps.taskPriority,
    type: deps.taskType,
    label: deps.taskLabel.trim(),
    version: deps.taskVersion.trim(),
    projectId: deps.currentProjectId,
    assigneeId: deps.assigneeId || null,
    sprintId: targetSprintId,
  });

  deps.setTaskTitle("");
  deps.setStoryPoints("");
  deps.setTaskDueDate("");
  deps.setAssigneeId("");
  deps.setTaskPriority("medium");
  deps.setTaskType("");
  deps.setTaskLabel("");
  deps.setTaskVersion("");
  deps.setCreateTaskSprintId("");
  if (deps.createTaskDescriptionRef.current) deps.createTaskDescriptionRef.current.innerHTML = "";
  deps.setShowCreateTaskModal(false);
  await deps.refetchAfterCrud({ includeProject: true, includeDashboard: true });
}

export async function assignTaskToSprintFromBacklogController(
  taskId: string,
  sprintId: string | null,
  deps: {
    notify: (message: string, kind?: string) => void;
    refetchAfterCrud: (opts: AnyRecord) => Promise<void>;
  },
) {
  try {
    await patchTaskApi(taskId, { sprintId: sprintId || null });
    await deps.refetchAfterCrud({ includeProject: true, includeDashboard: true });
    deps.notify("Task moved.");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to move task.", "error");
    throw error;
  }
}

export async function addTasksToSprintController(
  sprintId: string,
  taskIds: string[],
  deps: {
    currentProjectId: string;
    filters: AnyRecord;
    fetchBacklog: (projectId?: string, activeFilters?: any) => Promise<void>;
    fetchSprintTasks: (sprintId: string, projectId?: string) => Promise<void>;
    fetchBoard: (sprintId?: string, projectId?: string, activeFilters?: any) => Promise<void>;
  },
) {
  await addTasksToSprintApi(sprintId, taskIds);
  await Promise.all([
    deps.fetchBacklog(deps.currentProjectId, deps.filters),
    deps.fetchSprintTasks(sprintId, deps.currentProjectId),
    deps.fetchBoard(sprintId, deps.currentProjectId, deps.filters),
  ]);
}

export async function removeTaskFromSprintController(
  sprintId: string,
  taskId: string,
  deps: {
    currentProjectId: string;
    filters: AnyRecord;
    fetchBacklog: (projectId?: string, activeFilters?: any) => Promise<void>;
    fetchSprintTasks: (sprintId: string, projectId?: string) => Promise<void>;
    fetchBoard: (sprintId?: string, projectId?: string, activeFilters?: any) => Promise<void>;
  },
) {
  await removeTaskFromSprintApi(sprintId, taskId);
  await Promise.all([
    deps.fetchBacklog(deps.currentProjectId, deps.filters),
    deps.fetchSprintTasks(sprintId, deps.currentProjectId),
    deps.fetchBoard(sprintId, deps.currentProjectId, deps.filters),
  ]);
}
