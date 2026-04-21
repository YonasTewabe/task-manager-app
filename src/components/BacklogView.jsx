import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WORKFLOW_STAGES } from "../workflowDefaults.js";
import { displayTaskRef } from "../utils/taskDisplay.js";

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

export default function BacklogView({
  tasks,
  sprints,
  allTasks,
  usersById,
  userAvatarColor,
  workflowStages,
  selectedSprintId,
  onSelectSprint,
  canManage,
  onStartSprint,
  onCompleteSprint,
  onDeleteSprint,
  onAssignTaskToSprint,
  onCreateSprint,
  onAddTask,
  onOpenTask,
  onNotify,
}) {
  const assigneeLabel = (task) =>
    task.assigneeId ? usersById?.get(task.assigneeId) || "Unknown" : "Unassigned";
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set(["backlog"]));
  const [createDraft, setCreateDraft] = useState({
    name: "",
    startDate: "",
    endDate: "",
  });
  const [sprintCompleteDialog, setSprintCompleteDialog] = useState(null);
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
    .sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === "active") return -1;
        if (b.status === "active") return 1;
      }
      const aDate =
        Date.parse(a.startDate || a.endDate || "") || Number.POSITIVE_INFINITY;
      const bDate =
        Date.parse(b.startDate || b.endDate || "") || Number.POSITIVE_INFINITY;
      if (aDate !== bDate) return aDate - bDate;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })
    .map((sprint) => {
      const sprintTaskList = tasksBySprint.get(String(sprint.id)) || [];
      return {
        key: String(sprint.id),
        name: sprint.name,
        status: sprint.status,
        tasks: sprintTaskList,
      };
    });

  const backlogRow = {
    key: "backlog",
    name: "Backlog",
    status: "backlog",
    tasks,
  };

  const rows = selectedSprintId
    ? sprintRows.filter((row) => String(row.key) === String(selectedSprintId))
    : [backlogRow, ...sprintRows];

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
    <section className="panel backlog-page">
      <div className="panel-head">
        <h2></h2>
        <div className="inline-form">
          {canManage ? (
            <button
              type="button"
              className="ghost-btn"
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
      <div className="backlog-rows">
        {rows.map((row) => {
          const redPoints = sumStoryPoints(row.tasks, counterBuckets.upcoming);
          const bluePoints = sumStoryPoints(row.tasks, counterBuckets.active);
          const greenPoints = sumStoryPoints(row.tasks, counterBuckets.done);
          const isSelected =
            row.key === "backlog"
              ? !selectedSprintId
              : String(selectedSprintId) === row.key;
          const isExpanded = expandedKeys.has(row.key);
          return (
            <article key={row.key} className="backlog-row-wrap">
              <div
                className={`backlog-row-card ${isSelected ? "active" : ""} ${dragState.sourceKey === row.key ? "drop-source" : ""} ${dragState.overKey === row.key ? "drop-active" : ""} ${blockedDropKey === row.key ? "drop-blocked" : ""}`}
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
                <div className="backlog-row-main">
                  <span
                    className={`backlog-chevron ${isExpanded ? "expanded" : ""}`}
                  >
                    ▾
                  </span>
                  <strong>{row.name}</strong>
                  <span className="muted">({row.tasks.length} work items)</span>
                </div>
                <div className="backlog-row-right">
                  <div className="status-counters">
                    <span className="counter blocked">{redPoints}</span>
                    <span className="counter todo">{bluePoints}</span>
                    <span className="counter done">{greenPoints}</span>
                  </div>
                  {row.status === "active" && canManage ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const destinations = rows.filter(
                          (candidate) =>
                            candidate.key !== row.key &&
                            candidate.key !== "backlog" &&
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
                      className="ghost-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteSprint(row.key);
                      }}
                    >
                      Delete sprint
                    </button>
                  ) : null}
                </div>
              </div>
              {isExpanded ? (
                <div className="backlog-task-list">
                  {row.tasks.length ? (
                    row.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className={`backlog-task-item ${dragState.taskId === String(task.id) ? "is-dragging" : ""} ${recentlyMovedTaskId === String(task.id) ? "is-recently-moved" : ""}`}
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
                          setDragState({ taskId: "", sourceKey: "", overKey: "" })
                        }
                        onClick={() => onOpenTask(task.id)}
                        data-task-id={String(task.id)}
                        aria-grabbed={dragState.taskId === String(task.id)}
                      >
                        <span className="backlog-task-title">
                          <span className="backlog-task-key muted">
                            {displayTaskRef(task)}
                          </span>{" "}
                          {task.title}
                        </span>
                        <span className="backlog-task-right">
                          <span className="muted">
                            {task.priority} · SP{" "}
                            {task.storyPoints == null || task.storyPoints === ""
                              ? "-"
                              : task.storyPoints}
                          </span>
                          {task.assigneeId ? (
                            <span
                              className="avatar-bubble"
                              title={assigneeLabel(task)}
                              style={{
                                backgroundColor: userAvatarColor?.(task.assigneeId),
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
                            <span className="muted backlog-unassigned-pill" title="Unassigned">
                              U
                            </span>
                          )}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="muted">
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
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setShowCreateSprintModal(false)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h3>Create Sprint</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowCreateSprintModal(false)}
              >
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Sprint Name <span className="required-indicator">*</span>
                </span>
                <input
                  placeholder="Enter sprint name"
                  value={createDraft.name}
                  onChange={(event) =>
                    setCreateDraft((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="inline-form">
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setShowCreateSprintModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const normalizedName = String(
                      createDraft.name || "",
                    ).trim();
                    if (!normalizedName) return;
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
          </div>
        </div>
      ) : null}
      {sprintCompleteDialog ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setSprintCompleteDialog(null)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-head">
              <h3>Complete sprint</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setSprintCompleteDialog(null)}
              >
                X
              </button>
            </div>
            <div className="project-form">
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
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
          </div>
        </div>
      ) : null}
    </section>
  );
}
