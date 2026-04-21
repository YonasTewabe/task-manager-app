import { useLocation } from "react-router-dom";

const mainNavItems = [
  { key: "dashboard", label: "Dashboard" },
  { key: "projects", label: "Projects" },
  { key: "users", label: "Users" },
];

const PROJECT_SUB_ROUTE = /^\/project\/([^/]+)\/(board|backlog|settings)$/;

export default function Sidebar({
  collapsed,
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
      (activeView === "board" || activeView === "backlog" || activeView === "settings") &&
      String(currentProjectId) === id
    ) {
      return true;
    }
    return expandedProjectIds.includes(id);
  };

  return (
    <aside className={`app-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="brand-icon">TM</div>
        {!collapsed ? <div className="brand-text">Task Manager</div> : null}
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
              {!collapsed ? item.label : item.label.slice(0, 1)}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" role="separator" />

        <div className="sidebar-projects">
          {!collapsed ? (
            <div className="sidebar-section-title">Your projects</div>
          ) : null}
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
                    {!collapsed ? (
                      <>
                        <span className={`sidebar-chevron ${expanded ? "open" : ""}`} aria-hidden>
                          ›
                        </span>
                        <span className="sidebar-project-name">{project.name}</span>
                      </>
                    ) : (
                      (project.projectKey || project.name || "P").slice(0, 1)
                    )}
                  </button>
                  {!collapsed && expanded ? (
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
