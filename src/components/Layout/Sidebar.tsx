import { memo } from "react";
import Icon from "../ui/Icon";

const mainNavItems = [
  { key: "dashboard", label: "Overview", icon: "dashboard" },
  { key: "projects", label: "Projects", icon: "projects" },
  { key: "users", label: "User management", icon: "users" },
  { key: "app-settings", label: "System Settings", icon: "settings" },
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
    "w-full rounded-[12px] border border-transparent bg-transparent px-[0.8rem] py-[0.72rem] text-left text-[0.95rem] text-[#52627c] transition-[color,background-color,border-color,box-shadow] duration-150 hover:border-[#d9e3f3] hover:bg-[#f6f8fc] hover:text-[#1f2a44]";
  const activeLinkClass =
    "border-[#bfd1ee] bg-[#e9f1ff] font-semibold text-[#0c66e4] shadow-[inset_0_0_0_1px_rgba(47,111,235,0.08)] hover:bg-[#e9f1ff]";

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col overflow-hidden border-r border-[#d5dfec] bg-[#fbfcff] shadow-[1px_0_0_rgba(9,30,66,0.04)] md:flex max-[1280px]:w-[88px]">
      <div className="flex h-[86px] items-center gap-[0.7rem] border-b border-[#e3e9f3] px-4">
        <div className="grid h-11 w-11 place-items-center rounded-[12px] border border-[#cdd9ee] bg-[#ecf2ff] p-[0.35rem] shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
          <img
            src="/favicon.svg"
            alt="Task Manager"
            className="h-full w-full rounded-[8px]"
          />
        </div>
        <div className="max-[1280px]:hidden">
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#6f7f98]">
            Task Manager
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="px-[0.95rem] py-[0.55rem] text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b889f] max-[1280px]:hidden">
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
                  <span className="inline-flex min-w-6 justify-center text-[#52627b]">
                    <Icon name={item.icon} size={16} />
                  </span>
                  <span className="max-[1280px]:hidden">{item.label}</span>
                </span>
              </button>
            ))}
        </nav>

        <div
          className="mx-3 my-[0.65rem] h-px flex-shrink-0 bg-[#dbe4f1]"
          role="separator"
        />

        <div className="flex-shrink-0">
          <div className="px-[0.95rem] py-[0.5rem] text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b889f] max-[1280px]:hidden">
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
                  <span className="min-w-0 flex-1 truncate max-[1280px]:hidden">
                    {project.name}
                  </span>
                  <span className="min-[1281px]:hidden text-[#7b889f]">
                    <Icon name="workspace" size={12} />
                  </span>
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
