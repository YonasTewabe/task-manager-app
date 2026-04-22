import { memo, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";
import NotificationCenter from "../NotificationCenter";

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
  notifications = [],
  unreadCount = 0,
  notificationCenterOpen = false,
  onToggleNotificationCenter,
  onCloseNotificationCenter,
  onNotificationClick,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  children,
}) {
  const notificationWrapperRef = useRef(null);

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
                  <span className="absolute -right-1 -top-1 rounded-full bg-[#2d64d9] px-1.5 text-[11px] text-white">
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
