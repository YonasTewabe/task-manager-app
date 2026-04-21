import { useMemo } from "react";
import { DEFAULT_WORKFLOW_STAGES } from "../workflowDefaults.js";
import { displayTaskRef } from "../utils/taskDisplay.js";

function formatPriority(p) {
  if (!p) return "—";
  return String(p).replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DashboardView({
  currentUser,
  projects,
  assignedTasks,
  projectById,
  workflowStages,
  canManage,
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
      <div className="panel-head">
        <h2>Dashboard</h2>
      </div>
      <p className="muted dashboard-welcome">
        Welcome back{currentUser?.name ? `, ${currentUser.name}` : ""}. Below are projects you belong to and work
        assigned to you. Use Projects in the sidebar to create and manage workspaces.
      </p>

      <div className="dashboard-sections">
        <div className="dashboard-section">
          <h3 className="dashboard-section-title">My projects</h3>
          {projects.length ? (
            <ul className="dashboard-project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button type="button" className="dashboard-project-link" onClick={() => onOpenProject(project.id)}>
                    <span className="dashboard-project-key">{project.projectKey}</span>
                    <span>{project.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              {canManage
                ? "You have no projects yet. Open Projects in the sidebar to create one."
                : "You are not assigned to any projects yet. Ask an administrator to add you."}
            </p>
          )}
        </div>

        <div className="dashboard-section">
          <h3 className="dashboard-section-title">My tasks</h3>
          {sortedTasks.length ? (
            <div className="dashboard-task-table-wrap">
              <table className="dashboard-task-table">
                <thead>
                  <tr>
                    <th className="dashboard-num">Key</th>
                    <th>Task</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th className="dashboard-num">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map((task) => {
                    const proj = task.projectId ? projectById.get(String(task.projectId)) : null;
                    return (
                      <tr key={task.id} className="dashboard-task-row">
                        <td className="dashboard-num muted">{displayTaskRef(task)}</td>
                        <td>
                          <button type="button" className="dashboard-task-title-btn" onClick={() => onOpenTask(task.id)}>
                            {task.title}
                          </button>
                          {task.label ? <span className="dashboard-task-label muted">{task.label}</span> : null}
                        </td>
                        <td>
                          {proj ? (
                            <button
                              type="button"
                              className="dashboard-task-project-btn"
                              onClick={() => onOpenProject(proj.id)}
                            >
                              {proj.projectKey} — {proj.name}
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>{statusLabels.get(task.status) || task.status}</td>
                        <td>{formatPriority(task.priority)}</td>
                        <td className="dashboard-num">{task.storyPoints ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No tasks are assigned to you right now.</p>
          )}
        </div>
      </div>
    </section>
  );
}
