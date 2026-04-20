const navItems = [
  { key: "board", label: "Board" },
  { key: "backlog", label: "Backlog" },
  { key: "projects", label: "Projects" },
  { key: "sprints", label: "Sprints" },
  { key: "users", label: "Users" },
  { key: "settings", label: "Settings" },
];

export default function Sidebar({ collapsed, activeView, onNavigate }) {
  return (
    <aside className={`app-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="brand-icon">TM</div>
        {!collapsed ? <div className="brand-text">Task Manager</div> : null}
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sidebar-link ${activeView === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
            title={item.label}
          >
            {!collapsed ? item.label : item.label.slice(0, 1)}
          </button>
        ))}
      </nav>
    </aside>
  );
}
