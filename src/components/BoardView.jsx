import { useEffect, useMemo, useRef, useState } from "react";
import { displayTaskRef } from "../utils/taskDisplay.js";
import { UNASSIGNED_AVATAR_SRC } from "../constants/unassignedAvatar.js";
import { getPriorityMeta } from "../constants/priorities.js";
import { getWorkTypeMeta } from "../constants/workTypes.js";

function TaskCard({
  task,
  userName,
  userAvatarColor,
  onOpen,
  onDragTaskStart,
  onDragTaskEnd,
  isDragging,
  isRecentlyMoved,
}) {
  const dragStart = (event) => {
    event.dataTransfer.setData("text/task-id", String(task.id));
    event.dataTransfer.setData("text/source-status", String(task.status || ""));
    event.dataTransfer.effectAllowed = "move";
    onDragTaskStart?.(task);
  };

  const isUnassigned = !task.assigneeId || !userName;
  const priorityMeta = getPriorityMeta(task.priority);
  const workTypeMeta = getWorkTypeMeta(task.type);
  const initials = (userName || "U")
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      draggable
      className={`board-card ${isDragging ? "is-dragging" : ""} ${isRecentlyMoved ? "is-recently-moved" : ""}`}
      onDragStart={dragStart}
      onDragEnd={() => onDragTaskEnd?.()}
      onClick={() => onOpen(task.id)}
    >
      <div className="card-title">{task.title}</div>
      <div className="board-card-meta board-card-row">
        <span className="meta-left">
          <span className="meta-tag">{workTypeMeta.label}</span>
          <span>{displayTaskRef(task)}</span>
        </span>
        <span className="meta-right">
          <span className="sp-chip">
            {task.storyPoints == null || task.storyPoints === ""
              ? "-"
              : task.storyPoints}
          </span>
          <span
            className={`priority-sign priority-sign-${priorityMeta?.tone || "medium"}`}
            title={priorityMeta?.label || "Medium"}
          >
            {priorityMeta?.label || "Medium"}
          </span>
        </span>
        <span
          className="avatar-bubble"
          title={userName || "Unassigned"}
          style={
            isUnassigned
              ? undefined
              : { backgroundColor: userAvatarColor(task.assigneeId) }
          }
        >
          {isUnassigned ? (
            <img
              className="avatar-icon"
              src={UNASSIGNED_AVATAR_SRC}
              alt=""
              aria-hidden="true"
            />
          ) : (
            initials
          )}
        </span>
      </div>
    </div>
  );
}

