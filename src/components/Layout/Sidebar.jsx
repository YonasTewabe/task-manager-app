import { useLocation } from "react-router-dom";

const mainNavItems = [
  { key: "dashboard", label: "Dashboard", icon: "◫" },
  { key: "projects", label: "Projects", icon: "☰" },
  { key: "users", label: "User management", icon: "◌" },
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
  const baseLinkClass =
    "w-full rounded-[12px] border-none bg-transparent px-[0.8rem] py-[0.72rem] text-left text-[0.95rem] text-[#607089] transition-colors hover:bg-[#f4f6fa]";
  const activeLinkClass =
    "bg-[#d8e2f4] font-semibold text-[#2d64d9] hover:bg-[#d8e2f4]";
  const subLinkClass =
    "w-full rounded-[10px] border-none bg-transparent px-[0.65rem] py-[0.52rem] text-left text-[0.9rem] text-[#607089] transition-colors hover:bg-[#f4f6fa]";
  const activeSubLinkClass =
    "bg-[#d8e2f4] font-semibold text-[#2d64d9] hover:bg-[#d8e2f4]";

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
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[260px] flex-col overflow-hidden border-r border-[#dfe1e6] bg-white max-[1100px]:w-[88px]">
      <div className="flex h-[86px] items-center gap-[0.7rem] px-4">
        <div className="grid h-11 w-11 place-items-center rounded-[12px] bg-[#dbe6f8] font-bold text-[#2d64d9]">
          TM
        </div>
        <div className="max-[1100px]:hidden">
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b889f]">
            Task Manager
          </div>
    
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="px-[0.95rem] py-[0.2rem] text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b889f] max-[1100px]:hidden">
          Navigate
        </div>
        <nav className="grid flex-shrink-0 gap-[0.3rem] px-[0.6rem] py-[0.45rem]">
          {mainNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${baseLinkClass} ${activeView === item.key ? activeLinkClass : ""}`}
              onClick={() => onNavigateMain(item.key)}
              title={item.label}
            >
              <span className="flex items-center gap-[0.55rem]">
                <span className="inline-block min-w-6 text-center text-[0.95rem]">
                  {item.icon}
                </span>
                <span className="max-[1100px]:hidden">{item.label}</span>
              </span>
            </button>
          ))}
        </nav>

        <div
          className="mx-3 my-[0.6rem] h-px flex-shrink-0 bg-[#d4deec]"
          role="separator"
        />

        <div className="flex-shrink-0">
          <div className="px-[0.95rem] py-[0.25rem] text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b889f] max-[1100px]:hidden">
            Your projects
          </div>
          <div className="flex flex-col gap-[0.2rem] px-[0.6rem] pb-[0.9rem]">
            {projects.map((project) => {
              const expanded = showProjectSubs(project.id);
              const isThisProject = String(urlProjectId) === String(project.id);
              return (
                <div key={project.id} className="flex flex-col gap-[0.15rem]">
                  <button
                    type="button"
                    className={`${baseLinkClass} flex items-center gap-[0.35rem] font-semibold ${expanded ? "text-[#172b4d]" : ""}`}
                    onClick={() => onNavigateProject(project.id, "board")}
                    title={project.name}
                  >
                    <span
                      className={`inline-block w-4 text-center text-[0.85rem] text-[#7b889f] transition-transform duration-150 ${expanded ? "rotate-90" : "rotate-0"}`}
                      aria-hidden
                    >
                      ›
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold max-[1100px]:hidden">
                      {project.name}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="flex flex-col gap-[0.15rem] pb-[0.35rem] pl-[1.35rem] pt-[0.05rem] max-[1100px]:hidden">
                      <button
                        type="button"
                        className={`${subLinkClass} ${isThisProject && urlSubView === "board" ? activeSubLinkClass : ""}`}
                        onClick={() => onNavigateProject(project.id, "board")}
                      >
                        Board
                      </button>
                      <button
                        type="button"
                        className={`${subLinkClass} ${isThisProject && urlSubView === "backlog" ? activeSubLinkClass : ""}`}
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
