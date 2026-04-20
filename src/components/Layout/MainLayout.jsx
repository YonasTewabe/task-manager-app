import { useState } from "react";
import Sidebar from "./Sidebar";

export default function MainLayout({
  currentUser,
  onLogout,
  activeView,
  onNavigate,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar collapsed={collapsed} activeView={activeView} onNavigate={onNavigate} />

      <div className="app-main" style={{ marginLeft: collapsed ? 88 : 260 }}>
        <header className="app-header">
          <div className="app-header-left">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setCollapsed((prev) => !prev)}
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
          </div>
          <div className="app-header-right">
            <div className="pill">{currentUser?.name || "User"}</div>
            <button type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
