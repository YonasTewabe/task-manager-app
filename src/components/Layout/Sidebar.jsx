import { memo } from "react";

const mainNavItems = [
  { key: "dashboard", label: "Overview", icon: "◫" },
  { key: "projects", label: "Projects", icon: "☰" },
  { key: "users", label: "User management", icon: "◌" },
  { key: "app-settings", label: "System Settings", icon: "⚙" },
];

function Sidebar({
  activeView,
  currentProjectId,
  projects,
  canManage = false,
  onNavigateMain,
  onNavigateProject,
}) {
  const baseLinkClass =
    "w-full rounded-[12px] border-none bg-transparent px-[0.8rem] py-[0.72rem] text-left text-[0.95rem] text-[#607089] transition-colors hover:bg-[#f4f6fa]";
  const activeLinkClass =
    "bg-[#d8e2f4] font-semibold text-[#2d64d9] hover:bg-[#d8e2f4]";

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[260px] flex-col overflow-hidden border-r border-[#dfe1e6] bg-white max-[1100px]:w-[88px]">
      <div className="flex h-[86px] items-center gap-[0.7rem] px-4">
        <div className="grid h-11 w-11 place-items-center rounded-[12px] bg-[#dbe6f8] p-[0.35rem]">
          <img
            src="/favicon.svg"
            alt="Task Manager"
            className="h-full w-full rounded-[8px]"
          />
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
          {mainNavItems
            .filter((item) =>
              item.key === "app-settings" || item.key === "users"
                ? canManage
                : true,
            )
            .map((item) => (
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
            Your Projects
          </div>
          <div className="flex flex-col gap-[0.2rem] px-[0.6rem] pb-[0.9rem]">
            {projects.map((project) => {
              const isActiveProject =
                String(currentProjectId) === String(project.id) &&
                (activeView === "board" ||
                  activeView === "backlog" ||
                  activeView === "summary" ||
                  activeView === "settings");
              return (
                <button
                  key={project.id}
                  type="button"
                  className={`${baseLinkClass} ${isActiveProject ? activeLinkClass : ""} font-semibold`}
                  onClick={() => onNavigateProject(project.id, "board")}
                  title={project.name}
                >
                  <span className="min-w-0 flex-1 truncate max-[1100px]:hidden">
                    {project.name}
                  </span>
                  <span className="min-[1101px]:hidden">•</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default memo(Sidebar);
