import Sidebar from "./Sidebar";

export default function MainLayout({
  currentUser,
  onLogout,
  activeView,
  currentProjectId,
  projects,
  expandedProjectIds,
  onNavigateMain,
  onNavigateProject,
  children,
}) {
  return (
    <div className="app-layout">
      <Sidebar
        activeView={activeView}
        currentProjectId={currentProjectId}
        projects={projects}
        expandedProjectIds={expandedProjectIds}
        onNavigateMain={onNavigateMain}
        onNavigateProject={onNavigateProject}
      />

      <div className="app-main" style={{ marginLeft: 260 }}>
        <header className="app-header">
          <div className="app-header-left"></div>
          <div className="app-header-right">
            <div className="pill">{currentUser?.name || "User"}</div>
            <button type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <main
          className={activeView === "dashboard" ? undefined : "app-content"}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
