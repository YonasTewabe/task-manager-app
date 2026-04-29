import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WORKFLOW_STAGES } from "../workflowDefaults.js";
import { displayTaskRef } from "../utils/taskDisplay.js";
import Modal from "./ui/Modal";
import {
  REQUIRED_FIELD_MESSAGE,
  invalidFieldClassName,
} from "../utils/formValidation.js";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";

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

function normalizeSprintKey(value) {
  return String(value || "").trim().toLowerCase();
}

export default function BacklogView({
  tasks,
  sprints,
  allTasks,
  isLoading = false,
  rowsData = null,
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
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) {
  const assigneeLabel = (task) =>
    task.assigneeId
      ? usersById?.get(task.assigneeId) || "Unknown"
      : "Unassigned";
  const {
    backlogShowCreateSprintModal: showCreateSprintModal,
    setBacklogShowCreateSprintModal: setShowCreateSprintModal,
    backlogExpandedKeys: expandedKeys,
    setBacklogExpandedKeys: setExpandedKeys,
    backlogCreateDraft: createDraft,
    setBacklogCreateDraft: setCreateDraft,
    backlogSprintCompleteDialog: sprintCompleteDialog,
    setBacklogSprintCompleteDialog: setSprintCompleteDialog,
    backlogSprintDeleteDialog: sprintDeleteDialog,
    setBacklogSprintDeleteDialog: setSprintDeleteDialog,
    backlogSprintDeleteError: sprintDeleteError,
    setBacklogSprintDeleteError: setSprintDeleteError,
    backlogDragState: dragState,
    setBacklogDragState: setDragState,
    backlogRecentlyMovedTaskId: recentlyMovedTaskId,
    setBacklogRecentlyMovedTaskId: setRecentlyMovedTaskId,
    backlogBlockedDropKey: blockedDropKey,
    setBacklogBlockedDropKey: setBlockedDropKey,
  } = useAppStore(
    useShallow((state) => ({
      backlogShowCreateSprintModal: state.backlogShowCreateSprintModal,
      setBacklogShowCreateSprintModal: state.setBacklogShowCreateSprintModal,
      backlogExpandedKeys: state.backlogExpandedKeys,
      setBacklogExpandedKeys: state.setBacklogExpandedKeys,
      backlogCreateDraft: state.backlogCreateDraft,
      setBacklogCreateDraft: state.setBacklogCreateDraft,
      backlogSprintCompleteDialog: state.backlogSprintCompleteDialog,
      setBacklogSprintCompleteDialog: state.setBacklogSprintCompleteDialog,
      backlogSprintDeleteDialog: state.backlogSprintDeleteDialog,
      setBacklogSprintDeleteDialog: state.setBacklogSprintDeleteDialog,
      backlogSprintDeleteError: state.backlogSprintDeleteError,
      setBacklogSprintDeleteError: state.setBacklogSprintDeleteError,
      backlogDragState: state.backlogDragState,
      setBacklogDragState: state.setBacklogDragState,
      backlogRecentlyMovedTaskId: state.backlogRecentlyMovedTaskId,
      setBacklogRecentlyMovedTaskId: state.setBacklogRecentlyMovedTaskId,
      backlogBlockedDropKey: state.backlogBlockedDropKey,
      setBacklogBlockedDropKey: state.setBacklogBlockedDropKey,
    })),
  );
  const movedTaskTimeoutRef = useRef(null);
  const blockedDropTimeoutRef = useRef(null);
  const [createSprintErrors, setCreateSprintErrors] = useState<any>({});
  const [sprintDeleteDestError, setSprintDeleteDestError] = useState("");
  const [rowRenderLimits, setRowRenderLimits] = useState<Record<string, number>>({});
  const stageList = workflowStages?.length
    ? workflowStages
    : DEFAULT_WORKFLOW_STAGES;
  const counterBuckets = useMemo(
    () => getCounterBuckets(stageList),
    [stageList],
  );

  const tasksBySprint = useMemo(() => {
    if (Array.isArray(rowsData) && rowsData.length > 0) {
      return new Map();
    }
    const grouped = new Map();
    allTasks.forEach((task) => {
      const key = task.sprintId == null ? "backlog" : String(task.sprintId);
      const list = grouped.get(key) || [];
      list.push(task);
      grouped.set(key, list);
    });
    return grouped;
  }, [allTasks, rowsData]);

  const sprintRows = useMemo(
    () => {
      if (Array.isArray(rowsData) && rowsData.length > 0) return [];
      return [...sprints]
        .filter(
          (sprint) =>
            sprint.status === "active" ||
            sprint.status === "planned" ||
            String(sprint.id) === String(selectedSprintId || ""),
        )
        .map((sprint) => {
          const sprintTaskList = tasksBySprint.get(String(sprint.id)) || [];
          const storyPoints = {
            upcoming: sumStoryPoints(sprintTaskList, counterBuckets.upcoming),
            active: sumStoryPoints(sprintTaskList, counterBuckets.active),
            done: sumStoryPoints(sprintTaskList, counterBuckets.done),
          };
          return {
            key: String(sprint.id),
            name: sprint.name,
            status: sprint.status,
            startDate: sprint.startDate || "",
            endDate: sprint.endDate || "",
            tasks: sprintTaskList,
            totalTasks: sprintTaskList.length,
            storyPoints,
          };
        });
    },
    [
      counterBuckets.active,
      counterBuckets.done,
      counterBuckets.upcoming,
      rowsData,
      sprints,
      selectedSprintId,
      tasksBySprint,
    ],
  );

  const sortByDateThenName = (a, b) => {
    const aDate =
      Date.parse(a.startDate || a.endDate || "") || Number.POSITIVE_INFINITY;
    const bDate =
      Date.parse(b.startDate || b.endDate || "") || Number.POSITIVE_INFINITY;
    if (aDate !== bDate) return aDate - bDate;
    return String(a.name || "").localeCompare(String(b.name || ""));
  };

  const activeSprintRows = useMemo(
    () =>
      sprintRows
        .filter((row) => row.status === "active")
        .sort(sortByDateThenName),
    [sprintRows],
  );
  const plannedSprintRows = useMemo(
    () =>
      sprintRows
        .filter((row) => row.status === "planned")
        .sort(sortByDateThenName),
    [sprintRows],
  );
  const otherSprintRows = useMemo(
    () =>
      sprintRows
        .filter((row) => row.status !== "active" && row.status !== "planned")
        .sort(sortByDateThenName),
    [sprintRows],
  );

  const backlogRow = useMemo(
    () => {
      if (Array.isArray(rowsData) && rowsData.length > 0) {
        return null;
      }
      const backlogAllTasks = tasksBySprint.get("backlog") || [];
      return {
        key: "backlog",
        name: "Backlog",
        status: "backlog",
        // Keep paged items for row content rendering.
        tasks,
        // Show full filtered count in row header.
        totalTasks: backlogAllTasks.length,
        storyPoints: {
          upcoming: sumStoryPoints(backlogAllTasks, counterBuckets.upcoming),
          active: sumStoryPoints(backlogAllTasks, counterBuckets.active),
          done: sumStoryPoints(backlogAllTasks, counterBuckets.done),
        },
      };
    },
    [
      counterBuckets.active,
      counterBuckets.done,
      counterBuckets.upcoming,
      rowsData,
      tasks,
      tasksBySprint,
    ],
  );

  const rows = useMemo(
    () =>
      Array.isArray(rowsData) && rowsData.length
        ? rowsData
        : selectedSprintId
          ? sprintRows.filter(
              (row) => String(row.key) === String(selectedSprintId),
            )
          : [
              ...(backlogRow ? [backlogRow] : []),
              ...activeSprintRows,
              ...plannedSprintRows,
              ...otherSprintRows,
            ],
    [
      rowsData,
      selectedSprintId,
      sprintRows,
      backlogRow,
      activeSprintRows,
      plannedSprintRows,
      otherSprintRows,
    ],
  );
  const selectableSprintDestinations = useMemo(
    () =>
      (rows || []).filter(
        (candidate) =>
          candidate.key !== "backlog" && candidate.status !== "completed",
      ),
    [rows],
  );

  useEffect(() => {
    setRowRenderLimits((prev) => {
      const next: Record<string, number> = {};
      (rows || []).forEach((row) => {
        const key = String(row?.key || "");
        if (!key) return;
        next[key] = prev[key] || 120;
      });
      return next;
    });
  }, [rows]);

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

  useEffect(() => {
    const sprintKey = String(selectedSprintId || "").trim();
    if (!sprintKey) {
      setExpandedKeys(new Set());
      return;
    }
    setExpandedKeys(new Set([sprintKey]));
  }, [selectedSprintId, setExpandedKeys]);

  if (isLoading) {
    return (
      <section className="grid gap-[0.55rem] rounded-[12px] border border-[#d8e2ef] bg-white p-[0.9rem] shadow-[0_1px_3px_rgba(9,30,66,0.08)]">
        <div className="flex items-center justify-between">
          <div className="h-6 w-36 animate-pulse rounded bg-[#e8ecf3]" />
          <div className="h-9 w-28 animate-pulse rounded bg-[#e3ebf8]" />
        </div>
        <div className="grid gap-[0.5rem]">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={`backlog-row-skeleton-${idx}`}
              className="animate-pulse rounded-[10px] border border-[#dbe4f1] bg-[#f8fafd] px-[0.7rem] py-[0.65rem]"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-44 rounded bg-[#e7ecf4]" />
                <div className="h-4 w-24 rounded bg-[#edf2f8]" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-[0.55rem] rounded-[12px] border border-[#d8e2ef] bg-white p-[0.9rem] shadow-[0_1px_3px_rgba(9,30,66,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        </div>
      </div>
      <div className="grid gap-[0.5rem]">
        {rows.map((row) => {
          const redPoints = Number(row.storyPoints?.upcoming || 0);
          const bluePoints = Number(row.storyPoints?.active || 0);
          const greenPoints = Number(row.storyPoints?.done || 0);
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
                className={`flex flex-wrap cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-[#dbe4f1] bg-[#f8fafd] px-[0.7rem] py-[0.6rem] transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-[#bfd0e8] hover:shadow-[0_4px_10px_rgba(9,30,66,0.09)] ${isSelected ? "border-[#b8c9e8] bg-[#f2f6ff]" : ""} ${dragState.sourceKey === row.key ? "border-dashed" : ""} ${dragState.overKey === row.key ? "border-[#2f6feb] bg-[#eaf1ff] shadow-[inset_0_0_0_1px_rgba(47,111,235,0.18)]" : ""} ${blockedDropKey === row.key ? "border-red-600 bg-[#fff2f2] ring-1 ring-red-300" : ""}`}
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
                <div className="flex min-w-0 flex-wrap items-center gap-[0.45rem]">
                  <span
                    className={`inline-block text-[0.85rem] text-[#5e6c84] transition-transform duration-100 ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                  >
                    ▾
                  </span>
                  <strong className="truncate">{row.name}</strong>
                  <span className="break-words text-[0.9rem] text-[#5e6c84]">
                    ({row.totalTasks ?? row.tasks.length} work items )
                    {sprintDateRange ? ` ${sprintDateRange}` : ""}
                  </span>
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 min-[720px]:w-auto">
                  <div className="flex items-center gap-[0.3rem]">
                    <span className="min-w-6 rounded border border-[#f4cdca] bg-[#fff1f0] px-[0.32rem] py-[0.1rem] text-center text-[0.7rem] font-semibold text-[#b42318]">
                      {redPoints}
                    </span>
                    <span className="min-w-6 rounded border border-[#cddcff] bg-[#edf4ff] px-[0.32rem] py-[0.1rem] text-center text-[0.7rem] font-semibold text-[#114fba]">
                      {bluePoints}
                    </span>
                    <span className="min-w-6 rounded border border-[#c6eace] bg-[#eefaf2] px-[0.32rem] py-[0.1rem] text-center text-[0.7rem] font-semibold text-[#1a7f37]">
                      {greenPoints}
                    </span>
                  </div>
                  {row.status === "active" && canManage ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const destinations = rows.filter(
                          (candidate) =>
                            candidate.key !== row.key &&
                            candidate.status !== "completed" &&
                            candidate.key !== "backlog",
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
                      <span className="whitespace-nowrap">Complete sprint</span>
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
                        <span className="whitespace-nowrap">Start sprint</span>
                      </button>
                    </>
                  ) : null}
                  {row.status === "planned" && canManage ? (
                    <button
                      type="button"
                      className="whitespace-nowrap border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                      onClick={(event) => {
                        event.stopPropagation();
                        const destinations = [
                          {
                            key: "backlog",
                            name: "Backlog",
                            status: "backlog",
                          },
                          ...selectableSprintDestinations.filter(
                            (candidate) =>
                              normalizeSprintKey(candidate.key) !==
                                normalizeSprintKey(row.key) &&
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
                  {canManage ? (
                    <button
                      type="button"
                      title={
                        row.status === "backlog"
                          ? "Add Task To Backlog"
                          : `Add Task To ${row.name}`
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        onAddTask?.(row.status === "backlog" ? null : row.key);
                      }}
                    >
                      <span className="whitespace-nowrap">Add Task</span>
                    </button>
                  ) : null}
                </div>
              </div>
              {isExpanded ? (
                <div
                  className="grid max-h-[56vh] gap-[0.35rem] overflow-y-auto rounded-[10px] border border-[#dbe4f1] bg-white p-[0.45rem]"
                  onScroll={(event) => {
                    if (
                      !hasMore ||
                      loadingMore ||
                      typeof onLoadMore !== "function" ||
                      row.key !== "backlog"
                    )
                      return;
                    const node = event.currentTarget;
                    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
                    if (remaining < 120) onLoadMore();
                  }}
                >
                  {row.tasks.length ? (
                    row.tasks
                      .slice(0, Number(rowRenderLimits[String(row.key)] || 120))
                      .map((task) => (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        className={`flex w-full flex-wrap justify-between gap-3 rounded-[8px] border border-[#d8e2ef] bg-white px-[0.58rem] py-[0.48rem] text-left text-[#172b4d] shadow-[0_1px_2px_rgba(9,30,66,0.08)] transition-[transform,box-shadow,opacity,border-color,background-color] duration-200 hover:border-[#b9c9e1] hover:shadow-[0_4px_10px_rgba(9,30,66,0.1)] ${dragState.taskId === String(task.id) ? "scale-[0.98] opacity-50" : ""} ${recentlyMovedTaskId === String(task.id) ? "animate-pulse" : ""}`}
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
                    <div className="rounded-[8px] border border-dashed border-[#ccd7ea] bg-[#fafdff] px-[0.6rem] py-[0.7rem] text-[0.86rem] text-[#5e6c84]">
                      {row.key === "backlog"
                        ? "No backlog tasks."
                        : "No tasks in this sprint."}
                    </div>
                  )}
                  {row.key === "backlog" && hasMore && loadingMore ? (
                    <div
                      className="grid gap-[0.35rem]"
                      aria-label="Loading more tasks"
                      aria-live="polite"
                    >
                      {Array.from({ length: 2 }).map((_, index) => (
                        <div
                          key={`backlog-loading-${index}`}
                          className="animate-pulse rounded-md border border-[#dfe1e6] bg-white px-[0.5rem] py-[0.45rem]"
                        >
                          <div className="mb-2 h-3 w-3/5 rounded bg-[#e8ebf0]" />
                          <div className="h-3 w-1/3 rounded bg-[#eef1f5]" />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {row.tasks.length > Number(rowRenderLimits[String(row.key)] || 120) ? (
                    <button
                      type="button"
                      className="rounded-[8px] border border-[#d6dce8] bg-white px-[0.55rem] py-[0.45rem] text-left text-[0.8rem] font-semibold text-[#0c66e4] hover:bg-[#f4f6fa]"
                      onClick={() =>
                        setRowRenderLimits((prev) => ({
                          ...prev,
                          [String(row.key)]:
                            Number(prev[String(row.key)] || 120) + 120,
                        }))
                      }
                    >
                      Show more
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {showCreateSprintModal ? (
        <Modal
          open={showCreateSprintModal}
          onOpenChange={(open) => {
            setShowCreateSprintModal(open);
            if (!open) setCreateSprintErrors({});
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Create Sprint</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => {
                setCreateSprintErrors({});
                setShowCreateSprintModal(false);
              }}
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
                className={invalidFieldClassName(
                  Boolean(createSprintErrors.name),
                )}
                onChange={(event) => {
                  setCreateDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }));
                  if (createSprintErrors.name)
                    setCreateSprintErrors((prev) => {
                      const n = { ...prev };
                      delete n.name;
                      return n;
                    });
                }}
              />
            </label>
            {createSprintErrors.name ? (
              <p className="text-[0.78rem] text-red-600">
                {createSprintErrors.name}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <label>
                <span className="inline-flex items-center">
                  Start date <span className="ml-1 text-red-600">*</span>
                </span>
                <input
                  type="date"
                  value={createDraft.startDate}
                  className={invalidFieldClassName(
                    Boolean(createSprintErrors.startDate),
                  )}
                  onChange={(event) => {
                    setCreateDraft((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }));
                    if (createSprintErrors.startDate)
                      setCreateSprintErrors((prev) => {
                        const n = { ...prev };
                        delete n.startDate;
                        return n;
                      });
                  }}
                />
              </label>
              <label>
                <span className="inline-flex items-center">
                  End date <span className="ml-1 text-red-600">*</span>
                </span>
                <input
                  type="date"
                  value={createDraft.endDate}
                  className={invalidFieldClassName(
                    Boolean(createSprintErrors.endDate),
                  )}
                  onChange={(event) => {
                    setCreateDraft((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }));
                    if (createSprintErrors.endDate)
                      setCreateSprintErrors((prev) => {
                        const n = { ...prev };
                        delete n.endDate;
                        return n;
                      });
                  }}
                />
              </label>
            </div>
            {createSprintErrors.startDate || createSprintErrors.endDate ? (
              <p className="text-[0.78rem] text-red-600">
                {createSprintErrors.startDate || createSprintErrors.endDate}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => {
                  setCreateSprintErrors({});
                  setShowCreateSprintModal(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const normalizedName = String(createDraft.name || "").trim();
                  const err: AnyRecord = {};
                  if (!normalizedName) err.name = REQUIRED_FIELD_MESSAGE;
                  if (!String(createDraft.startDate || "").trim())
                    err.startDate = REQUIRED_FIELD_MESSAGE;
                  if (!String(createDraft.endDate || "").trim())
                    err.endDate = REQUIRED_FIELD_MESSAGE;
                  if (Object.keys(err).length) {
                    setCreateSprintErrors(err);
                    return;
                  }
                  setCreateSprintErrors({});
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
              setSprintDeleteDestError("");
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
                setSprintDeleteDestError("");
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
              className={invalidFieldClassName(Boolean(sprintDeleteDestError))}
              value={sprintDeleteDialog.destinationSprintId}
              onChange={(event) => {
                setSprintDeleteDestError("");
                setSprintDeleteDialog((prev) =>
                  prev
                    ? {
                        ...prev,
                        destinationSprintId: event.target.value,
                      }
                    : prev,
                );
              }}
            >
              <option value="">Select destination sprint</option>
              {sprintDeleteDialog.destinationOptions
                .filter(
                  (item) =>
                    normalizeSprintKey(item.key) !==
                    normalizeSprintKey(sprintDeleteDialog.sprintKey),
                )
                .map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name} ({item.status})
                </option>
              ))}
            </select>
            {sprintDeleteDestError ? (
              <p className="text-[0.78rem] text-red-600">
                {sprintDeleteDestError}
              </p>
            ) : null}
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
                  setSprintDeleteDestError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                onClick={async () => {
                  if (!sprintDeleteDialog.destinationSprintId) {
                    setSprintDeleteDestError(REQUIRED_FIELD_MESSAGE);
                    return;
                  }
                  if (
                    normalizeSprintKey(sprintDeleteDialog.destinationSprintId) ===
                    normalizeSprintKey(sprintDeleteDialog.sprintKey)
                  ) {
                    setSprintDeleteDestError(
                      "Select a different destination sprint.",
                    );
                    return;
                  }
                  setSprintDeleteDestError("");
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
                    setSprintDeleteDestError("");
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
