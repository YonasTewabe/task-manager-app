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
  projects,
  assignedTasks,
  projectById,
  workflowStages,
  onOpenProject,
  onOpenTask,
}) {
  const statusLabels = useMemo(() => {
    const stages = workflowStages?.length ? workflowStages : DEFAULT_WORKFLOW_STAGES;
    const map = new Map();
    stages.forEach((s) => map.set(s.key, s.name));
    return map;
  }, [workflowStages]);

  const sortedTasks = useMemo(() => {
    const list = [...(assignedTasks || [])];
    list.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return list;
  }, [assignedTasks]);

  return (
    <section className="panel dashboard-page">
      <div className="dashboard-block">
        <h2 className="dashboard-overview-title">Overview</h2>
        <p className="muted">
          Welcome to Task Manager. Track your projects, review assigned work, and
          jump into the next task quickly.
        </p>
      </div>
      <div className="dashboard-block">
        <div className="dashboard-row-head">
          <h3 className="dashboard-heading">My Projects</h3>

        </div>
        {projects.length ? (
          <div className="dashboard-space-grid">
            {projects.map((project) => (
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
                  <strong className="dashboard-space-title">{project.name}</strong>
                  <span className="muted">{project.projectKey || "No code"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">
            You are not assigned to any projects yet.
          </p>
        )}
      </div>
      <div className="dashboard-block dashboard-block-divider">
        <h3 className="dashboard-heading">Assigned to me</h3>
        {sortedTasks.length ? (
          <div className="dashboard-task-list">
            {sortedTasks.map((task) => {
              const proj = task.projectId
                ? projectById.get(String(task.projectId))
                : null;
              const statusText = statusLabels.get(task.status) || task.status;
              return (
                <button
                  key={task.id}
                  type="button"
                  className="dashboard-task-item dashboard-task-item-link"
                  onClick={() => onOpenTask(task.id)}
                >
                  <div className="dashboard-task-main">
                    <span className="dashboard-task-title-btn">{task.title}</span>
                    <div className="dashboard-task-meta muted">
                      <span>{displayTaskRef(task)}</span>
                      <span>·</span>
                      <span className="dashboard-task-project-btn">
                        {proj?.name || "Unknown project"}
                      </span>
                    </div>
                  </div>
                  <span className="dashboard-status-pill">
                    {String(statusText).toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            No tasks assigned to you yet
          </p>
        )}
      </div>
    </section>
  );
}
