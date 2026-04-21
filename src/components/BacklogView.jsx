import { useMemo, useState } from "react";
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
      s.counterGroup === "active" ? "active" : s.counterGroup === "done" ? "done" : "upcoming";
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
  workflowStages,
  selectedSprintId,
  onSelectSprint,
  canManage,
  onStartSprint,
  onCompleteSprint,
  onCreateSprint,
  onAddTask,
  onOpenTask,
}) {
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set(["backlog"]));
  const [createDraft, setCreateDraft] = useState({
    name: "",
    startDate: "",
    endDate: "",
  });
  const stageList = workflowStages?.length ? workflowStages : DEFAULT_WORKFLOW_STAGES;
  const counterBuckets = useMemo(() => getCounterBuckets(stageList), [stageList]);

  const tasksBySprint = new Map();
  allTasks.forEach((task) => {
    const key = task.sprintId == null ? "backlog" : String(task.sprintId);
    const list = tasksBySprint.get(key) || [];
    list.push(task);
    tasksBySprint.set(key, list);
  });

  const sprintRows = [...sprints]
    .sort((a, b) => {
      const aDate = Date.parse(a.startDate || a.endDate || "") || Number.POSITIVE_INFINITY;
      const bDate = Date.parse(b.startDate || b.endDate || "") || Number.POSITIVE_INFINITY;
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

  const rows = [backlogRow, ...sprintRows];

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

  return (
    <section className="panel backlog-page">
      <div className="panel-head">
        <h2>Backlog</h2>
        <div className="inline-form">
          {canManage ? (
            <button type="button" className="ghost-btn" onClick={() => setShowCreateSprintModal(true)}>
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
                className={`backlog-row-card ${isSelected ? "active" : ""}`}
                onClick={() => {
                  onSelectSprint(row.key === "backlog" ? "" : row.key);
                  toggleExpanded(row.key);
                }}
              >
                <div className="backlog-row-main">
                  <span className={`backlog-chevron ${isExpanded ? "expanded" : ""}`}>▾</span>
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
                    <button type="button" onClick={(event) => { event.stopPropagation(); onCompleteSprint(row.key); }}>
                      Complete sprint
                    </button>
                  ) : null}
                  {row.status === "planned" && canManage ? (
                    <button type="button" onClick={(event) => { event.stopPropagation(); onStartSprint(row.key); }}>
                      Start sprint
                    </button>
                  ) : null}
                  {row.status === "backlog" && canManage ? (
                    <span className="muted">Add Sprint</span>
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
                        className="backlog-task-item"
                        onClick={() => onOpenTask(task.id)}
                      >
                        <span className="backlog-task-title">
                          <span className="backlog-task-key muted">{displayTaskRef(task)}</span> {task.title}
                        </span>
                        <span className="muted">
                          {task.label ? `[${task.label}] · ` : ""}
                          {task.priority} · SP {task.storyPoints}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="muted">No tasks in this sprint.</div>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {showCreateSprintModal ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowCreateSprintModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h3>Create Sprint</h3>
              <button type="button" className="ghost-btn" onClick={() => setShowCreateSprintModal(false)}>
                Close
              </button>
            </div>
            <div className="project-form">
              <input
                placeholder="Sprint name"
                value={createDraft.name}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
              <div className="inline-form">
                <input
                  type="date"
                  value={createDraft.startDate}
                  onChange={(event) =>
                    setCreateDraft((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
                <input
                  type="date"
                  value={createDraft.endDate}
                  onChange={(event) => setCreateDraft((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!createDraft.name.trim()) return;
                  onCreateSprint(createDraft);
                  setCreateDraft({ name: "", startDate: "", endDate: "" });
                  setShowCreateSprintModal(false);
                }}
              >
                Create Sprint
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
