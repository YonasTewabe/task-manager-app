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
      className={`cursor-pointer rounded-[8px] border border-[#dfe4ee] bg-white p-2 shadow-[0_1px_0_rgba(9,30,66,0.08)] transition-[transform,box-shadow,opacity,border-color,background-color] duration-200 ease-out ${isDragging ? "scale-[0.98] opacity-50" : ""} ${isRecentlyMoved ? "animate-pulse" : ""}`}
      onDragStart={dragStart}
      onDragEnd={() => onDragTaskEnd?.()}
      onClick={() => onOpen(task.id)}
    >
      <div className="mb-[0.45rem] font-semibold">{task.title}</div>
      <div className="mt-[0.4rem] flex items-center justify-between gap-[0.45rem] text-[0.75rem] text-[#667289]">
        <span className="inline-flex min-w-0 items-center gap-[0.35rem] text-[0.84rem] text-[#697386]">
          <span className="rounded-full border border-[#dbe3ef] bg-[#f5f7fb] px-[0.4rem] py-[0.06rem] text-[0.7rem] font-semibold uppercase text-[#42526e]">
            {workTypeMeta.label}
          </span>
          <span>{displayTaskRef(task)}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-[0.35rem]">
          <span className="min-w-[20px] rounded-[4px] border border-[#e3e7ef] bg-[#f2f4f7] px-[0.3rem] py-[0.04rem] text-center font-semibold text-[#4f5d75]">
            {task.storyPoints == null || task.storyPoints === ""
              ? "-"
              : task.storyPoints}
          </span>
          <span
            className={`rounded-full border border-[#e3e7ef] bg-[#f7f9fc] px-[0.42rem] py-[0.1rem] text-[0.7rem] font-semibold uppercase leading-none tracking-[0.02em] ${
              priorityMeta?.tone === "high"
                ? "text-[#db4f4f]"
                : priorityMeta?.tone === "low"
                  ? "text-[#2f6feb]"
                  : "text-[#f5a623]"
            }`}
            title={priorityMeta?.label || "Medium"}
          >
            {priorityMeta?.label || "Medium"}
          </span>
        </span>
        <span
          className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[#0b6bcb] text-[0.66rem] font-bold text-white"
          title={userName || "Unassigned"}
          style={
            isUnassigned
              ? undefined
              : { backgroundColor: userAvatarColor(task.assigneeId) }
          }
        >
          {isUnassigned ? (
            <img
              className="block h-full w-full rounded-full"
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
  currentUser = null,
  userGroups = [],
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
  const actorGroupIds = useMemo(() => {
    const actorId = String(currentUser?.id || "");
    if (!actorId) return new Set();
    const groups = new Set();
    userGroups.forEach((group) => {
      const members = Array.isArray(group?.members) ? group.members : [];
      if (members.some((member) => String(member?.id || "") === actorId)) {
        groups.add(String(group?.id || ""));
      }
    });
    return groups;
  }, [currentUser?.id, userGroups]);
  const transitionPermissionsByFrom = useMemo(() => {
    const map = new Map();
    const actorId = String(currentUser?.id || "");
    workflowTransitions.forEach((transition) => {
      const from = String(transition?.from || "").trim();
      const to = String(transition?.to || "").trim();
      if (!from || !to) return;
      const allowedUserIds = Array.isArray(transition?.allowedUserIds)
        ? transition.allowedUserIds.map((id) => String(id))
        : [];
      const allowedGroupIds = Array.isArray(transition?.allowedGroupIds)
        ? transition.allowedGroupIds.map((id) => String(id))
        : [];
      const noRestrictions =
        transition?.allowAllUsers !== true &&
        allowedUserIds.length === 0 &&
        allowedGroupIds.length === 0;
      const isAllowed =
        noRestrictions ||
        transition?.allowAllUsers === true ||
        (actorId && allowedUserIds.includes(actorId)) ||
        allowedGroupIds.some((groupId) => actorGroupIds.has(groupId));
      const fromPermissions = map.get(from) || new Map();
      fromPermissions.set(to, isAllowed);
      map.set(from, fromPermissions);
    });
    return map;
  }, [workflowTransitions, currentUser?.id, actorGroupIds]);

  useEffect(() => {
    return () => {
      window.clearTimeout(movePulseTimeoutRef.current);
      window.clearTimeout(blockedTimeoutRef.current);
    };
  }, []);

  return (
    <section className="flex items-stretch gap-[0.8rem] overflow-x-auto pb-[0.45rem]">
      {columns.map((column) =>
        (() => {
          const isBlockedByRules = blockedStatusesDuringDrag.has(
            column.status,
          );
          const isAllowedTarget =
            Boolean(dragState.taskId) &&
            allowedStatusesDuringDrag.has(column.status);
          const showBlockedHint = isBlockedByRules || blockedStatus === column.status;
          return (
            <article
              key={column.status}
              className={`flex w-[280px] min-w-[280px] flex-col rounded-[8px] border border-[#e0e5ee] bg-[#f0f2f5] p-2 transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out max-[1100px]:w-[min(90vw,320px)] max-[1100px]:min-w-[min(90vw,320px)] ${
                dragState.overStatus === column.status
                  ? "border-[#2f6feb] bg-[#eaf1ff] shadow-[inset_0_0_0_1px_rgba(47,111,235,0.22)]"
                  : ""
              } ${showBlockedHint ? "border-[#dc2626] bg-[#fff2f2] ring-1 ring-red-300" : ""} ${
                isAllowedTarget
                  ? "border-[#1a7f37] bg-[#eefcf2] shadow-[inset_0_0_0_1px_rgba(26,127,55,0.18)]"
                  : ""
              }`}
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
                event.dataTransfer.dropEffect = isBlockedByRules
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
                if (isBlockedByRules) {
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
              <header className="mb-2 flex flex-col items-stretch gap-[0.15rem] border-b border-[#dde3ee] px-[0.2rem] pb-[0.45rem] pt-[0.2rem]">
                <div className="flex flex-wrap items-center gap-[0.45rem]">
                  <h3 className="min-w-0 flex-1 text-[0.92rem] text-[#172b4d]">
                    {column.name || column.status}
                  </h3>
                  <span className="rounded-full border border-[#d1d5db] bg-[#f3f4f6] px-[0.45rem] py-[0.08rem] text-[0.8rem] font-semibold text-[#4b5563]">
                    {assigneeFilterActive
                      ? `${column.tasks.length}/${boardTotalsByStatus[column.status] ?? column.tasks.length}`
                      : column.tasks.length}
                  </span>
                </div>
              </header>
              <div className="grid flex-1 content-start gap-2">
                {showBlockedHint ? (
                  <div className="rounded-[8px] border border-dashed border-[#dc2626] bg-[#fff6f6] px-[0.6rem] py-[0.65rem] text-[0.78rem] leading-[1.35] text-[#7f1d1d]">
                    This task cannot be moved to this column due to workflow or
                    transition access rules.
                  </div>
                ) : null}
                {!showBlockedHint && isAllowedTarget ? (
                  <div className="rounded-[8px] border border-dashed border-[#1a7f37] bg-[#f3fff6] px-[0.6rem] py-[0.65rem] text-[0.78rem] leading-[1.35] text-[#14532d]">
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
                        transitionPermissionsByFrom.get(sourceStatus);
                      if (allowedTargets instanceof Map) {
                        columns.forEach((candidateColumn) => {
                          const candidateStatus = String(
                            candidateColumn.status || "",
                          );
                          if (!candidateStatus) return;
                          if (candidateStatus === sourceStatus) return;
                          if (!allowedTargets.get(candidateStatus)) {
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
