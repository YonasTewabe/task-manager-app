import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import AuthView from "./components/AuthView";
import BacklogView from "./components/BacklogView";
import BoardView from "./components/BoardView";
import DashboardView from "./components/DashboardView";
import ProjectManagementView from "./components/ProjectManagementView";
import SystemSettingsView from "./components/SystemSettingsView";
import TaskDrawer from "./components/TaskDrawer";
import UserAdminView from "./components/UserAdminView";
import MainLayout from "./components/Layout/MainLayout";
import { apiRequest, getStoredToken, setStoredToken } from "./api/client";
import { PRIORITY_OPTIONS } from "./constants/priorities.js";
import { UNASSIGNED_AVATAR_SRC } from "./constants/unassignedAvatar.js";
import {
  DEFAULT_WORK_TYPE_VALUES,
  getWorkTypeMeta,
} from "./constants/workTypes.js";
import { DEFAULT_WORKFLOW_STAGES } from "./workflowDefaults.js";

const PROJECT_ROUTE = /^\/project\/([^/]+)\/(board|backlog|settings)$/;
const USER_AVATAR_COLORS = [
  "#0B6BCB",
  "#6F42C1",
  "#0D9488",
  "#B45309",
  "#BE185D",
  "#475569",
  "#1D4ED8",
  "#0F766E",
];

function getUserAvatarColor(userId) {
  const value = String(userId || "");
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return USER_AVATAR_COLORS[Math.abs(hash) % USER_AVATAR_COLORS.length];
}

function parseRoute(pathname) {
  const normalized = (pathname || "").replace(/\/+$/, "");
  const path = normalized || "/";

  if (path === "/" || path === "/dashboard") {
    return { view: "dashboard", projectId: null };
  }
  if (path === "/users") return { view: "users", projectId: null };
  if (path === "/settings")
    return { view: "settings_redirect", projectId: null };
  if (path === "/projects") return { view: "projects", projectId: null };

  const m = path.match(PROJECT_ROUTE);
  if (m) return { view: m[2], projectId: m[1] };

  if (path === "/board" || path === "/backlog" || path === "/sprints") {
    const legacy = path === "/sprints" ? "backlog" : path.slice(1);
    return { view: "_legacy", legacy };
  }

  return { view: "dashboard", projectId: null, unknown: true };
}

