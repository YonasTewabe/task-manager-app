import { useLocation } from "react-router-dom";

const mainNavItems = [
  { key: "dashboard", label: "Overview" },
  { key: "projects", label: "Projects" },
  { key: "users", label: "Users" },
];

const PROJECT_SUB_ROUTE = /^\/project\/([^/]+)\/(board|backlog|settings)$/;

export default function Sidebar({
  activeView,
  currentProjectId,
  projects,
  expandedProjectIds,
  onNavigateMain,
  onNavigateProject,
}) {
  const location = useLocation();
  const pathMatch = location.pathname.match(PROJECT_SUB_ROUTE);
  const urlProjectId = pathMatch?.[1] || null;
  const urlSubView = pathMatch?.[2] || null;

  const showProjectSubs = (projectId) => {
    const id = String(projectId);
    if (
      (activeView === "board" ||
        activeView === "backlog" ||
        activeView === "settings") &&
      String(currentProjectId) === id
    ) {
      return true;
    }
    return expandedProjectIds.includes(id);
  };

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">TM</div>
        <div className="brand-text">Task Manager</div>
      </div>

      <div className="sidebar-scroll">
        <nav className="sidebar-nav sidebar-nav-main">
          {mainNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sidebar-link ${activeView === item.key ? "active" : ""}`}
              onClick={() => onNavigateMain(item.key)}
              title={item.label}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" role="separator" />

        <div className="sidebar-projects">
          <div className="sidebar-section-title">Your projects</div>
          <div className="sidebar-project-tree">
            {projects.map((project) => {
              const expanded = showProjectSubs(project.id);
              const isThisProject = String(urlProjectId) === String(project.id);
              return (
                <div key={project.id} className="sidebar-project-block">
                  <button
                    type="button"
                    className={`sidebar-link sidebar-project-head ${expanded ? "is-open" : ""}`}
                    onClick={() => onNavigateProject(project.id, "board")}
                    title={project.name}
                  >
                    <span
                      className={`sidebar-chevron ${expanded ? "open" : ""}`}
                      aria-hidden
                    >
                      ›
                    </span>
                    <span className="sidebar-project-name">{project.name}</span>
                  </button>
                  {expanded ? (
                    <div className="sidebar-project-subs">
                      <button
                        type="button"
                        className={`sidebar-sublink ${isThisProject && urlSubView === "board" ? "active" : ""}`}
                        onClick={() => onNavigateProject(project.id, "board")}
                      >
                        Board
                      </button>
                      <button
                        type="button"
                        className={`sidebar-sublink ${isThisProject && urlSubView === "backlog" ? "active" : ""}`}
                        onClick={() => onNavigateProject(project.id, "backlog")}
                      >
                        Backlog
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
