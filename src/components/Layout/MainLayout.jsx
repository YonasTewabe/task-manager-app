import { memo, useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import NotificationCenter from "../NotificationCenter";

function MainLayout({
  currentUser,
  onLogout,
  canManage = false,
  activeView,
  currentProjectId,
  projects,
  onNavigateMain,
  onOpenProfileSecurity,
  onNavigateProject,
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
  const notificationWrapperRef = useRef(null);
  const profileWrapperRef = useRef(null);
  const globalSearchWrapperRef = useRef(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
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

  useEffect(() => {
    if (!notificationCenterOpen) return undefined;
    const handlePointerDown = (event) => {
      if (
        notificationWrapperRef.current &&
        !notificationWrapperRef.current.contains(event.target)
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
      if (
        profileWrapperRef.current &&
        !profileWrapperRef.current.contains(event.target)
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

  return (
    <div className="min-h-screen">
      <Sidebar
        activeView={activeView}
        currentProjectId={currentProjectId}
        projects={projects}
        canManage={canManage}
        onNavigateMain={onNavigateMain}
        onNavigateProject={onNavigateProject}
      />

      <div className="ml-[260px] min-h-screen max-[1100px]:ml-[88px]">
        <header className="sticky top-0 z-[15] flex h-16 items-center justify-between border-b border-[#dfe1e6] bg-white/90 px-4 backdrop-blur-[4px]">
          <div className="flex w-full min-w-0 flex-1 items-center gap-3">
            <div
              className="relative w-full min-w-0 flex-1"
              ref={globalSearchWrapperRef}
            >
              <div className="flex items-center gap-[0.4rem] rounded-[10px] border border-[#d6dce8] bg-[#f7f8fa] px-[0.7rem] py-[0.45rem]">
                <span className="text-[0.92rem] text-[#6b778c]">⌕</span>
                <input
                  className="w-full border-none bg-transparent p-0 shadow-none focus:outline-none focus-visible:outline-none"
                  value={globalSearchTerm}
                  placeholder="Search"
                  onFocus={() => {
                    if (globalSearchResults.length || globalSearchTerm.trim()) {
                      setGlobalSearchOpen(true);
                    }
                  }}
                  onChange={(event) => setGlobalSearchTerm(event.target.value)}
                />
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
          <div className="ml-3 flex shrink-0 items-center gap-2">
            <div className="relative" ref={notificationWrapperRef}>
              <button
                type="button"
                aria-label="Notifications"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d6dce8] bg-white text-[#42526e] hover:bg-[#f4f6fa]"
                onClick={onToggleNotificationCenter}
              >
                <span aria-hidden className="text-[1.05rem] leading-none">
                  🔔
                </span>
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
            <div className="relative" ref={profileWrapperRef}>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[12px] border border-[#cdd8ef] bg-[#dfe8fb] px-3 py-2 text-left text-[0.95rem] text-[#253858] hover:bg-[#d3dff7]"
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
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 grid min-w-[190px] gap-1 rounded-[12px] border border-[#d6dce8] bg-white p-2 shadow-[0_10px_24px_rgba(9,30,66,0.18)]">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[1rem] text-[#253858] hover:bg-[#f4f6fa]"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onOpenProfileSecurity?.();
                    }}
                  >
                    <span
                      aria-hidden
                      className="w-5 text-center text-[#4e5d78]"
                    >
                      ◫
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
                    <span
                      aria-hidden
                      className="w-5 text-center text-[#4e5d78]"
                    >
                      ↪
                    </span>
                    <span>Logout</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {showProjectSubNav ? (
          <div className="border-b border-[#dfe1e6] bg-white px-4 pt-[0.6rem]">
            <div className="pb-[0.35rem] text-[1.15rem] font-bold text-[#172b4d]">
              {currentProject?.name || "Project"}
            </div>
            <div className="flex flex-wrap items-center gap-[0.4rem]">
              {projectSubOptions.map((item) => {
                const isActive = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`relative rounded-t-[8px] border-b-2 px-[0.75rem] py-[0.45rem] text-[0.9rem] font-semibold transition-colors ${
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
            </div>
          </div>
        ) : null}

        <main className={activeView === "dashboard" ? undefined : "p-4"}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default memo(MainLayout);
