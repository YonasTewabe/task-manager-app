import { memo, useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import NotificationCenter from "../NotificationCenter";
import Icon from "../ui/Icon";

function MainLayout({
  currentUser,
  onLogout,
  canManage = false,
  activeView,
  currentProjectId,
  currentProjectName = "",
  activeSprintName = "",
  projects,
  onNavigateMain,
  onOpenProfileSecurity,
  onNavigateProject,
  canManageCurrentProject = false,
  notifications = [],
  unreadCount = 0,
  notificationCenterOpen = false,
  onToggleNotificationCenter,
  onCloseNotificationCenter,
  onNotificationClick,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onGlobalTaskSearch,
  onOpenGlobalTask,
  children,
}) {
  const mobileNotificationWrapperRef = useRef(null);
  const desktopNotificationWrapperRef = useRef(null);
  const mobileProfileWrapperRef = useRef(null);
  const desktopProfileWrapperRef = useRef(null);
  const globalSearchWrapperRef = useRef(null);
  const mobileProjectPickerRef = useRef(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [mobileProjectPickerOpen, setMobileProjectPickerOpen] = useState(false);
  const [showWorkspaceProjectSelector, setShowWorkspaceProjectSelector] =
    useState(false);
  const nameParts = String(currentUser?.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = (nameParts[0]?.[0] || "") + (nameParts[1]?.[0] || "");
  const currentProject = projects.find(
    (project) => String(project.id) === String(currentProjectId),
  );
  const showProjectSubNav =
    Boolean(currentProjectId) &&
    (activeView === "summary" ||
      activeView === "board" ||
      activeView === "backlog");
  const projectSubOptions = [
    { key: "summary", label: "Summary" },
    { key: "board", label: "Board" },
    { key: "backlog", label: "Backlog" },
  ];
  const mobileMainNavItems = [
    { key: "dashboard", label: "Home", icon: "dashboard" },
    { key: "projects", label: "Projects", icon: "projects" },
    { key: "project-space", label: "Workspace", icon: "workspace" },
    ...(canManage ? [{ key: "users", label: "Users", icon: "users" }] : []),
    ...(canManage
      ? [{ key: "app-settings", label: "Settings", icon: "settings" }]
      : []),
  ];
  const activeProjectView = new Set(["summary", "board", "backlog", "settings"]);
  const mobileProjectTargetView = activeProjectView.has(activeView)
    ? activeView
    : "board";
  const mobilePageTitle = (() => {
    if (activeView === "board") {
      return activeSprintName
        ? `${currentProjectName || currentProject?.name || "Project"} - ${activeSprintName}`
        : currentProjectName || currentProject?.name || "Project";
    }
    if (activeView === "backlog" || activeView === "summary") {
      return currentProjectName || currentProject?.name || "Project";
    }
    if (activeView === "dashboard") return "Overview";
    if (activeView === "projects") return "Projects";
    if (activeView === "users") return "User management";
    if (activeView === "app-settings") return "System Settings";
    if (activeView === "profile") return "Profile";
    return "Task Manager";
  })();

  useEffect(() => {
    if (!notificationCenterOpen) return undefined;
    const handlePointerDown = (event) => {
      const isInsideMobile =
        mobileNotificationWrapperRef.current &&
        mobileNotificationWrapperRef.current.contains(event.target);
      const isInsideDesktop =
        desktopNotificationWrapperRef.current &&
        desktopNotificationWrapperRef.current.contains(event.target);
      if (
        !isInsideMobile &&
        !isInsideDesktop
      ) {
        onCloseNotificationCenter?.();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [notificationCenterOpen, onCloseNotificationCenter]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      const isInsideMobile =
        mobileProfileWrapperRef.current &&
        mobileProfileWrapperRef.current.contains(event.target);
      const isInsideDesktop =
        desktopProfileWrapperRef.current &&
        desktopProfileWrapperRef.current.contains(event.target);
      if (
        !isInsideMobile &&
        !isInsideDesktop
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!globalSearchOpen) return undefined;
    const handlePointerDown = (event) => {
      if (
        globalSearchWrapperRef.current &&
        !globalSearchWrapperRef.current.contains(event.target)
      ) {
        setGlobalSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [globalSearchOpen]);

  useEffect(() => {
    if (!mobileProjectPickerOpen) return undefined;
    const handlePointerDown = (event) => {
      if (
        mobileProjectPickerRef.current &&
        !mobileProjectPickerRef.current.contains(event.target)
      ) {
        setMobileProjectPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [mobileProjectPickerOpen]);

  useEffect(() => {
    if (activeProjectView.has(activeView)) {
      setShowWorkspaceProjectSelector(false);
    }
  }, [activeView, activeProjectView]);

  useEffect(() => {
    const term = globalSearchTerm.trim();
    if (!term) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return undefined;
    }
    let cancelled = false;
    setGlobalSearchLoading(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const rows = await onGlobalTaskSearch?.(term);
        if (cancelled) return;
        setGlobalSearchResults(Array.isArray(rows) ? rows : []);
      } catch {
        if (cancelled) return;
        setGlobalSearchResults([]);
      } finally {
        if (!cancelled) {
          setGlobalSearchLoading(false);
          setGlobalSearchOpen(true);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [globalSearchTerm, onGlobalTaskSearch]);

  const handleSelectGlobalTask = useCallback(
    (task) => {
      if (!task?.id) return;
      setGlobalSearchOpen(false);
      setGlobalSearchTerm("");
      setGlobalSearchResults([]);
      onOpenGlobalTask?.(task);
    },
    [onOpenGlobalTask],
  );
  const handleClearGlobalSearch = useCallback(() => {
    setGlobalSearchTerm("");
    setGlobalSearchResults([]);
    setGlobalSearchLoading(false);
    setGlobalSearchOpen(false);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent pb-20 md:pb-0">
      <Sidebar
        activeView={activeView}
        currentProjectId={currentProjectId}
        projects={projects}
        canManage={canManage}
        onNavigateMain={onNavigateMain}
        onNavigateProject={onNavigateProject}
      />

      <div className="min-h-screen overflow-x-hidden md:ml-[260px] max-[1100px]:md:ml-[88px]">
        <header className="sticky top-0 z-[15] border-b border-[#d8e2f0] bg-[#fbfdff]/95 px-3 py-2 backdrop-blur-[6px] md:flex md:h-16 md:flex-nowrap md:items-center md:justify-between md:gap-3 md:px-4 md:py-0">
          <div className="mb-2 flex items-center justify-between gap-2 md:hidden">
            <div className="min-w-0 flex-1 truncate text-[1.02rem] font-bold text-[#172b4d]">
              {mobilePageTitle}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="relative" ref={mobileNotificationWrapperRef}>
                <button
                  type="button"
                  aria-label="Notifications"
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d6deec] bg-white text-[#42526e] shadow-[0_1px_2px_rgba(9,30,66,0.08)] hover:bg-[#f7f9fd]"
                  onClick={onToggleNotificationCenter}
                >
                  <Icon name="bell" size={17} />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 rounded-full bg-[#d92d2d] px-1.5 text-[11px] text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </button>
                {notificationCenterOpen ? (
                  <NotificationCenter
                    notifications={notifications}
                    onMarkRead={onMarkNotificationRead}
                    onMarkAllRead={onMarkAllNotificationsRead}
                    onClickNotification={onNotificationClick}
                  />
                ) : null}
              </div>
              <div className="relative" ref={mobileProfileWrapperRef}>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-[12px] border border-[#c7d6ef] bg-[#eaf0fd] px-3 py-2 text-left text-[0.95rem] text-[#253858] shadow-[0_1px_2px_rgba(9,30,66,0.08)] hover:bg-[#dfe8fb]"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2d64d9] text-[0.78rem] font-semibold text-white">
                    {initials || "U"}
                  </span>
                </button>
                {profileMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 grid w-[min(220px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] gap-1 rounded-[12px] border border-[#d6dce8] bg-white p-2 shadow-[0_10px_24px_rgba(9,30,66,0.18)]">
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[1rem] text-[#253858] hover:bg-[#f4f6fa]"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onOpenProfileSecurity?.();
                      }}
                    >
                      <span aria-hidden className="w-5 text-center text-[#4e5d78]">
                        <Icon name="user" size={15} />
                      </span>
                      <span>Profile</span>
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[1rem] text-[#253858] hover:bg-[#f4f6fa]"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onLogout?.();
                      }}
                    >
                      <span aria-hidden className="w-5 text-center text-[#4e5d78]">
                        <Icon name="logout" size={15} />
                      </span>
                      <span>Logout</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-1 items-center gap-2 md:gap-3">
            <div
              className="relative w-full min-w-0 flex-1"
              ref={globalSearchWrapperRef}
            >
              <div className="flex items-center gap-[0.4rem] rounded-[10px] border border-[#ccd8ea] bg-white px-[0.7rem] py-[0.45rem] shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
                <span className="text-[#6b778c]">
                  <Icon name="search" size={15} />
                </span>
                <input
                  className="w-full border-none bg-transparent p-0 shadow-none focus:border-transparent focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                  value={globalSearchTerm}
                  placeholder="Search Everywhere"
                  onFocus={() => {
                    if (globalSearchResults.length || globalSearchTerm.trim()) {
                      setGlobalSearchOpen(true);
                    }
                  }}
                  onChange={(event) => setGlobalSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    if (globalSearchTerm.trim()) {
                      handleClearGlobalSearch();
                    } else {
                      setGlobalSearchOpen(false);
                    }
                  }}
                />
                {globalSearchTerm.trim() ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="grid h-5 w-5 place-items-center rounded text-[0.72rem] font-semibold text-[#6b778c] hover:bg-[#f1f3f7] hover:text-[#253858]"
                    onClick={handleClearGlobalSearch}
                  >
                    x
                  </button>
                ) : null}
              </div>
              {globalSearchOpen ? (
                <div className="absolute left-0 top-[calc(100%+0.35rem)] z-40 grid max-h-[320px] w-full overflow-auto rounded-[10px] border border-[#d6dce8] bg-white p-[0.35rem] shadow-[0_12px_28px_rgba(9,30,66,0.16)]">
                  {globalSearchLoading ? (
                    <div className="px-[0.55rem] py-[0.45rem] text-[0.86rem] text-[#5e6c84]">
                      Searching...
                    </div>
                  ) : null}
                  {!globalSearchLoading && !globalSearchResults.length ? (
                    <div className="px-[0.55rem] py-[0.45rem] text-[0.86rem] text-[#5e6c84]">
                      No tasks found.
                    </div>
                  ) : null}
                  {!globalSearchLoading
                    ? globalSearchResults.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className="rounded-[8px] px-[0.55rem] py-[0.45rem] text-left text-[0.88rem] text-[#253858] hover:bg-[#f4f6fa]"
                          onClick={() => handleSelectGlobalTask(task)}
                          title={`${task.taskKey || "TASK"}: ${task.title || ""}`}
                        >
                          {`${task.taskKey || "TASK"}: ${task.title || ""}`}
                        </button>
                      ))
                    : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="ml-3 hidden shrink-0 items-center gap-2 md:flex">
            <div className="relative" ref={desktopNotificationWrapperRef}>
                <button
                type="button"
                aria-label="Notifications"
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d6deec] bg-white text-[#42526e] shadow-[0_1px_2px_rgba(9,30,66,0.08)] hover:bg-[#f7f9fd]"
                onClick={onToggleNotificationCenter}
              >
                  <Icon name="bell" size={17} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-[#d92d2d] px-1.5 text-[11px] text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>
              {notificationCenterOpen ? (
                <NotificationCenter
                  notifications={notifications}
                  onMarkRead={onMarkNotificationRead}
                  onMarkAllRead={onMarkAllNotificationsRead}
                  onClickNotification={onNotificationClick}
                />
              ) : null}
            </div>
            <div className="relative" ref={desktopProfileWrapperRef}>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[12px] border border-[#c7d6ef] bg-[#eaf0fd] px-3 py-2 text-left text-[0.95rem] text-[#253858] shadow-[0_1px_2px_rgba(9,30,66,0.08)] hover:bg-[#dfe8fb]"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2d64d9] text-[0.78rem] font-semibold text-white">
                  {initials || "U"}
                </span>
                    <span className="font-semibold">
                  {currentUser?.name || "User"}
                </span>
              </button>
              {profileMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 grid w-[min(220px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] gap-1 rounded-[12px] border border-[#d6dce8] bg-white p-2 shadow-[0_10px_24px_rgba(9,30,66,0.18)]">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[1rem] text-[#253858] hover:bg-[#f4f6fa]"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onOpenProfileSecurity?.();
                    }}
                  >
                      <span aria-hidden className="w-5 text-center text-[#4e5d78]">
                        <Icon name="user" size={15} />
                      </span>
                    <span>Profile</span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[1rem] text-[#253858] hover:bg-[#f4f6fa]"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onLogout?.();
                    }}
                  >
                      <span aria-hidden className="w-5 text-center text-[#4e5d78]">
                        <Icon name="logout" size={15} />
                      </span>
                    <span>Logout</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {showProjectSubNav ? (
          <div className="border-b border-[#dbe4f1] bg-[#fbfdff] px-3 pt-[0.6rem] md:px-4">
            <div className="hidden pb-[0.35rem] text-[1.35rem] font-bold text-[#172b4d] md:block">
              {activeView === "board" && activeSprintName
                ? `${currentProjectName || currentProject?.name || "Project"} - ${activeSprintName}`
                : currentProjectName || currentProject?.name || "Project"}
            </div>
            <div className="mb-[0.35rem] h-px bg-[#e5eaf4]" />
            <div className="flex flex-wrap items-center justify-between gap-[0.4rem] pt-[0.1rem]">
              <div className="flex w-full flex-nowrap items-center gap-[0.4rem] overflow-x-auto pb-1 md:w-auto md:flex-wrap md:overflow-visible md:pb-0">
                {projectSubOptions.map((item) => {
                  const isActive = activeView === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`relative whitespace-nowrap rounded-t-[8px] border-b-2 px-[0.75rem] py-[0.45rem] text-[0.9rem] font-semibold transition-colors ${
                        isActive
                          ? "border-[#0b6bcb] text-[#0b6bcb]"
                          : "border-transparent text-[#52627b] hover:text-[#1d4ed8]"
                      }`}
                      onClick={() =>
                        onNavigateProject(currentProjectId, item.key)
                      }
                    >
                      {item.label}
                    </button>
                  );
                })}
                {canManageCurrentProject ? (
                  <button
                    type="button"
                    className="shrink-0 whitespace-nowrap rounded-[8px] border border-[#2d64d9] bg-[#2d64d9] px-3 py-[0.42rem] text-[0.82rem] font-medium text-white hover:border-[#1f4fc4] hover:bg-[#1f4fc4] md:hidden"
                    onClick={() => onNavigateProject(currentProjectId, "settings")}
                  >
                    Go to settings
                  </button>
                ) : null}
              </div>
              {canManageCurrentProject ? (
                <button
                  type="button"
                  className="mb-[0.5rem] hidden rounded-[8px] border border-[#2d64d9] bg-[#2d64d9] px-3 py-[0.42rem] text-[0.82rem] font-medium text-white hover:border-[#1f4fc4] hover:bg-[#1f4fc4] md:block"
                  onClick={() => onNavigateProject(currentProjectId, "settings")}
                >
                  Go to settings
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <main>
          {children}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dbe4f1] bg-[#fbfdff]/95 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(9,30,66,0.1)] md:hidden">
        {projects.length &&
        (activeProjectView.has(activeView) || showWorkspaceProjectSelector) ? (
          <div className="relative mb-2" ref={mobileProjectPickerRef}>
            <label
              htmlFor="mobile-project-selector"
              className="mb-1 block px-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b889f]"
            >
              Project
            </label>
            <button
              id="mobile-project-selector"
              type="button"
              className="flex w-full items-center justify-between rounded-[10px] border border-[#d6dce8] bg-white px-3 py-[0.5rem] text-left text-[0.9rem] text-[#253858]"
              onClick={() => setMobileProjectPickerOpen((prev) => !prev)}
            >
              <span className="min-w-0 truncate">
                {currentProject?.name || "Select a project"}
              </span>
              <span className="ml-2 text-[0.72rem] text-[#607089]">
                {mobileProjectPickerOpen ? "▲" : "▼"}
              </span>
            </button>
            {mobileProjectPickerOpen ? (
              <div className="absolute bottom-[calc(100%+0.35rem)] left-0 right-0 z-40 grid max-h-[220px] overflow-auto rounded-[10px] border border-[#d6dce8] bg-white p-1 shadow-[0_12px_28px_rgba(9,30,66,0.16)]">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`min-w-0 rounded-[8px] px-3 py-[0.5rem] text-left text-[0.9rem] ${
                      String(currentProjectId) === String(project.id)
                        ? "bg-[#d8e2f4] font-semibold text-[#2d64d9]"
                        : "text-[#253858] hover:bg-[#f4f6fa]"
                    }`}
                    onClick={() => {
                      setMobileProjectPickerOpen(false);
                      setShowWorkspaceProjectSelector(false);
                      onNavigateProject(project.id, "board");
                    }}
                    title={project.name}
                  >
                    <span className="block truncate">{project.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-stretch gap-1">
          {mobileMainNavItems.map((item) => {
            const isProjectSpace = item.key === "project-space";
            const isActive = isProjectSpace
              ? activeProjectView.has(activeView)
              : activeView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`grid min-w-0 flex-1 place-items-center gap-[0.15rem] rounded-[10px] px-2 py-[0.35rem] text-center text-[0.72rem] ${
                  isActive
                    ? "bg-[#d8e2f4] font-semibold text-[#2d64d9]"
                    : "text-[#607089] hover:bg-[#f4f6fa]"
                }`}
                onClick={() => {
                  if (isProjectSpace) {
                    if (!activeProjectView.has(activeView) && projects.length > 1) {
                      setShowWorkspaceProjectSelector(true);
                      setMobileProjectPickerOpen(true);
                      return;
                    }
                    if (projects.length === 1) {
                      onNavigateProject(projects[0].id, "board");
                      return;
                    }
                    if (currentProjectId) {
                      onNavigateProject(currentProjectId, mobileProjectTargetView);
                    } else {
                      setShowWorkspaceProjectSelector(true);
                      setMobileProjectPickerOpen(true);
                    }
                    return;
                  }
                  setShowWorkspaceProjectSelector(false);
                  setMobileProjectPickerOpen(false);
                  onNavigateMain(item.key);
                }}
                title={item.label}
              >
                <span className="leading-none">
                  <Icon name={item.icon} size={15} />
                </span>
                <span className="leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default memo(MainLayout);