function initialActiveView(pathname) {
  const p = parseRoute(pathname);
  if (p.view === "_legacy" || p.unknown) return "dashboard";
  if (p.view === "settings_redirect") return "dashboard";
  if (p.view === "board" || p.view === "backlog" || p.view === "settings")
    return p.view;
  return p.view;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(getStoredToken());
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectSettings, setProjectSettings] = useState(null);
  const [columns, setColumns] = useState([]);
  const [boardTotalsByStatus, setBoardTotalsByStatus] = useState({});
  const [backlogTasks, setBacklogTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [, setSprintTasks] = useState([]);
  const [selectedSprintId, setSelectedSprintId] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskType, setTaskType] = useState("task");
  const [taskLabel, setTaskLabel] = useState("");
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const filterPopoverRef = useRef(null);
  const [taskBundle, setTaskBundle] = useState(null);
  const [activeView, setActiveView] = useState(() =>
    initialActiveView(location.pathname),
  );
  const [dashboardAssignedTasks, setDashboardAssignedTasks] = useState([]);
  const [filters, setFilters] = useState({
    assigneeId: "",
    priority: "",
    label: "",
    search: "",
  });
  const [filterDraft, setFilterDraft] = useState({
    sprintId: "",
    assigneeId: "",
    priority: "",
    label: "",
  });

  const notify = (text, tone = "success") =>
    tone === "error" ? toast.error(text) : toast.success(text);

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((user) => map.set(user.id, user.name));
    return map;
  }, [users]);
  const activeSprintId = useMemo(() => {
    const activeSprint = sprints.find((sprint) => sprint.status === "active");
    return activeSprint ? String(activeSprint.id) : "";
  }, [sprints]);
  const canManage = currentUser?.role === "admin";

  const workflowStages = useMemo(
    () =>
      projectSettings?.boardCardFields?.workflowStages?.length > 0
        ? projectSettings.boardCardFields.workflowStages
        : DEFAULT_WORKFLOW_STAGES,
    [projectSettings?.boardCardFields?.workflowStages],
  );

  const visibleProjects = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "admin") return projects;
    return projects.filter((project) =>
      (project.members || []).some(
        (member) => String(member.id) === String(currentUser.id),
      ),
    );
  }, [projects, currentUser]);

  const projectById = useMemo(() => {
    const map = new Map();
    projects.forEach((p) => map.set(String(p.id), p));
    return map;
  }, [projects]);
  const projectUsers = useMemo(() => {
    if (!currentProjectId) return [];
    const memberIds = new Set(
      (projectById.get(String(currentProjectId))?.members || []).map((member) =>
        String(member.id),
      ),
    );
    return users
      .filter((user) => memberIds.has(String(user.id)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [currentProjectId, projectById, users]);
  const assigneeFilterItems = useMemo(() => {
    const sortedUsers = [...projectUsers];
    const me = currentUser
      ? sortedUsers.find((user) => String(user.id) === String(currentUser.id))
      : null;
    const others = currentUser
      ? sortedUsers.filter((user) => String(user.id) !== String(currentUser.id))
      : sortedUsers;

    const items = [
      {
        id: "unassigned",
        label: "Unassigned",
        initials: "U",
        isUnassigned: true,
      },
    ];
    if (me) {
      const meInitials = me.name
        .split(" ")
        .map((part) => part[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
      items.push({
        id: String(me.id),
        label: `${me.name} (You)`,
        initials: meInitials,
        isUnassigned: false,
      });
    }
    others.forEach((user) => {
      const initials = user.name
        .split(" ")
        .map((part) => part[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
      items.push({
        id: String(user.id),
        label: user.name,
        initials,
        isUnassigned: false,
      });
    });
    return items;
  }, [projectUsers, currentUser]);

  const fetchMyAssignedTasks = async () => {
    if (!token || !currentUser) return;
    try {
      const data = await apiRequest("/task-management/me/assigned-tasks");
      setDashboardAssignedTasks(data || []);
    } catch {
      setDashboardAssignedTasks([]);
    }
  };

  const fetchBootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, groups] = await Promise.all([
        apiRequest("/task-management/bootstrap"),
        apiRequest("/task-management/user-groups"),
      ]);
      setCurrentUser(data.currentUser);
      setUsers(data.users || []);
      setProjects(data.projects || []);
      setUserGroups(groups || []);
    } catch (err) {
      setError(err.message || "Failed to load bootstrap");
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectSettings = async (projectId) => {
    if (!projectId) {
      setProjectSettings(null);
      return;
    }
    const settings = await apiRequest(
      `/task-management/projects/${encodeURIComponent(projectId)}/settings`,
    );
    setProjectSettings(settings);
  };

  const buildTaskQuery = (
    sprintId,
    projectId = currentProjectId,
    activeFilters = filters,
  ) => {
    const params = new URLSearchParams();
    params.set("sprintId", sprintId ? String(sprintId) : "backlog");
    if (projectId) params.set("projectId", String(projectId));
    if (activeFilters.assigneeId)
      params.set("assigneeId", activeFilters.assigneeId);
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim())
      params.set("label", activeFilters.label.trim());
    if (activeFilters.search.trim())
      params.set("search", activeFilters.search.trim());
    return `?${params.toString()}`;
  };

  const fetchBoard = async (
    sprintId,
    projectId = currentProjectId,
    activeFilters = filters,
  ) => {
    if (!projectId) {
      setColumns([]);
      return;
    }
    const data = await apiRequest(
      `/task-management/board${buildTaskQuery(sprintId, projectId, activeFilters)}`,
    );
    setColumns(data.columns || []);
  };

  const fetchBoardTotals = async (
    sprintId,
    projectId = currentProjectId,
    activeFilters = filters,
  ) => {
    if (!projectId || !sprintId) {
      setBoardTotalsByStatus({});
      return;
    }
    const filtersWithoutAssignee = { ...activeFilters, assigneeId: "" };
    const data = await apiRequest(
      `/task-management/board${buildTaskQuery(
        sprintId,
        projectId,
        filtersWithoutAssignee,
      )}`,
    );
    const totals = {};
    (data.columns || []).forEach((column) => {
      totals[column.status] = (column.tasks || []).length;
    });
    setBoardTotalsByStatus(totals);
  };

  const fetchBacklog = async (
    projectId = currentProjectId,
    activeFilters = filters,
  ) => {
    if (!projectId) {
      setBacklogTasks([]);
      return;
    }
    const params = new URLSearchParams();
    params.set("projectId", String(projectId));
    if (activeFilters.assigneeId)
      params.set("assigneeId", activeFilters.assigneeId);
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim())
      params.set("label", activeFilters.label.trim());
    if (activeFilters.search.trim())
      params.set("search", activeFilters.search.trim());
    const query = params.toString();
    const data = await apiRequest(
      `/task-management/backlog${query ? `?${query}` : ""}`,
    );
    setBacklogTasks(data || []);
  };

  const fetchAllTasks = async (
    projectId = currentProjectId,
    activeFilters = filters,
  ) => {
    if (!projectId) {
      setAllTasks([]);
      return;
    }
    const params = new URLSearchParams();
    params.set("projectId", String(projectId));
    if (activeFilters.assigneeId)
      params.set("assigneeId", activeFilters.assigneeId);
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim())
      params.set("label", activeFilters.label.trim());
    if (activeFilters.search.trim())
      params.set("search", activeFilters.search.trim());
    const query = params.toString();
    const data = await apiRequest(
      `/task-management/tasks${query ? `?${query}` : ""}`,
    );
    setAllTasks(data || []);
  };

  const fetchSprints = async (projectId = currentProjectId) => {
    if (!projectId) {
      setSprints([]);
      return [];
    }
    const data = await apiRequest(
      `/task-management/sprints?projectId=${encodeURIComponent(projectId)}`,
    );
    setSprints(data || []);
    return data || [];
  };

  const fetchSprintTasks = async (sprintId, projectId = currentProjectId) => {
    if (!sprintId || !projectId) {
      setSprintTasks([]);
      return;
    }
    const data = await apiRequest(
      `/task-management/sprints/${sprintId}/tasks?projectId=${encodeURIComponent(projectId)}`,
    );
    setSprintTasks(data || []);
  };

  const refreshViews = async (
    sprintId = selectedSprintId,
    projectId = currentProjectId,
    activeFilters = filters,
  ) => {
    if (!projectId) {
      setColumns([]);
      setBoardTotalsByStatus({});
      setBacklogTasks([]);
      setAllTasks([]);
      setSprints([]);
      setSprintTasks([]);
      return;
    }
    const latestSprints = await fetchSprints(projectId);
    if (
      sprintId &&
      !latestSprints.some((sprint) => String(sprint.id) === String(sprintId))
    ) {
      setSelectedSprintId("");
      sprintId = "";
    }
    const latestActiveSprint = latestSprints.find(
      (sprint) => sprint.status === "active",
    );
    const boardSprintId =
      activeView === "board" ? String(latestActiveSprint?.id || "") : sprintId;
    await Promise.all([
      boardSprintId
        ? fetchBoard(boardSprintId, projectId, activeFilters)
        : Promise.resolve(setColumns([])),
      activeView === "board" && boardSprintId
        ? fetchBoardTotals(boardSprintId, projectId, activeFilters)
        : Promise.resolve(setBoardTotalsByStatus({})),
      fetchBacklog(projectId, activeFilters),
      fetchAllTasks(projectId, activeFilters),
    ]);
  };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchBootstrap().catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !currentProjectId) {
      setProjectSettings(null);
      return;
    }
    fetchProjectSettings(currentProjectId).catch(() =>
      setProjectSettings(null),
    );
  }, [token, currentProjectId]);

  const projectLabels = useMemo(() => {
    const labels = projectSettings?.generalRules?.labels;
    if (!Array.isArray(labels)) return [];
    const cleaned = labels
      .map((label) => String(label || "").trim())
      .filter(Boolean);
    return [...new Set(cleaned)];
  }, [projectSettings?.generalRules?.labels]);
  const projectTypes = useMemo(() => {
    const rawTypes = projectSettings?.generalRules?.types;
    const source =
      Array.isArray(rawTypes) && rawTypes.length
        ? rawTypes
        : DEFAULT_WORK_TYPE_VALUES;
    return [
      ...new Set(
        source
          .map((type) =>
            String(type || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
  }, [projectSettings?.generalRules?.types]);

  useEffect(() => {
    if (!token || loading || !currentProjectId) return;
    const boardSprintId =
      activeView === "board" ? activeSprintId : selectedSprintId;
    if (!boardSprintId) {
      setColumns([]);
      setBoardTotalsByStatus({});
      return;
    }
    Promise.all([
      fetchBoard(boardSprintId, currentProjectId, filters),
      fetchBoardTotals(boardSprintId, currentProjectId, filters),
    ]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSprintId, activeView, filters, activeSprintId, currentProjectId]);

  useEffect(() => {
    if (!token || loading) return;
    if (!visibleProjects.length) {
      setCurrentProjectId("");
      return;
    }
    if (
      !currentProjectId ||
      !visibleProjects.some(
        (project) => String(project.id) === String(currentProjectId),
      )
    ) {
      setCurrentProjectId(String(visibleProjects[0].id));
    }
  }, [visibleProjects, currentProjectId, token, loading]);

  useEffect(() => {
    if (!token || loading) return;
    refreshViews(selectedSprintId, currentProjectId, filters).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  useEffect(() => {
    if (!token || loading || activeView !== "dashboard") return;
    fetchMyAssignedTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loading, activeView, currentUser?.id]);

  useEffect(() => {
    if (!showFilterModal) return undefined;
    const handleClickOutside = (event) => {
      if (!filterPopoverRef.current) return;
      if (!filterPopoverRef.current.contains(event.target)) {
        setShowFilterModal(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFilterModal]);

  useEffect(() => {
    const parsed = parseRoute(location.pathname);

    if (parsed.view === "settings_redirect") {
      if (!token || loading) return;
      if (!visibleProjects.length) {
        navigate("/dashboard", { replace: true });
        return;
      }
      const inScope =
        currentProjectId &&
        visibleProjects.some((p) => String(p.id) === String(currentProjectId));
      const pid = inScope
        ? String(currentProjectId)
        : String(visibleProjects[0].id);
      navigate(`/project/${pid}/settings`, { replace: true });
      return;
    }

    if (parsed.view === "_legacy") {
      if (!token || loading) return;
      if (!visibleProjects.length) {
        navigate("/dashboard", { replace: true });
        return;
      }
      const pid = visibleProjects[0].id;
      navigate(`/project/${pid}/${parsed.legacy}`, { replace: true });
      return;
    }

    if (
      parsed.unknown &&
      location.pathname !== "/dashboard" &&
      location.pathname !== "/"
    ) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (parsed.projectId) {
      setCurrentProjectId(String(parsed.projectId));
    }

    let nextActive = "dashboard";
    if (
      parsed.view === "board" ||
      parsed.view === "backlog" ||
      parsed.view === "settings"
    ) {
      nextActive = parsed.view;
    } else if (parsed.view === "users") nextActive = "users";
    else if (parsed.view === "projects") nextActive = "projects";

    setActiveView(nextActive);
  }, [
    location.pathname,
    token,
    loading,
    visibleProjects,
    navigate,
    currentProjectId,
  ]);

  const handleNavigateMain = (key) => {
    if (key === "dashboard") {
      setActiveView("dashboard");
      navigate("/dashboard");
      return;
    }
    if (key === "projects") {
      setActiveView("projects");
      navigate("/projects");
      return;
    }
    if (key === "users") {
      setActiveView("users");
      navigate("/users");
      return;
    }
  };

  const handleNavigateProject = (projectId, subview) => {
    const id = String(projectId);
    setCurrentProjectId(id);
    setSelectedSprintId("");
    setActiveView(subview);
    navigate(`/project/${id}/${subview}`);
  };

  const login = async ({ email, password }) => {
    setAuthLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(data.token);
      setToken(data.token);
      setCurrentUser(data.user);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async ({ name, email, password }) => {
    setAuthLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setStoredToken(data.token);
      setToken(data.token);
      setCurrentUser(data.user);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    setStoredToken("");
    setToken("");
    setCurrentUser(null);
    setUsers([]);
    setSprints([]);
    setColumns([]);
    setBacklogTasks([]);
    setAllTasks([]);
    setTaskBundle(null);
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (!taskTitle.trim() || !currentProjectId) return;
    await apiRequest("/task-management/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: taskTitle.trim(),
        storyPoints: storyPoints === "" ? null : Number(storyPoints),
        status: "todo",
        priority: taskPriority,
        type: taskType,
        label: taskLabel.trim(),
        projectId: currentProjectId,
        assigneeId: assigneeId || null,
        sprintId: activeView === "board" ? activeSprintId || null : null,
      }),
    });
    setTaskTitle("");
    setStoryPoints("");
    setAssigneeId("");
    setTaskPriority("medium");
    setTaskType("task");
    setTaskLabel("");
    setShowCreateTaskModal(false);
    await refreshViews(selectedSprintId, currentProjectId, filters);
  };

  const moveTask = async (taskId, status) => {
    await apiRequest(`/task-management/tasks/${taskId}/move`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await refreshViews(selectedSprintId, currentProjectId, filters);
  };

  const openTask = async (taskId) => {
    const bundle = await apiRequest(`/task-management/tasks/${taskId}`);
    setTaskBundle(bundle);
  };

  const saveTask = async (taskId, patch) => {
    await apiRequest(`/task-management/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await openTask(taskId);
    await refreshViews(selectedSprintId, currentProjectId, filters);
    if (activeView === "dashboard") await fetchMyAssignedTasks();
  };

  const addComment = async (taskId, body) => {
    await apiRequest(`/task-management/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    await openTask(taskId);
    if (activeView === "dashboard") await fetchMyAssignedTasks();
  };

  const createUser = async (payload) => {
    try {
      const created = await apiRequest("/task-management/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setUsers((prev) => [created, ...prev]);
      notify("User created.");
    } catch (error) {
      notify(error.message || "Failed to create user.", "error");
      throw error;
    }
  };

  const updateUser = async (userId, draft) => {
    const payload = {
      name: draft.name,
      email: draft.email,
      role: draft.role,
    };
    if (draft.password?.trim()) {
      payload.password = draft.password.trim();
    }

    try {
      const updated = await apiRequest(`/task-management/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setUserGroups(await apiRequest("/task-management/user-groups"));
      notify("User updated.");
    } catch (error) {
      notify(error.message || "Failed to update user.", "error");
      throw error;
    }
  };

  const deleteUser = async (userId) => {
    try {
      await apiRequest(`/task-management/users/${userId}`, {
        method: "DELETE",
      });
      setUsers((prev) => prev.filter((u) => String(u.id) !== String(userId)));
      setUserGroups(await apiRequest("/task-management/user-groups"));
      notify("User deleted.");
    } catch (error) {
      notify(error.message || "Failed to delete user.", "error");
      throw error;
    }
  };

  const createUserGroup = async (payload) => {
    try {
      const created = await apiRequest("/task-management/user-groups", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setUserGroups((prev) =>
        [created, ...prev].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setUsers(await apiRequest("/task-management/users"));
      notify("User group created.");
    } catch (error) {
      notify(error.message || "Failed to create user group.", "error");
      throw error;
    }
  };

  const updateUserGroup = async (groupId, payload) => {
    try {
      const updated = await apiRequest(
        `/task-management/user-groups/${groupId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
      setUserGroups((prev) =>
        prev.map((g) => (String(g.id) === String(groupId) ? updated : g)),
      );
      setUsers(await apiRequest("/task-management/users"));
      notify("User group updated.");
    } catch (error) {
      notify(error.message || "Failed to update user group.", "error");
      throw error;
    }
  };

  const deleteUserGroup = async (groupId) => {
    try {
      await apiRequest(`/task-management/user-groups/${groupId}`, {
        method: "DELETE",
      });
      setUserGroups((prev) =>
        prev.filter((g) => String(g.id) !== String(groupId)),
      );
      setUsers(await apiRequest("/task-management/users"));
      notify("User group deleted.");
    } catch (error) {
      notify(error.message || "Failed to delete user group.", "error");
      throw error;
    }
  };

  const createSprint = async (draft) => {
    if (!currentProjectId) return;
    const created = await apiRequest("/task-management/sprints", {
      method: "POST",
      body: JSON.stringify({
        name: draft.name,
        projectId: currentProjectId,
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
        status: "planned",
      }),
    });
    setSprints((prev) =>
      [created, ...prev].sort((a, b) =>
        String(a.name).localeCompare(String(b.name)),
      ),
    );
    notify("Sprint created.");
  };

  const _updateSprint = async (sprintId, draft) => {
    const updated = await apiRequest(`/task-management/sprints/${sprintId}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    });
    setSprints((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    notify("Sprint updated.");
  };

  const createProject = async (payload) => {
    const created = await apiRequest("/task-management/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setProjects((prev) => [created, ...prev]);
    const id = String(created.id);
    setCurrentProjectId(id);
    setActiveView("settings");
    navigate(`/project/${id}/settings`);
    notify("Project created.");
  };

  const updateProject = async (projectId, draft) => {
    const updated = await apiRequest(`/task-management/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    });
    setProjects((prev) =>
      prev.map((project) => (project.id === updated.id ? updated : project)),
    );
    notify("Project updated.");
  };

  const deleteProject = async (projectId) => {
    await apiRequest(`/task-management/projects/${projectId}`, {
      method: "DELETE",
    });
    setProjects((prev) =>
      prev.filter((project) => String(project.id) !== String(projectId)),
    );
    if (String(currentProjectId) === String(projectId)) {
      setCurrentProjectId("");
      setActiveView("dashboard");
      navigate("/dashboard", { replace: true });
    }
    notify("Project deleted.");
  };

  const saveProjectSettings = async (nextSettings) => {
    if (!currentProjectId) return null;
    const updated = await apiRequest(
      `/task-management/projects/${encodeURIComponent(currentProjectId)}/settings`,
      {
        method: "PATCH",
        body: JSON.stringify(nextSettings),
      },
    );
    setProjectSettings(updated);
    if (token && currentProjectId) {
      await refreshViews(selectedSprintId, currentProjectId, filters);
    }
    return updated;
  };

  const saveProjectMembers = async (memberIds) => {
    if (!currentProjectId) return null;
    const updated = await apiRequest(
      `/task-management/projects/${currentProjectId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ memberIds }),
      },
    );
    setProjects((prev) =>
      prev.map((project) => (project.id === updated.id ? updated : project)),
    );
    notify("Project users saved.");
    return updated;
  };

  const startSprint = async (sprintId) => {
    try {
      await apiRequest(`/task-management/sprints/${sprintId}/start`, {
        method: "POST",
        body: "{}",
      });
      setSprints(
        await apiRequest(
          `/task-management/sprints?projectId=${encodeURIComponent(currentProjectId)}`,
        ),
      );
      await fetchSprintTasks(sprintId, currentProjectId);
      await refreshViews(selectedSprintId, currentProjectId, filters);
    } catch (error) {
      notify(error.message || "Failed to start sprint.", "error");
    }
  };

  const completeSprint = async (sprintId, moveIncompleteToSprintId = null) => {
    await apiRequest(`/task-management/sprints/${sprintId}/complete`, {
      method: "POST",
      body: JSON.stringify({ moveIncompleteToSprintId }),
    });
    setSprints(
      await apiRequest(
        `/task-management/sprints?projectId=${encodeURIComponent(currentProjectId)}`,
      ),
    );
    await refreshViews(selectedSprintId, currentProjectId, filters);
    await fetchSprintTasks(selectedSprintId, currentProjectId);
  };

  const deleteSprint = async (sprintId) => {
    await apiRequest(`/task-management/sprints/${sprintId}`, {
      method: "DELETE",
    });
    setSprints(
      await apiRequest(
        `/task-management/sprints?projectId=${encodeURIComponent(currentProjectId)}`,
      ),
    );
    await refreshViews(selectedSprintId, currentProjectId, filters);
  };

  const assignTaskToSprintFromBacklog = async (taskId, sprintId) => {
    try {
      await apiRequest(`/task-management/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ sprintId: sprintId || null }),
      });
      await refreshViews(selectedSprintId, currentProjectId, filters);
      notify("Task moved.");
    } catch (error) {
      notify(error.message || "Failed to move task.", "error");
    }
  };

  const _addTasksToSprint = async (sprintId, taskIds) => {
    await apiRequest(`/task-management/sprints/${sprintId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ taskIds }),
    });
    await Promise.all([
      fetchBacklog(currentProjectId, filters),
      fetchSprintTasks(sprintId, currentProjectId),
      fetchBoard(sprintId, currentProjectId, filters),
    ]);
  };

  const _removeTaskFromSprint = async (sprintId, taskId) => {
    await apiRequest(`/task-management/sprints/${sprintId}/tasks/${taskId}`, {
      method: "DELETE",
    });
    await Promise.all([
      fetchBacklog(currentProjectId, filters),
      fetchSprintTasks(sprintId, currentProjectId),
      fetchBoard(sprintId, currentProjectId, filters),
    ]);
  };

  if (!token) {
    return (
      <AuthView
        onLogin={login}
        onRegister={register}
        loading={authLoading}
        error={error}
      />
    );
  }

  const safeColumns = (
    columns.length
      ? columns
      : workflowStages.map((s) => ({
          status: s.key,
          name: s.name,
          description: s.description,
          counterGroup: s.counterGroup,
          tasks: [],
        }))
  ).sort((a, b) => {
    const rank = { upcoming: 0, active: 1, done: 2 };
    const aRank = rank[a.counterGroup] ?? 1;
    const bRank = rank[b.counterGroup] ?? 1;
    if (aRank !== bRank) return aRank - bRank;
    return 0;
  });

  return (
    <MainLayout
      currentUser={currentUser}
      onLogout={logout}
      activeView={activeView}
      currentProjectId={currentProjectId}
      projects={visibleProjects}
      expandedProjectIds={[]}
      onNavigateMain={handleNavigateMain}
      onNavigateProject={handleNavigateProject}
    >
      <div className="jira-shell">
        {(activeView === "board" || activeView === "backlog") &&
        currentProjectId ? (
          <section
            className={`panel top-task-controls ${activeView === "board" ? "board-toolbar" : ""}`}
          >
            <div className="board-toolbar-main">
              <div className="board-quickbar">
                <div className="search-chip">
                  <span className="search-icon">⌕</span>
                  <input
                    placeholder="Search board"
                    value={filters.search}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        search: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="assignee-strip" title="Team members">
                  {assigneeFilterItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`chip-avatar ${item.isUnassigned ? "chip-avatar-unassigned" : ""} ${filters.assigneeId === item.id ? "active" : ""}`}
                      style={
                        item.isUnassigned
                          ? undefined
                          : { backgroundColor: getUserAvatarColor(item.id) }
                      }
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          assigneeId:
                            prev.assigneeId === item.id ? "" : item.id,
                        }))
                      }
                      title={item.label}
                    >
                      {item.isUnassigned ? (
                        <img
                          className="avatar-icon"
                          src={UNASSIGNED_AVATAR_SRC}
                          alt=""
                          aria-hidden="true"
                        />
                      ) : (
                        item.initials
                      )}
                    </button>
                  ))}
                </div>
                <div className="board-toolbar-actions">
                  <div
                    className="filter-popover-wrapper"
                    ref={filterPopoverRef}
                  >
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setFilterDraft({
                          sprintId:
                            activeView === "board"
                              ? ""
                              : selectedSprintId || "",
                          assigneeId: filters.assigneeId,
                          priority: filters.priority,
                          label: filters.label,
                        });
                        setShowFilterModal((prev) => !prev);
                      }}
                    >
                      Filter
                    </button>
                    {showFilterModal ? (
                      <div
                        className="filter-popover"
                        role="dialog"
                        aria-modal="false"
                      >
                        <div className="filter-popover-head">
                          <div>
                            <h3>Filter</h3>
                          </div>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => setShowFilterModal(false)}
                          >
                            X
                          </button>
                        </div>
                        <div className="filter-popover-grid">
                          {activeView !== "board" ? (
                            <label>
                              Sprint
                              <select
                                value={filterDraft.sprintId}
                                onChange={(event) =>
                                  setFilterDraft((prev) => ({
                                    ...prev,
                                    sprintId: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Backlog</option>
                                {sprints.map((sprint) => (
                                  <option key={sprint.id} value={sprint.id}>
                                    {sprint.name} ({sprint.status})
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <label>
                            Assignee
                            <select
                              value={filterDraft.assigneeId}
                              onChange={(event) =>
                                setFilterDraft((prev) => ({
                                  ...prev,
                                  assigneeId: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="unassigned">Unassigned</option>
                              {projectUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Priority
                            <select
                              value={filterDraft.priority}
                              onChange={(event) =>
                                setFilterDraft((prev) => ({
                                  ...prev,
                                  priority: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              {PRIORITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="filter-popover-span">
                            Label
                            <select
                              value={filterDraft.label}
                              onChange={(event) =>
                                setFilterDraft((prev) => ({
                                  ...prev,
                                  label: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              {projectLabels.map((label) => (
                                <option key={label} value={label}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="filter-popover-actions">
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() =>
                              setFilterDraft({
                                sprintId: "",
                                assigneeId: "",
                                priority: "",
                                label: "",
                              })
                            }
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (activeView !== "board") {
                                setSelectedSprintId(filterDraft.sprintId || "");
                              }
                              setFilters((prev) => ({
                                ...prev,
                                assigneeId: filterDraft.assigneeId,
                                priority: filterDraft.priority,
                                label: filterDraft.label,
                              }));
                              setShowFilterModal(false);
                            }}
                          >
                            Filter
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {activeView === "board" ? (
                    <button
                      type="button"
                      onClick={() => setShowCreateTaskModal(true)}
                    >
                      Add Task
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {loading ? <p>Loading...</p> : null}
        {activeView === "dashboard" ? (
          <DashboardView
            currentUser={currentUser}
            projects={visibleProjects}
            assignedTasks={dashboardAssignedTasks}
            projectById={projectById}
            workflowStages={workflowStages}
            canManage={canManage}
            onOpenProject={(id) => handleNavigateProject(id, "board")}
            onOpenTask={openTask}
          />
        ) : null}
        {showCreateTaskModal ? (
          <div
            className="modal-overlay"
            role="presentation"
            onClick={() => setShowCreateTaskModal(false)}
          >
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-head">
                <h3>Create Task</h3>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setShowCreateTaskModal(false)}
                >
                  X
                </button>
              </div>
              <form className="project-form" onSubmit={createTask}>
                <label>
                  <span className="field-label">
                    Task title <span className="required-indicator">*</span>
                  </span>
                  <input
                    placeholder="Enter task title"
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                  />
                </label>
                <label>
                  Story points
                  <input
                    type="number"
                    min="1"
                    max="21"
                    placeholder="Enter story points"
                    value={storyPoints}
                    onChange={(event) => setStoryPoints(event.target.value)}
                  />
                </label>
                <label>
                  <span className="field-label">
                    Work type <span className="required-indicator">*</span>
                  </span>
                  <select
                    value={taskType}
                    onChange={(event) => setTaskType(event.target.value)}
                  >
                    {projectTypes.map((type) => {
                      const meta = getWorkTypeMeta(type);
                      return (
                        <option key={type} value={type}>
                          {meta.label}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label>
                  Assignee
                  <select
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {projectUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={taskPriority}
                    onChange={(event) => setTaskPriority(event.target.value)}
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Label
                  <select
                    value={taskLabel}
                    onChange={(event) => setTaskLabel(event.target.value)}
                  >
                    <option value="">Select label</option>
                    {projectLabels.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setShowCreateTaskModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit">Create Task</button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
        {activeView === "backlog" ? (
          <BacklogView
            tasks={backlogTasks}
            sprints={sprints}
            allTasks={allTasks}
            workflowStages={workflowStages}
            selectedSprintId={selectedSprintId}
            onSelectSprint={setSelectedSprintId}
            canManage={canManage}
            onStartSprint={startSprint}
            onCompleteSprint={completeSprint}
            onDeleteSprint={deleteSprint}
            onAssignTaskToSprint={assignTaskToSprintFromBacklog}
            onCreateSprint={createSprint}
            onAddTask={() => setShowCreateTaskModal(true)}
            onOpenTask={openTask}
          />
        ) : null}

        {activeView === "board" ? (
          <BoardView
            columns={safeColumns}
            usersById={usersById}
            userAvatarColor={getUserAvatarColor}
            boardTotalsByStatus={boardTotalsByStatus}
            assigneeFilterActive={Boolean(filters.assigneeId)}
            onMove={moveTask}
            onOpenTask={openTask}
          />
        ) : null}

        {activeView === "projects" ? (
          <ProjectManagementView
            projects={visibleProjects}
            canManage={canManage}
            onCreateProject={createProject}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
            onConfigureProject={(projectId) =>
              handleNavigateProject(projectId, "settings")
            }
          />
        ) : null}

        {activeView === "users" ? (
          <UserAdminView
            users={users}
            userGroups={userGroups}
            canManage={canManage}
            currentUserId={currentUser?.id}
            onCreateUser={createUser}
            onUpdateUser={updateUser}
            onDeleteUser={deleteUser}
            onCreateUserGroup={createUserGroup}
            onUpdateUserGroup={updateUserGroup}
            onDeleteUserGroup={deleteUserGroup}
          />
        ) : null}

        {activeView === "settings" && currentProjectId ? (
          <SystemSettingsView
            settings={projectSettings}
            projectName={projectById.get(String(currentProjectId))?.name}
            users={users}
            userGroups={userGroups}
            projectMembers={
              projectById.get(String(currentProjectId))?.members || []
            }
            canManage={canManage}
            onSave={saveProjectSettings}
            onSaveMembers={saveProjectMembers}
            onNotify={notify}
          />
        ) : null}

        <TaskDrawer
          taskBundle={taskBundle}
          users={users}
          workflowStages={workflowStages}
          labels={projectLabels}
          onClose={() => setTaskBundle(null)}
          onSaveTask={saveTask}
          onAddComment={addComment}
        />
        <ToastContainer
          position="top-right"
          autoClose={1600}
          hideProgressBar
          theme="colored"
        />
      </div>
    </MainLayout>
  );
}

export default App;
