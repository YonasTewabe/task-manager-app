const PROJECT_ROUTE = /^\/project\/([^/]+)\/(board|backlog|summary|settings)$/;

export function parseRoute(pathname) {
  const normalized = (pathname || "").replace(/\/+$/, "");
  const path = normalized || "/";

  if (path === "/" || path === "/dashboard") {
    return { view: "dashboard", projectId: null };
  }
  if (path === "/users") return { view: "users", projectId: null };
  if (path === "/profile") return { view: "profile", projectId: null };
  if (path === "/reset-password") {
    return { view: "reset-password", projectId: null };
  }
  if (path === "/settings") return { view: "app-settings", projectId: null };
  if (path === "/projects") return { view: "projects", projectId: null };

  const m = path.match(PROJECT_ROUTE);
  if (m) return { view: m[2], projectId: m[1] };

  if (path === "/board" || path === "/backlog" || path === "/sprints") {
    const legacy = path === "/sprints" ? "backlog" : path.slice(1);
    return { view: "_legacy", legacy };
  }

  return { view: "dashboard", projectId: null, unknown: true };
}

export function initialActiveView(pathname) {
  const p = parseRoute(pathname);
  if (p.view === "_legacy" || p.unknown) {
    return "dashboard";
  }
  return p.view;
}