export default function BoardView({
  columns,
  workflowTransitions = [],
  usersById,
  userAvatarColor,
  boardTotalsByStatus = {},
  assigneeFilterActive = false,
  onMove,
  onOpenTask,
}) {
  const movePulseTimeoutRef = useRef(null);
  const blockedTimeoutRef = useRef(null);
  const [dragState, setDragState] = useState({
    taskId: "",
    sourceStatus: "",
    overStatus: "",
  });
  const [recentlyMovedTaskId, setRecentlyMovedTaskId] = useState("");
  const [blockedStatus, setBlockedStatus] = useState("");
  const [blockedStatusesDuringDrag, setBlockedStatusesDuringDrag] = useState(
    () => new Set(),
  );
  const [allowedStatusesDuringDrag, setAllowedStatusesDuringDrag] = useState(
    () => new Set(),
  );
  const transitionsByFrom = useMemo(() => {
    const map = new Map();
    workflowTransitions.forEach((transition) => {
      const from = String(transition?.from || "").trim();
      const to = String(transition?.to || "").trim();
      if (!from || !to) return;
      const allowed = map.get(from) || new Set();
      allowed.add(to);
      map.set(from, allowed);
    });
    return map;
  }, [workflowTransitions]);

  useEffect(() => {
    return () => {
      window.clearTimeout(movePulseTimeoutRef.current);
      window.clearTimeout(blockedTimeoutRef.current);
    };
  }, []);

  return (
    <section className="board-lanes">
      {columns.map((column) =>
        (() => {
          const isBlockedByWorkflow = blockedStatusesDuringDrag.has(
            column.status,
          );
          const isAllowedTarget =
            Boolean(dragState.taskId) &&
            allowedStatusesDuringDrag.has(column.status);
          const showBlockedHint =
            isBlockedByWorkflow || blockedStatus === column.status;
          return (
            <article
              key={column.status}
              className={`board-column ${dragState.overStatus === column.status ? "drop-active" : ""} ${showBlockedHint ? "drop-blocked" : ""} ${isAllowedTarget ? "drop-allowed" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!dragState.taskId) return;
                setDragState((prev) => ({
                  ...prev,
                  overStatus: column.status,
                }));
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = isBlockedByWorkflow
                  ? "none"
                  : "move";
              }}
              onDragLeave={() => {
                setDragState((prev) =>
                  prev.overStatus === column.status
                    ? { ...prev, overStatus: "" }
                    : prev,
                );
              }}
              onDrop={async (event) => {
                const taskId = String(
                  event.dataTransfer.getData("text/task-id") || "",
                ).trim();
                const sourceStatus = String(
                  event.dataTransfer.getData("text/source-status") || "",
                ).trim();
                if (!taskId || sourceStatus === column.status) {
                  setDragState({
                    taskId: "",
                    sourceStatus: "",
                    overStatus: "",
                  });
                  setBlockedStatusesDuringDrag(new Set());
                  setAllowedStatusesDuringDrag(new Set());
                  return;
                }
                if (isBlockedByWorkflow) {
                  setBlockedStatus(column.status);
                  window.clearTimeout(blockedTimeoutRef.current);
                  blockedTimeoutRef.current = window.setTimeout(
                    () => setBlockedStatus(""),
                    900,
                  );
                  setDragState({
                    taskId: "",
                    sourceStatus: "",
                    overStatus: "",
                  });
                  setBlockedStatusesDuringDrag(new Set());
                  setAllowedStatusesDuringDrag(new Set());
                  return;
                }
                try {
                  await onMove(taskId, column.status, {
                    suppressErrorToast: true,
                  });
                  setRecentlyMovedTaskId(taskId);
                  window.clearTimeout(movePulseTimeoutRef.current);
                  movePulseTimeoutRef.current = window.setTimeout(
                    () => setRecentlyMovedTaskId(""),
                    700,
                  );
                } catch {
                  setBlockedStatus(column.status);
                  window.clearTimeout(blockedTimeoutRef.current);
                  blockedTimeoutRef.current = window.setTimeout(
                    () => setBlockedStatus(""),
                    850,
                  );
                } finally {
                  setDragState({
                    taskId: "",
                    sourceStatus: "",
                    overStatus: "",
                  });
                  setBlockedStatusesDuringDrag(new Set());
                  setAllowedStatusesDuringDrag(new Set());
                }
              }}
            >
              <header className="board-column-head">
                <div className="board-column-title-row">
                  <h3>{column.name || column.status}</h3>
                  <span className="board-column-count">
                    {assigneeFilterActive
                      ? `${column.tasks.length}/${boardTotalsByStatus[column.status] ?? column.tasks.length}`
                      : column.tasks.length}
                  </span>
                </div>
              </header>
              <div className="board-cards">
                {showBlockedHint ? (
                  <div className="board-blocked-drop-hint">
                    This task cannot be moved to this column because of workflow
                    rule.
                  </div>
                ) : null}
                {!showBlockedHint && isAllowedTarget ? (
                  <div className="board-allowed-drop-hint">
                    Drop allowed in this column.
                  </div>
                ) : null}
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    userName={usersById.get(task.assigneeId)}
                    userAvatarColor={userAvatarColor}
                    onOpen={onOpenTask}
                    onDragTaskStart={(dragTask) => {
                      const sourceStatus = String(dragTask.status || "");
                      const nextBlocked = new Set();
                      const nextAllowed = new Set();
                      const allowedTargets =
                        transitionsByFrom.get(sourceStatus);
                      if (allowedTargets instanceof Set) {
                        columns.forEach((candidateColumn) => {
                          const candidateStatus = String(
                            candidateColumn.status || "",
                          );
                          if (!candidateStatus) return;
                          if (candidateStatus === sourceStatus) return;
                          if (!allowedTargets.has(candidateStatus)) {
                            nextBlocked.add(candidateStatus);
                          } else {
                            nextAllowed.add(candidateStatus);
                          }
                        });
                      } else {
                        columns.forEach((candidateColumn) => {
                          const candidateStatus = String(
                            candidateColumn.status || "",
                          );
                          if (
                            !candidateStatus ||
                            candidateStatus === sourceStatus
                          )
                            return;
                          nextBlocked.add(candidateStatus);
                        });
                      }
                      setBlockedStatusesDuringDrag(nextBlocked);
                      setAllowedStatusesDuringDrag(nextAllowed);
                      setDragState({
                        taskId: String(dragTask.id),
                        sourceStatus,
                        overStatus: "",
                      });
                    }}
                    onDragTaskEnd={() => {
                      setDragState({
                        taskId: "",
                        sourceStatus: "",
                        overStatus: "",
                      });
                      setBlockedStatusesDuringDrag(new Set());
                      setAllowedStatusesDuringDrag(new Set());
                    }}
                    isDragging={dragState.taskId === String(task.id)}
                    isRecentlyMoved={recentlyMovedTaskId === String(task.id)}
                  />
                ))}
              </div>
            </article>
          );
        })(),
      )}
    </section>
  );
}
