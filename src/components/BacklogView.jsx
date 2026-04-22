import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WORKFLOW_STAGES } from "../workflowDefaults.js";
import { displayTaskRef } from "../utils/taskDisplay.js";
import Modal from "./ui/Modal";

function sumStoryPoints(tasks, statuses) {
  const allowed = new Set(Array.isArray(statuses) ? statuses : [statuses]);
  return tasks.reduce((total, task) => {
    if (!allowed.has(task.status)) return total;
    return total + (Number(task.storyPoints) || 0);
  }, 0);
}

function getCounterBuckets(stages) {
  const upcoming = [];
  const active = [];
  const done = [];
  (stages || []).forEach((s) => {
    const g =
      s.counterGroup === "active"
        ? "active"
        : s.counterGroup === "done"
          ? "done"
          : "upcoming";
    if (g === "done") done.push(s.key);
    else if (g === "active") active.push(s.key);
    else upcoming.push(s.key);
  });
  return { upcoming, active, done };
}

function formatSprintDateRange(startDate, endDate) {
  const toText = (value) => {
    const parsed = Date.parse(value || "");
    if (!Number.isFinite(parsed)) return "";
    return new Date(parsed).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };
  const startText = toText(startDate);
  const endText = toText(endDate);
  if (startText && endText) return `${startText} - ${endText}`;
  return startText || endText || "";
}

