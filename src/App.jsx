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
import Modal from "./components/ui/Modal";
import { apiRequest, getStoredToken, setStoredToken } from "./api/client";
import { PRIORITY_OPTIONS } from "./constants/priorities.js";
import { UNASSIGNED_AVATAR_SRC } from "./constants/unassignedAvatar.js";
import {
  DEFAULT_WORK_TYPE_VALUES,
  getWorkTypeMeta,
} from "./constants/workTypes.js";
import { DEFAULT_WORKFLOW_STAGES } from "./workflowDefaults.js";

const PROJECT_ROUTE = /^\/project\/([^/]+)\/(board|backlog|settings)$/;
const ASSIGNEE_VISIBLE_LIMIT = 6;
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
  const [taskVersion, setTaskVersion] = useState("");
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showAssigneeOverflow, setShowAssigneeOverflow] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
  });
  const filterPopoverRef = useRef(null);
  const assigneeOverflowRef = useRef(null);
  const confirmResolverRef = useRef(null);
  const latestSettingsProjectIdRef = useRef("");
  const latestProjectIdRef = useRef("");
  const [taskBundle, setTaskBundle] = useState(null);
  const [activeView, setActiveView] = useState(() =>
    initialActiveView(location.pathname),
  );
  const [dashboardAssignedTasks, setDashboardAssignedTasks] = useState([]);
  const [filters, setFilters] = useState({
    assigneeId: "",
    priority: "",
    label: "",
    status: "",
    type: "",
    search: "",
  });
  const [filterDraft, setFilterDraft] = useState({
    sprintId: "",
    priority: "",
    label: "",
    status: "",
    type: "",
  });

  const notify = (text, tone = "success") =>
    tone === "error" ? toast.error(text) : toast.success(text);
  const requestConfirmation = ({ title, message, confirmLabel = "Confirm" }) =>
    new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({
        open: true,
        title,
        message,
        confirmLabel,
      });
    });
  const resolveConfirmation = (confirmed) => {
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    if (confirmResolverRef.current) {
      confirmResolverRef.current(confirmed);
      confirmResolverRef.current = null;
    }
  };

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
  const workflowTransitions = useMemo(() => {
    const transitions = projectSettings?.workflowRules?.transitions;
    return Array.isArray(transitions) ? transitions : [];
  }, [projectSettings?.workflowRules?.transitions]);

  const visibleProjects = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "admin") return projects;
    return projects.filter((project) =>
      (project.members || []).some(
        (member) => String(member.id) === String(currentUser.id),
      ),
    );
  }, [projects, currentUser]);
  const sidebarProjects = useMemo(() => {
    if (!currentUser) return [];
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
  const visibleAssigneeItems = useMemo(
    () => assigneeFilterItems.slice(0, ASSIGNEE_VISIBLE_LIMIT),
    [assigneeFilterItems],
  );
  const overflowAssigneeItems = useMemo(
    () => assigneeFilterItems.slice(ASSIGNEE_VISIBLE_LIMIT),
    [assigneeFilterItems],
  );

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
    if (latestSettingsProjectIdRef.current === String(projectId)) {
      setProjectSettings(settings);
    }
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
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.type) params.set("type", activeFilters.type);
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
    if (String(projectId) !== String(latestProjectIdRef.current)) return;
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
    if (String(projectId) !== String(latestProjectIdRef.current)) return;
    const totals = {};
    (data.columns || []).forEach((column) => {
      totals[column.status] = (column.tasks || []).length;
    });
    setBoardTotalsByStatus(totals);
  };

  const fetchBacklog = async (
    projectId = currentProjectId,
    activeFilters = filters,
    sprintId = selectedSprintId,
  ) => {
    if (!projectId) {
      setBacklogTasks([]);
      return;
    }
    if (sprintId) {
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
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.type) params.set("type", activeFilters.type);
    if (activeFilters.search.trim())
      params.set("search", activeFilters.search.trim());
    const query = params.toString();
    const data = await apiRequest(
      `/task-management/backlog${query ? `?${query}` : ""}`,
    );
    if (String(projectId) !== String(latestProjectIdRef.current)) return;
    setBacklogTasks(data || []);
  };

  const fetchAllTasks = async (
    projectId = currentProjectId,
    activeFilters = filters,
    sprintId = selectedSprintId,
  ) => {
    if (!projectId) {
      setAllTasks([]);
      return;
    }
    const params = new URLSearchParams();
    params.set("projectId", String(projectId));
    if (sprintId) params.set("sprintId", String(sprintId));
    if (activeFilters.assigneeId)
      params.set("assigneeId", activeFilters.assigneeId);
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim())
      params.set("label", activeFilters.label.trim());
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.type) params.set("type", activeFilters.type);
    if (activeFilters.search.trim())
      params.set("search", activeFilters.search.trim());
    const query = params.toString();
    const data = await apiRequest(
      `/task-management/tasks${query ? `?${query}` : ""}`,
    );
    if (String(projectId) !== String(latestProjectIdRef.current)) return;
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
    if (String(projectId) !== String(latestProjectIdRef.current)) return [];
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
      fetchBacklog(projectId, activeFilters, sprintId),
      fetchAllTasks(projectId, activeFilters, sprintId),
    ]);
  };

  const refetchAfterCrud = async ({
    includeBootstrap = false,
    includeProject = false,
    includeDashboard = false,
    projectId = currentProjectId,
  } = {}) => {
    if (includeBootstrap && token) {
      await fetchBootstrap();
    }
    if (includeProject && token && projectId) {
      await Promise.all([
        fetchProjectSettings(projectId).catch(() => setProjectSettings(null)),
        refreshViews(selectedSprintId, projectId, filters),
      ]);
    }
    if (includeDashboard && token && currentUser) {
      await fetchMyAssignedTasks();
    }
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
      latestSettingsProjectIdRef.current = "";
      setProjectSettings(null);
      return;
    }
    latestSettingsProjectIdRef.current = String(currentProjectId);
    setProjectSettings(null);
    fetchProjectSettings(currentProjectId).catch(() =>
      latestSettingsProjectIdRef.current === String(currentProjectId)
        ? setProjectSettings(null)
        : null,
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
  const projectVersions = useMemo(() => {
    const versions = projectSettings?.generalRules?.versions;
    if (!Array.isArray(versions)) return [];
    return [
      ...new Set(
        versions.map((version) => String(version || "").trim()).filter(Boolean),
      ),
    ];
  }, [projectSettings?.generalRules?.versions]);

  useEffect(() => {
    latestProjectIdRef.current = String(currentProjectId || "");
  }, [currentProjectId]);

  useEffect(() => {
    if (!token || loading || !currentProjectId) return;
    if (activeView !== "board") return;
    const boardSprintId = activeSprintId || selectedSprintId;
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
    if (!token || loading || !currentProjectId || activeView !== "backlog")
      return;
    Promise.all([
      fetchSprints(currentProjectId),
      fetchBacklog(currentProjectId, filters, selectedSprintId),
      fetchAllTasks(currentProjectId, filters, selectedSprintId),
    ]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, currentProjectId, filters, loading, selectedSprintId, token]);

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
  }, [currentProjectId, token, loading]);

  useEffect(() => {
    if (!token || loading || activeView !== "dashboard") return;
    fetchMyAssignedTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loading, activeView, currentUser?.id]);

  useEffect(() => {
    if (activeView !== "board" && activeView !== "backlog") return;
    setShowAssigneeOverflow(false);
    setSelectedSprintId("");
    setFilters((prev) => {
      if (
        !prev.assigneeId &&
        !prev.priority &&
        !prev.label &&
        !prev.status &&
        !prev.type
      ) {
        return prev;
      }
      return {
        ...prev,
        assigneeId: "",
        priority: "",
        label: "",
        status: "",
        type: "",
      };
    });
    setFilterDraft((prev) => ({
      ...prev,
      sprintId: "",
      priority: "",
      label: "",
      status: "",
      type: "",
    }));
  }, [activeView]);

  useEffect(() => {
    if (!showFilterModal && !showAssigneeOverflow) return undefined;
    const handleClickOutside = (event) => {
      if (
        showFilterModal &&
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(event.target)
      ) {
        setShowFilterModal(false);
      }
      if (
        showAssigneeOverflow &&
        assigneeOverflowRef.current &&
        !assigneeOverflowRef.current.contains(event.target)
      ) {
        setShowAssigneeOverflow(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFilterModal, showAssigneeOverflow]);

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
    const noActiveSprint = activeView === "board" && !activeSprintId;
    const targetSprintId =
      activeView === "board" ? activeSprintId || null : null;
    await apiRequest("/task-management/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: taskTitle.trim(),
        storyPoints: storyPoints === "" ? null : Number(storyPoints),
        status: "todo",
        priority: taskPriority,
        type: taskType,
        label: taskLabel.trim(),
        version: taskVersion.trim(),
        projectId: currentProjectId,
        assigneeId: assigneeId || null,
        sprintId: targetSprintId,
      }),
    });
    setTaskTitle("");
    setStoryPoints("");
    setAssigneeId("");
    setTaskPriority("medium");
    setTaskType("task");
    setTaskLabel("");
    setTaskVersion("");
    setShowCreateTaskModal(false);
    if (noActiveSprint) {
      notify("No active sprint found. Task was added to the backlog.");
    }
    await refetchAfterCrud({ includeProject: true, includeDashboard: true });
  };

  const moveTask = async (
    taskId,
    status,
    { suppressErrorToast = false } = {},
  ) => {
    try {
      await apiRequest(`/task-management/tasks/${taskId}/move`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refetchAfterCrud({ includeProject: true, includeDashboard: true });
    } catch (error) {
      if (!suppressErrorToast) {
        notify(error?.message || "Failed to move task.", "error");
      }
      throw error;
    }
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
    await refetchAfterCrud({ includeProject: true, includeDashboard: true });
  };

  const addComment = async (taskId, body) => {
    await apiRequest(`/task-management/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    await openTask(taskId);
    await refetchAfterCrud({ includeDashboard: true });
  };
  const updateComment = async (taskId, commentId, body) => {
    await apiRequest(`/task-management/tasks/${taskId}/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    await openTask(taskId);
    await refetchAfterCrud({ includeDashboard: true });
  };
  const deleteComment = async (taskId, commentId) => {
    await apiRequest(`/task-management/tasks/${taskId}/comments/${commentId}`, {
      method: "DELETE",
    });
    await openTask(taskId);
    await refetchAfterCrud({ includeDashboard: true });
  };

  const uploadTaskAsset = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const uploaded = await apiRequest("/task-management/upload", {
      method: "POST",
      body: formData,
    });
    if (!uploaded?.url) {
      throw new Error("Upload completed but file URL is missing.");
    }
    return uploaded;
  };

  const createUser = async (payload) => {
    try {
      await apiRequest("/task-management/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      });
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
      await apiRequest(`/task-management/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      });
      notify("User updated.");
    } catch (error) {
      notify(error.message || "Failed to update user.", "error");
      throw error;
    }
  };

  const deleteUser = async (userId) => {
    const confirmed = await requestConfirmation({
      title: "Delete user",
      message: "Delete this user? ",
      confirmLabel: "Delete user",
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiRequest(`/task-management/users/${userId}`, {
        method: "DELETE",
      });
      await refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      });
      notify("User deleted.");
    } catch (error) {
      notify(error.message || "Failed to delete user.", "error");
      throw error;
    }
  };

  const createUserGroup = async (payload) => {
    try {
      await apiRequest("/task-management/user-groups", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      });
      notify("User group created.");
    } catch (error) {
      notify(error.message || "Failed to create user group.", "error");
      throw error;
    }
  };

  const updateUserGroup = async (groupId, payload) => {
    try {
      await apiRequest(`/task-management/user-groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      });
      notify("User group updated.");
    } catch (error) {
      notify(error.message || "Failed to update user group.", "error");
      throw error;
    }
  };

  const deleteUserGroup = async (groupId) => {
    const confirmed = await requestConfirmation({
      title: "Delete user group",
      message: "Delete this user group? ",
      confirmLabel: "Delete group",
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiRequest(`/task-management/user-groups/${groupId}`, {
        method: "DELETE",
      });
      await refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      });
      notify("User group deleted.");
    } catch (error) {
      notify(error.message || "Failed to delete user group.", "error");
      throw error;
    }
  };

  const createSprint = async (draft) => {
    if (!currentProjectId) return;
    try {
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
      await refetchAfterCrud({ includeProject: true, includeDashboard: true });
      notify("Sprint created.");
      return created;
    } catch (error) {
      notify(error.message || "Failed to create sprint.", "error");
      throw error;
    }
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
    try {
      const created = await apiRequest("/task-management/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setProjects((prev) => [created, ...prev]);
      const id = String(created.id);
      setCurrentProjectId(id);
      setActiveView("settings");
      navigate(`/project/${id}/settings`);
      await refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
        projectId: id,
      });
      notify("Project created.");
      return created;
    } catch (error) {
      notify(error.message || "Failed to create project.", "error");
      throw error;
    }
  };

  const updateProject = async (projectId, draft) => {
    try {
      const updated = await apiRequest(
        `/task-management/projects/${projectId}`,
        {
          method: "PATCH",
          body: JSON.stringify(draft),
        },
      );
      setProjects((prev) =>
        prev.map((project) => (project.id === updated.id ? updated : project)),
      );
      await refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      });
      notify("Project updated.");
      return updated;
    } catch (error) {
      notify(error.message || "Failed to update project.", "error");
      throw error;
    }
  };

  const deleteProject = async (projectId) => {
    const confirmed = await requestConfirmation({
      title: "Delete project",
      message: "Delete this project? ",
      confirmLabel: "Delete project",
    });
    if (!confirmed) {
      return;
    }
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
    await refetchAfterCrud({
      includeBootstrap: true,
      includeProject: true,
      includeDashboard: true,
    });
    notify("Project deleted.");
  };

  const deleteTask = async (taskId) => {
    const confirmed = await requestConfirmation({
      title: "Delete task",
      message: "Delete this task? ",
      confirmLabel: "Delete task",
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiRequest(`/task-management/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (String(taskBundle?.task?.id) === String(taskId)) {
        setTaskBundle(null);
      }
      await refetchAfterCrud({ includeProject: true, includeDashboard: true });
      notify("Task deleted.");
    } catch (error) {
      notify(error.message || "Failed to delete task.", "error");
      throw error;
    }
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
    await refetchAfterCrud({ includeProject: true, includeDashboard: true });
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
    await refetchAfterCrud({
      includeBootstrap: true,
      includeProject: true,
      includeDashboard: true,
    });
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
      await refetchAfterCrud({ includeProject: true, includeDashboard: true });
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
    await refetchAfterCrud({ includeProject: true, includeDashboard: true });
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
    await refetchAfterCrud({ includeProject: true, includeDashboard: true });
  };

  const assignTaskToSprintFromBacklog = async (taskId, sprintId) => {
    try {
      await apiRequest(`/task-management/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ sprintId: sprintId || null }),
      });
      await refetchAfterCrud({ includeProject: true, includeDashboard: true });
      notify("Task moved.");
    } catch (error) {
      notify(error.message || "Failed to move task.", "error");
      throw error;
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
      <div className="min-h-screen bg-[#f7f8fa] text-[#172b4d]">
        <AuthView
          onLogin={login}
          onRegister={register}
          loading={authLoading}
          error={error}
        />
      </div>
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
    <div className="min-h-screen bg-[#f7f8fa] text-[#172b4d]">
      <MainLayout
        currentUser={currentUser}
        onLogout={logout}
        activeView={activeView}
        currentProjectId={currentProjectId}
        projects={sidebarProjects}
        expandedProjectIds={[]}
        onNavigateMain={handleNavigateMain}
        onNavigateProject={handleNavigateProject}
      >
        <div className={activeView === "dashboard" ? undefined : "p-4"}>
          {(activeView === "board" || activeView === "backlog") &&
          currentProjectId ? (
            <section
              className={`mb-3 grid gap-2 rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem] ${activeView === "board" ? "border-[#e2e6ee] bg-white" : ""}`}
            >
              <div className="grid gap-[0.6rem]">
                <div className="flex flex-wrap items-center gap-[0.6rem] max-[1100px]:flex-col max-[1100px]:items-stretch">
                  <div className="flex min-w-[250px] flex-1 basis-[320px] items-center gap-[0.4rem] rounded border border-[#d6dce8] bg-[#f7f8fa] px-2 py-[0.3rem]">
                    <span className="text-[0.95rem] text-[#6b778c]">⌕</span>
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
                  <div
                    className="relative flex flex-wrap items-center gap-[0.3rem]"
                    title="Team members"
                    ref={assigneeOverflowRef}
                  >
                    {visibleAssigneeItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`h-7 w-7 rounded-full border border-[#d6dce8] bg-[#0b6bcb] p-0 text-[0.72rem] font-bold text-white focus:outline-none focus-visible:outline-none ${item.isUnassigned ? "border-[#c7cfde] bg-[#f4f5f7] text-[#5e6c84]" : ""} ${filters.assigneeId === item.id ? "shadow-[0_0_0_2px_#b9d8ff]" : ""}`}
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
                            className="block h-full w-full rounded-full"
                            src={UNASSIGNED_AVATAR_SRC}
                            alt=""
                            aria-hidden="true"
                          />
                        ) : (
                          item.initials
                        )}
                      </button>
                    ))}
                    {overflowAssigneeItems.length ? (
                      <button
                        type="button"
                        className="rounded-full border border-[#c7cfde] bg-[#f4f5f7] px-[0.45rem] py-[0.1rem] text-[0.72rem] font-semibold text-[#42526e] hover:bg-[#e9edf3]"
                        onClick={() => setShowAssigneeOverflow((prev) => !prev)}
                        title="Show more assignees"
                        aria-expanded={showAssigneeOverflow}
                        aria-label={`Show ${overflowAssigneeItems.length} more assignees`}
                      >
                        +{overflowAssigneeItems.length}
                      </button>
                    ) : null}
                    {showAssigneeOverflow && overflowAssigneeItems.length ? (
                      <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 grid max-h-[260px] min-w-[260px] gap-[0.25rem] overflow-auto rounded-[10px] border border-[#d7dce5] bg-white p-[0.4rem] shadow-[0_10px_24px_rgba(9,30,66,0.18)]">
                        {overflowAssigneeItems.map((item) => (
                          <button
                            key={`overflow-${item.id}`}
                            type="button"
                            className={`flex items-center gap-[0.45rem] rounded-[8px] border border-transparent px-[0.4rem] py-[0.35rem] text-left text-[0.82rem] text-[#253858] hover:bg-[#f4f6fa] ${filters.assigneeId === item.id ? "bg-[#ecf3ff] text-[#1d4ed8]" : ""}`}
                            onClick={() => {
                              setFilters((prev) => ({
                                ...prev,
                                assigneeId: prev.assigneeId === item.id ? "" : item.id,
                              }));
                              setShowAssigneeOverflow(false);
                            }}
                            title={item.label}
                          >
                            <span
                              className={`grid h-6 w-6 place-items-center rounded-full border border-[#d6dce8] text-[0.66rem] font-bold ${item.isUnassigned ? "bg-[#f4f5f7] text-[#5e6c84]" : "text-white"}`}
                              style={
                                item.isUnassigned
                                  ? undefined
                                  : { backgroundColor: getUserAvatarColor(item.id) }
                              }
                            >
                              {item.isUnassigned ? (
                                <img
                                  className="block h-full w-full rounded-full"
                                  src={UNASSIGNED_AVATAR_SRC}
                                  alt=""
                                  aria-hidden="true"
                                />
                              ) : (
                                item.initials
                              )}
                            </span>
                            <span className="truncate">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="ml-auto flex justify-end gap-2 max-[1100px]:ml-0">
                    <div className="relative" ref={filterPopoverRef}>
                      <button
                        type="button"
                        className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() => {
                          setFilterDraft({
                            sprintId:
                              activeView === "board"
                                ? ""
                                : selectedSprintId || "",
                            priority: filters.priority,
                            label: filters.label,
                            status: filters.status,
                            type: filters.type,
                          });
                          setShowFilterModal((prev) => !prev);
                        }}
                      >
                        Filter
                      </button>
                      {showFilterModal ? (
                        <div
                          className="absolute right-0 top-[calc(100%+0.45rem)] z-50 w-[min(560px,92vw)] rounded-[12px] border border-[#d7dce5] bg-[#f7f8fa] p-[0.95rem] text-gray-800 shadow-[0_10px_30px_rgba(9,30,66,0.2)]"
                          role="dialog"
                          aria-modal="false"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3>Filter</h3>
                            </div>
                            <button
                              type="button"
                              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                              onClick={() => setShowFilterModal(false)}
                            >
                              X
                            </button>
                          </div>
                          <div className="mt-[0.35rem] grid grid-cols-1 gap-[0.75rem]">
                            {activeView !== "board" ? (
                              <label className="grid gap-[0.32rem] text-[0.9rem] text-[#253858]">
                                Sprint
                                <select
                                  className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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
                            {activeView === "board" ? (
                              <>
                                <label className="grid gap-[0.32rem] text-[0.9rem] text-[#253858]">
                                  Priority
                                  <select
                                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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
                                      <option
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="col-span-1 grid gap-[0.32rem] text-[0.9rem] text-[#253858]">
                                  Label
                                  <select
                                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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
                                <label className="grid gap-[0.32rem] text-[0.9rem] text-[#253858]">
                                  Type
                                  <select
                                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
                                    value={filterDraft.type}
                                    onChange={(event) =>
                                      setFilterDraft((prev) => ({
                                        ...prev,
                                        type: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">Select</option>
                                    {projectTypes.map((type) => (
                                      <option key={type} value={type}>
                                        {type}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </>
                            ) : (
                              <label className="col-span-1 grid gap-[0.32rem] text-[0.9rem] text-[#253858]">
                                Status
                                <select
                                  className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
                                  value={filterDraft.status}
                                  onChange={(event) =>
                                    setFilterDraft((prev) => ({
                                      ...prev,
                                      status: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Select</option>
                                  {workflowStages.map((stage) => (
                                    <option key={stage.key} value={stage.key}>
                                      {stage.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                          <div className="flex justify-end gap-2 border-t border-[#d7dce5] pt-[0.6rem]">
                            <button
                              type="button"
                              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                              onClick={() => {
                                const clearedDraft = {
                                  sprintId: "",
                                  priority: "",
                                  label: "",
                                  status: "",
                                  type: "",
                                };
                                setFilterDraft(clearedDraft);
                                if (activeView !== "board") {
                                  setSelectedSprintId("");
                                }
                                setFilters((prev) => ({
                                  ...prev,
                                  priority: "",
                                  label: "",
                                  status: "",
                                  type: "",
                                }));
                              }}
                            >
                              Reset
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (activeView !== "board") {
                                  setSelectedSprintId(
                                    filterDraft.sprintId || "",
                                  );
                                }
                                setFilters((prev) => ({
                                  ...prev,
                                  priority:
                                    activeView === "board"
                                      ? filterDraft.priority
                                      : "",
                                  label:
                                    activeView === "board"
                                      ? filterDraft.label
                                      : "",
                                  status:
                                    activeView === "board"
                                      ? ""
                                      : filterDraft.status,
                                  type:
                                    activeView === "board"
                                      ? filterDraft.type
                                      : "",
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
          {error ? <p className="my-2 text-red-600">{error}</p> : null}
          {loading ? <p>Loading...</p> : null}
          {activeView === "dashboard" ? (
            <DashboardView
              currentUser={currentUser}
              projects={sidebarProjects}
              assignedTasks={dashboardAssignedTasks}
              projectById={projectById}
              workflowStages={workflowStages}
              canManage={canManage}
              onOpenProject={(id) => handleNavigateProject(id, "board")}
              onOpenTask={openTask}
            />
          ) : null}
          {showCreateTaskModal ? (
            <Modal
              open={showCreateTaskModal}
              onOpenChange={setShowCreateTaskModal}
            >
              <div className="flex items-center justify-between gap-3">
                <h3>Create Task</h3>
                <button
                  type="button"
                  className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                  onClick={() => setShowCreateTaskModal(false)}
                >
                  X
                </button>
              </div>
              <form className="grid gap-[0.6rem]" onSubmit={createTask}>
                <label>
                  <span className="inline-flex items-center">
                    Task title <span className="ml-1 text-red-600">*</span>
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
                  <span className="inline-flex items-center">
                    Work type <span className="ml-1 text-red-600">*</span>
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
                <label>
                  Version
                  <select
                    value={taskVersion}
                    onChange={(event) => setTaskVersion(event.target.value)}
                  >
                    <option value="">None</option>
                    {projectVersions.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                    onClick={() => setShowCreateTaskModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit">Create Task</button>
                </div>
              </form>
            </Modal>
          ) : null}
          {activeView === "backlog" ? (
            <BacklogView
              tasks={selectedSprintId ? [] : backlogTasks}
              sprints={sprints}
              allTasks={allTasks}
              usersById={usersById}
              userAvatarColor={getUserAvatarColor}
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
              onDeleteTask={deleteTask}
              onNotify={notify}
            />
          ) : null}

          {activeView === "board" ? (
            <BoardView
              columns={safeColumns}
              workflowTransitions={workflowTransitions}
              currentUser={currentUser}
              userGroups={userGroups}
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
              onNotify={notify}
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
          currentUserId={currentUser?.id}
            users={users}
            assigneeUsers={projectUsers}
            workflowStages={workflowStages}
            workflowTransitions={workflowTransitions}
            labels={projectLabels}
            versions={projectVersions}
            onClose={() => setTaskBundle(null)}
            onSaveTask={saveTask}
            onAddComment={addComment}
          onUpdateComment={updateComment}
          onDeleteComment={deleteComment}
            onUploadAsset={uploadTaskAsset}
            onNotify={notify}
          />
          {confirmDialog.open ? (
            <Modal
              open={confirmDialog.open}
              cardClassName="max-w-[460px]"
              onOpenChange={(open) => {
                if (!open) resolveConfirmation(false);
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <h3>{confirmDialog.title}</h3>
                <button
                  type="button"
                  className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                  onClick={() => resolveConfirmation(false)}
                >
                  X
                </button>
              </div>
              <div className="grid gap-[0.8rem]">
                <p>{confirmDialog.message}</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                    onClick={() => resolveConfirmation(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                    onClick={() => resolveConfirmation(true)}
                  >
                    {confirmDialog.confirmLabel}
                  </button>
                </div>
              </div>
            </Modal>
          ) : null}
          <ToastContainer
            position="top-right"
            autoClose={1600}
            hideProgressBar
            theme="colored"
          />
        </div>
      </MainLayout>
    </div>
  );
}

export default App;
