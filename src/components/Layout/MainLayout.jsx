import { memo, useEffect, useRef, useState } from "react";
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
  children,
}) {
  const notificationWrapperRef = useRef(null);
  const profileWrapperRef = useRef(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const nameParts = String(currentUser?.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = (nameParts[0]?.[0] || "") + (nameParts[1]?.[0] || "");

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
                <span className="font-semibold">{currentUser?.name || "User"}</span>
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
                    <span aria-hidden className="w-5 text-center text-[#4e5d78]">◫</span>
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
                    <span aria-hidden className="w-5 text-center text-[#4e5d78]">↪</span>
                    <span>Logout</span>
                  </button>
                </div>
              ) : null}
            </div>
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