export default function BacklogView({
  tasks,
  sprints,
  allTasks,
  usersById,
  userAvatarColor,
  workflowStages,
  selectedSprintId,
  onSelectSprint: _onSelectSprint,
  canManage,
  onStartSprint,
  onCompleteSprint,
  onDeleteSprint,
  onAssignTaskToSprint,
  onCreateSprint,
  onAddTask,
  onOpenTask,
  onDeleteTask,
  onNotify,
}) {
  const assigneeLabel = (task) =>
    task.assigneeId
      ? usersById?.get(task.assigneeId) || "Unknown"
      : "Unassigned";
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set(["backlog"]));
  const [createDraft, setCreateDraft] = useState({
    name: "",
    startDate: "",
    endDate: "",
  });
  const [createNameError, setCreateNameError] = useState("");
  const [sprintCompleteDialog, setSprintCompleteDialog] = useState(null);
  const [sprintDeleteDialog, setSprintDeleteDialog] = useState(null);
  const [sprintDeleteError, setSprintDeleteError] = useState("");
  const movedTaskTimeoutRef = useRef(null);
  const blockedDropTimeoutRef = useRef(null);
  const [dragState, setDragState] = useState({
    taskId: "",
    sourceKey: "",
    overKey: "",
  });
  const [recentlyMovedTaskId, setRecentlyMovedTaskId] = useState("");
  const [blockedDropKey, setBlockedDropKey] = useState("");
  const stageList = workflowStages?.length
    ? workflowStages
    : DEFAULT_WORKFLOW_STAGES;
  const counterBuckets = useMemo(
    () => getCounterBuckets(stageList),
    [stageList],
  );

  const tasksBySprint = new Map();
  allTasks.forEach((task) => {
    const key = task.sprintId == null ? "backlog" : String(task.sprintId);
    const list = tasksBySprint.get(key) || [];
    list.push(task);
    tasksBySprint.set(key, list);
  });

  const sprintRows = [...sprints]
    .filter(
      (sprint) =>
        sprint.status === "active" ||
        sprint.status === "planned" ||
        String(sprint.id) === String(selectedSprintId || ""),
    )
    .map((sprint) => {
      const sprintTaskList = tasksBySprint.get(String(sprint.id)) || [];
      return {
        key: String(sprint.id),
        name: sprint.name,
        status: sprint.status,
        startDate: sprint.startDate || "",
        endDate: sprint.endDate || "",
        tasks: sprintTaskList,
      };
    });

  const sortByDateThenName = (a, b) => {
    const aDate =
      Date.parse(a.startDate || a.endDate || "") || Number.POSITIVE_INFINITY;
    const bDate =
      Date.parse(b.startDate || b.endDate || "") || Number.POSITIVE_INFINITY;
    if (aDate !== bDate) return aDate - bDate;
    return String(a.name || "").localeCompare(String(b.name || ""));
  };

  const activeSprintRows = sprintRows
    .filter((row) => row.status === "active")
    .sort(sortByDateThenName);
  const plannedSprintRows = sprintRows
    .filter((row) => row.status === "planned")
    .sort(sortByDateThenName);
  const otherSprintRows = sprintRows
    .filter((row) => row.status !== "active" && row.status !== "planned")
    .sort(sortByDateThenName);

  const backlogRow = {
    key: "backlog",
    name: "Backlog",
    status: "backlog",
    tasks,
  };

  const rows = selectedSprintId
    ? sprintRows.filter((row) => String(row.key) === String(selectedSprintId))
    : [
        backlogRow,
        ...activeSprintRows,
        ...plannedSprintRows,
        ...otherSprintRows,
      ];

  const toggleExpanded = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    return () => {
      window.clearTimeout(movedTaskTimeoutRef.current);
      window.clearTimeout(blockedDropTimeoutRef.current);
    };
  }, []);

  return (
    <section className="grid gap-2 rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]">
      <div className="flex items-center justify-between gap-3">
        <h2></h2>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setShowCreateSprintModal(true)}
            >
              Add Sprint
            </button>
          ) : null}

          <button type="button" onClick={onAddTask}>
            Add Task
          </button>
        </div>
      </div>
      <div className="grid gap-[0.45rem]">
        {rows.map((row) => {
          const redPoints = sumStoryPoints(row.tasks, counterBuckets.upcoming);
          const bluePoints = sumStoryPoints(row.tasks, counterBuckets.active);
          const greenPoints = sumStoryPoints(row.tasks, counterBuckets.done);
          const isSelected =
            row.key === "backlog"
              ? !selectedSprintId
              : String(selectedSprintId) === row.key;
          const isExpanded = expandedKeys.has(row.key);
          const sprintDateRange =
            row.status === "backlog"
              ? ""
              : formatSprintDateRange(row.startDate, row.endDate);
          return (
            <article key={row.key} className="grid gap-1">
              <div
                className={`flex cursor-pointer items-center justify-between gap-2 rounded border border-[#e3e7ef] bg-[#fbfcfe] px-[0.7rem] py-[0.6rem] transition-[border-color,background-color,box-shadow] duration-150 ${isSelected ? "border-[#b8c9e8] bg-[#f2f6ff]" : ""} ${dragState.sourceKey === row.key ? "border-dashed" : ""} ${dragState.overKey === row.key ? "border-[#2f6feb] bg-[#eaf1ff] shadow-[inset_0_0_0_1px_rgba(47,111,235,0.18)]" : ""} ${blockedDropKey === row.key ? "border-red-600 bg-[#fff2f2] ring-1 ring-red-300" : ""}`}
                onDragOver={(event) => {
                  if (!canManage) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragEnter={(event) => {
                  if (!canManage || !dragState.taskId) return;
                  event.preventDefault();
                  setDragState((prev) => ({ ...prev, overKey: row.key }));
                }}
                onDragLeave={() => {
                  setDragState((prev) =>
                    prev.overKey === row.key ? { ...prev, overKey: "" } : prev,
                  );
                }}
                onDrop={async (event) => {
                  if (!canManage) return;
                  const taskId = String(
                    event.dataTransfer.getData("text/task-id") || "",
                  ).trim();
                  const sourceKey = String(
                    event.dataTransfer.getData("text/source-sprint-id") || "",
                  ).trim();
                  if (!taskId || sourceKey === row.key) {
                    setDragState({ taskId: "", sourceKey: "", overKey: "" });
                    return;
                  }
                  event.preventDefault();
                  try {
                    await onAssignTaskToSprint(
                      taskId,
                      row.key === "backlog" ? null : row.key,
                    );
                    setRecentlyMovedTaskId(taskId);
                    window.clearTimeout(movedTaskTimeoutRef.current);
                    movedTaskTimeoutRef.current = window.setTimeout(
                      () => setRecentlyMovedTaskId(""),
                      700,
                    );
                  } catch {
                    setBlockedDropKey(row.key);
                    window.clearTimeout(blockedDropTimeoutRef.current);
                    blockedDropTimeoutRef.current = window.setTimeout(
                      () => setBlockedDropKey(""),
                      850,
                    );
                  } finally {
                    setDragState({ taskId: "", sourceKey: "", overKey: "" });
                  }
                }}
                onClick={() => {
                  toggleExpanded(row.key);
                }}
              >
                <div className="flex items-center gap-[0.45rem]">
                  <span
                    className={`inline-block text-[0.85rem] text-[#5e6c84] transition-transform duration-100 ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                  >
                    ▾
                  </span>
                  <strong>{row.name}</strong>
                  <span className="text-[#5e6c84]">
                    ({row.tasks.length} work items )
                    {sprintDateRange ? ` ${sprintDateRange}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-[0.3rem]">
                    <span className="min-w-6 rounded border border-[#f3c6c3] bg-[#fdeceb] px-[0.28rem] py-[0.08rem] text-center text-[0.7rem] text-[#b42318]">{redPoints}</span>
                    <span className="min-w-6 rounded border border-[#c6d9ff] bg-[#e9f2ff] px-[0.28rem] py-[0.08rem] text-center text-[0.7rem] text-[#114fba]">{bluePoints}</span>
                    <span className="min-w-6 rounded border border-[#bde7ca] bg-[#e8f7ed] px-[0.28rem] py-[0.08rem] text-center text-[0.7rem] text-[#1a7f37]">{greenPoints}</span>
                  </div>
                  {row.status === "active" && canManage ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const destinations = rows.filter(
                          (candidate) =>
                            candidate.key !== row.key &&
                            candidate.status !== "completed",
                        );
                        setSprintCompleteDialog({
                          sprintKey: row.key,
                          sprintName: row.name,
                          destinationSprintId: "",
                          destinationOptions: destinations.map((item) => ({
                            key: item.key,
                            name: item.name,
                            status: item.status,
                          })),
                        });
                      }}
                    >
                      Complete sprint
                    </button>
                  ) : null}
                  {row.status === "planned" && canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onStartSprint(row.key);
                        }}
                      >
                        Start sprint
                      </button>
                    </>
                  ) : null}
                  {row.status === "planned" && canManage ? (
                    <button
                      type="button"
                      className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                      onClick={(event) => {
                        event.stopPropagation();
                        const destinations = [
                          {
                            key: "backlog",
                            name: "Backlog",
                            status: "backlog",
                          },
                          ...sprintRows.filter(
                            (candidate) =>
                              candidate.key !== row.key &&
                              candidate.status !== "completed",
                          ),
                        ];
                        setSprintDeleteError("");
                        setSprintDeleteDialog({
                          sprintKey: row.key,
                          sprintName: row.name,
                          taskIds: row.tasks.map((task) => String(task.id)),
                          destinationSprintId: "",
                          destinationOptions: destinations.map((item) => ({
                            key: item.key,
                            name: item.name,
                            status: item.status,
                          })),
                        });
                      }}
                    >
                      Delete sprint
                    </button>
                  ) : null}
                </div>
              </div>
              {isExpanded ? (
                <div className="grid gap-[0.35rem] rounded border border-[#e3e7ef] bg-white p-[0.4rem]">
                  {row.tasks.length ? (
                    row.tasks.map((task) => (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        className={`flex w-full justify-between gap-3 rounded-md border border-[#dfe1e6] bg-white px-[0.5rem] py-[0.45rem] text-left text-[#172b4d] transition-[transform,box-shadow,opacity,border-color,background-color] duration-200 ${dragState.taskId === String(task.id) ? "scale-[0.98] opacity-50" : ""} ${recentlyMovedTaskId === String(task.id) ? "animate-pulse" : ""}`}
                        draggable={canManage}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "text/task-id",
                            String(task.id),
                          );
                          event.dataTransfer.setData(
                            "text/source-sprint-id",
                            String(row.key),
                          );
                          event.dataTransfer.effectAllowed = "move";
                          setDragState({
                            taskId: String(task.id),
                            sourceKey: String(row.key),
                            overKey: "",
                          });
                        }}
                        onDragEnd={() =>
                          setDragState({
                            taskId: "",
                            sourceKey: "",
                            overKey: "",
                          })
                        }
                        onClick={() => onOpenTask(task.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpenTask(task.id);
                          }
                        }}
                        data-task-id={String(task.id)}
                        aria-grabbed={dragState.taskId === String(task.id)}
                      >
                        <span className="font-semibold">
                          <span className="mr-[0.35rem] font-semibold text-[#5e6c84]">
                            {displayTaskRef(task)}
                          </span>{" "}
                          {task.title}
                        </span>
                        <span className="inline-flex items-center gap-[0.45rem]">
                          <span className="text-[#5e6c84]">
                            {task.priority} · SP{" "}
                            {task.storyPoints == null || task.storyPoints === ""
                              ? "-"
                              : task.storyPoints}
                          </span>
                          {task.assigneeId ? (
                            <span
                              className="grid h-[22px] w-[22px] place-items-center rounded-full text-[0.66rem] font-bold text-white"
                              title={assigneeLabel(task)}
                              style={{
                                backgroundColor: userAvatarColor?.(
                                  task.assigneeId,
                                ),
                              }}
                            >
                              {String(assigneeLabel(task))
                                .split(" ")
                                .map((part) => part[0] || "")
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          ) : (
                            <span
                              className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[#c7cfde] bg-[#f4f5f7] text-[0.66rem] font-bold text-[#5e6c84]"
                              title="Unassigned"
                            >
                              U
                            </span>
                          )}
                          {canManage ? (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center border border-[#dc2626] bg-[#dc2626] px-[0.45rem] py-[0.2rem] text-[0.72rem] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                              onClick={async (event) => {
                                event.stopPropagation();
                                await onDeleteTask?.(task.id);
                              }}
                              title="Delete task"
                              aria-label="Delete task"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-[0.85rem] w-[0.85rem]"
                                aria-hidden="true"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                                <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          ) : null}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[#5e6c84]">
                      {row.key === "backlog"
                        ? "No backlog tasks."
                        : "No tasks in this sprint."}
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {showCreateSprintModal ? (
        <Modal
          open={showCreateSprintModal}
          onOpenChange={setShowCreateSprintModal}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Create Sprint</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setShowCreateSprintModal(false)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <label>
              <span className="inline-flex items-center">
                Sprint Name <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                placeholder="Enter sprint name"
                value={createDraft.name}
                onChange={(event) => {
                  setCreateDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }));
                  if (String(event.target.value || "").trim()) {
                    setCreateNameError("");
                  }
                }}
              />
            </label>
            {createNameError ? (
              <p className="my-2 text-red-600">{createNameError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <label>
                Start date
                <input
                  type="date"
                  value={createDraft.startDate}
                  onChange={(event) =>
                    setCreateDraft((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={createDraft.endDate}
                  onChange={(event) =>
                    setCreateDraft((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setShowCreateSprintModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const normalizedName = String(createDraft.name || "").trim();
                  if (!normalizedName) {
                    setCreateNameError("Sprint name is required.");
                    return;
                  }
                  const exists = sprints.some(
                    (sprint) =>
                      String(sprint.name || "")
                        .trim()
                        .toLowerCase() === normalizedName.toLowerCase(),
                  );
                  if (exists) {
                    onNotify?.(
                      "Sprint name already in use within this project.",
                      "error",
                    );
                    return;
                  }
                  try {
                    await onCreateSprint({
                      ...createDraft,
                      name: normalizedName,
                    });
                    setCreateDraft({ name: "", startDate: "", endDate: "" });
                    setCreateNameError("");
                    setShowCreateSprintModal(false);
                  } catch (error) {
                    onNotify?.(
                      error?.message || "Failed to create sprint.",
                      "error",
                    );
                  }
                }}
              >
                Create Sprint
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {sprintDeleteDialog ? (
        <Modal
          open={Boolean(sprintDeleteDialog)}
          cardClassName="max-w-[460px]"
          onOpenChange={(open) => {
            if (!open) {
              setSprintDeleteDialog(null);
              setSprintDeleteError("");
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Delete sprint</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => {
                setSprintDeleteDialog(null);
                setSprintDeleteError("");
              }}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <p>
              Move tasks in <strong>{sprintDeleteDialog.sprintName}</strong> to:
            </p>
            <select
              value={sprintDeleteDialog.destinationSprintId}
              onChange={(event) =>
                setSprintDeleteDialog((prev) =>
                  prev
                    ? {
                        ...prev,
                        destinationSprintId: event.target.value,
                      }
                    : prev,
                )
              }
            >
              <option value="">Select destination sprint</option>
              {sprintDeleteDialog.destinationOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name} ({item.status})
                </option>
              ))}
            </select>
            {sprintDeleteError ? (
              <p className="my-2 text-red-600">{sprintDeleteError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => {
                  setSprintDeleteDialog(null);
                  setSprintDeleteError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                disabled={!sprintDeleteDialog.destinationSprintId}
                onClick={async () => {
                  if (!sprintDeleteDialog.destinationSprintId) {
                    setSprintDeleteError("Please choose a destination sprint.");
                    return;
                  }
                  try {
                    const destinationSprintId =
                      sprintDeleteDialog.destinationSprintId === "backlog"
                        ? null
                        : sprintDeleteDialog.destinationSprintId;
                    await Promise.all(
                      sprintDeleteDialog.taskIds.map((taskId) =>
                        onAssignTaskToSprint(taskId, destinationSprintId),
                      ),
                    );
                    await onDeleteSprint(sprintDeleteDialog.sprintKey);
                    setSprintDeleteDialog(null);
                    setSprintDeleteError("");
                  } catch (error) {
                    setSprintDeleteError(
                      error?.message ||
                        "Failed to move tasks and delete sprint.",
                    );
                  }
                }}
              >
                Move tasks and delete
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {sprintCompleteDialog ? (
        <Modal
          open={Boolean(sprintCompleteDialog)}
          onOpenChange={(open) => {
            if (!open) setSprintCompleteDialog(null);
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Complete sprint</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setSprintCompleteDialog(null)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <p>
              Move unfinished tasks in{" "}
              <strong>{sprintCompleteDialog.sprintName}</strong> to:
            </p>
            <select
              value={sprintCompleteDialog.destinationSprintId}
              onChange={(event) =>
                setSprintCompleteDialog((prev) =>
                  prev
                    ? {
                        ...prev,
                        destinationSprintId: event.target.value,
                      }
                    : prev,
                )
              }
            >
              <option value="">Backlog</option>
              {sprintCompleteDialog.destinationOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name} ({item.status})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setSprintCompleteDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onCompleteSprint(
                    sprintCompleteDialog.sprintKey,
                    sprintCompleteDialog.destinationSprintId || null,
                  );
                  setSprintCompleteDialog(null);
                }}
              >
                Complete sprint
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
