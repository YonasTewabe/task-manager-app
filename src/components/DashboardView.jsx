import { useMemo } from "react";
import { DEFAULT_WORKFLOW_STAGES } from "../workflowDefaults.js";
import { displayTaskRef } from "../utils/taskDisplay.js";

function toInitials(name) {
  return String(name || "")
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function DashboardView({
  currentUser,
  projects,
  assignedTasks,
  projectById,
  workflowStages, // used to derive status buckets
  onOpenProject,
  onOpenTask,
}) {
  const stageMeta = useMemo(() => {
    const stages = workflowStages?.length
      ? workflowStages
      : DEFAULT_WORKFLOW_STAGES;
    const map = new Map();
    stages.forEach((s) =>
      map.set(s.key, {
        label: s.name,
        bucket:
          s.counterGroup === "active"
            ? "active"
            : s.counterGroup === "done"
              ? "done"
              : "upcoming",
      }),
    );
    return map;
  }, [workflowStages]);

  const sortedTasks = useMemo(() => {
    const list = [...(assignedTasks || [])];
    list.sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );
    return list;
  }, [assignedTasks]);

  const assignedByBucket = useMemo(() => {
    const counts = { upcoming: 0, active: 0, done: 0 };
    sortedTasks.forEach((task) => {
      const bucket = stageMeta.get(task.status)?.bucket || "upcoming";
      counts[bucket] += 1;
    });
    return counts;
  }, [sortedTasks, stageMeta]);
  const projectCards = useMemo(() => {
    const counts = new Map();
    sortedTasks.forEach((task) => {
      const key = String(task.projectId || "");
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return projects.map((project) => {
      const key = String(project.id || "");
      return {
        ...project,
        assignedCount: counts.get(key) || 0,
      };
    });
  }, [projects, sortedTasks]);
  const greetingName = useMemo(
    () => String(currentUser?.name || "there").split(" ")[0] || "there",
    [currentUser?.name],
  );
  const recentTasks = useMemo(() => sortedTasks.slice(0, 8), [sortedTasks]);

  return (
    <section className="dashboard-modern">
      <header className="dashboard-modern-hero">
        <div className="dashboard-modern-head">
          <h3 className="dashboard-modern-title">
            Welcome back, {greetingName}.
          </h3>
        </div>
      </header>

      <div className="dashboard-main-grid">
        <section className="dashboard-modern-section dashboard-block">
          <h3 className="dashboard-modern-section-title">My Projects</h3>
          {projectCards.length ? (
            <div className="dashboard-space-grid dashboard-modern-list">
              {projectCards.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="dashboard-space-card"
                  onClick={() => onOpenProject(project.id)}
                >
                  <span className="dashboard-space-icon">
                    {toInitials(project.projectKey || project.name)}
                  </span>
                  <span className="dashboard-space-meta">
                    <strong className="dashboard-space-title">
                      {project.name}
                    </strong>
                    <span className="muted">
                      {project.projectKey || "No code"} ·{" "}
                      {project.assignedCount} assigned
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted dashboard-modern-empty">
              You are not assigned to any projects yet.
            </p>
          )}
        </section>

        <section className="dashboard-modern-section dashboard-block">
          <h3 className="dashboard-modern-section-title">
            My Work in a Snapshot
          </h3>
          <div className="dashboard-snapshot-grid dashboard-modern-list">
            <div className="dashboard-snapshot-card">
              <span className="dashboard-snapshot-dot upcoming" />
              <span className="dashboard-snapshot-name">Not started</span>
              <strong>{assignedByBucket.upcoming}</strong>
            </div>
            <div className="dashboard-snapshot-card">
              <span className="dashboard-snapshot-dot active" />
              <span className="dashboard-snapshot-name">In progress</span>
              <strong>{assignedByBucket.active}</strong>
            </div>
            <div className="dashboard-snapshot-card">
              <span className="dashboard-snapshot-dot done" />
              <span className="dashboard-snapshot-name">Done</span>
              <strong>{assignedByBucket.done}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="dashboard-modern-section">
        <h3 className="dashboard-modern-section-title">Assigned to me</h3>
        {recentTasks.length ? (
          <div className="dashboard-modern-list">
            {recentTasks.map((task) => {
              const proj = task.projectId
                ? projectById.get(String(task.projectId))
                : null;
              const statusText = stageMeta.get(task.status)?.label;
              const typeText =
                String(task.type).charAt(0).toUpperCase() + String(task.type).slice(1);
              return (
                <button
                  key={task.id}
                  type="button"
                  className="dashboard-modern-item"
                  onClick={() => onOpenTask(task.id)}
                >
                  <div className="dashboard-modern-item-main">
                    <span className="dashboard-task-title-line">
                      {task.title}
                    </span>
                    <span className="dashboard-task-meta-line">
                      {typeText} · {displayTaskRef(task)} ·{" "}
                      {proj?.name}
                    </span>
                  </div>
                  <span className="dashboard-modern-status">
                    {String(statusText).toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">No tasks assigned to you yet</p>
        )}
      </section>
    </section>
  );
}
