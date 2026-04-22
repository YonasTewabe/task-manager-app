import { memo } from "react";
import Sidebar from "./Sidebar";

function MainLayout({
  currentUser,
  onLogout,
  canManage = false,
  activeView,
  currentProjectId,
  projects,
  expandedProjectIds,
  onNavigateMain,
  onNavigateProject,
  children,
}) {
  return (
    <div className="min-h-screen">
      <Sidebar
        activeView={activeView}
        currentProjectId={currentProjectId}
        projects={projects}
        expandedProjectIds={expandedProjectIds}
        canManage={canManage}
        onNavigateMain={onNavigateMain}
        onNavigateProject={onNavigateProject}
      />

      <div className="ml-[260px] min-h-screen max-[1100px]:ml-[88px]">
        <header className="sticky top-0 z-[15] flex h-16 items-center justify-between border-b border-[#dfe1e6] bg-white/90 px-4 backdrop-blur-[4px]">
          <div />
          <div className="flex items-center gap-2">
            <div className="grid rounded-[12px] bg-[#dfe1e6] px-[0.7rem] py-1 text-[0.85rem] text-[#42526e] leading-[1.2]">
              <span className="font-semibold text-[#253858]">
                {currentUser?.name}
              </span>
              <span>{currentUser?.email}</span>
            </div>
            <button type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <main className={activeView === "dashboard" ? undefined : "p-4"}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default memo(MainLayout);
