import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { useShallow } from "zustand/react/shallow";
import "./bones/registry";
import AuthView from "./components/AuthView";
import BacklogView from "./components/BacklogView";
import BoardView from "./components/BoardView";
import SummaryView from "./components/SummaryView";
import DashboardView from "./components/DashboardView";
import ProjectManagementView from "./components/ProjectManagementView";
import AppSettingsView from "./components/AppSettingsView";
import SystemSettingsView from "./components/SystemSettingsView";
import TaskDrawer from "./components/TaskDrawer";
import UserAdminView from "./components/UserAdminView";
import ProfileView from "./components/ProfileView";
import MainLayout from "./components/Layout/MainLayout";
import Icon from "./components/ui/Icon";
import Modal from "./components/ui/Modal";
import {
  apiRequest,
  buildApiUrl,
  getAuthToken,
  setStoredToken,
} from "./api/client";
import { PRIORITY_OPTIONS } from "./constants/priorities.js";
import { UNASSIGNED_AVATAR_SRC } from "./constants/unassignedAvatar.js";
import {
  DEFAULT_WORK_TYPE_VALUES,
  getWorkTypeMeta,
} from "./constants/workTypes.js";
import { DEFAULT_WORKFLOW_STAGES } from "./workflowDefaults.js";
import { useAppStore } from "./store/appStore";
import { buildNotificationPath } from "./utils/notificationLinks";
import { buildLabelColorMap, normalizeLabelDefinitions } from "./utils/labels.js";
import {
  REQUIRED_FIELD_MESSAGE,
  invalidFieldClassName,
} from "./utils/formValidation.js";

const PROJECT_ROUTE = /^\/project\/([^/]+)\/(board|backlog|summary|settings)$/;
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
const swalToast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 2400,
  timerProgressBar: true,
});

function getUserAvatarColor(userId) {
  const value = String(userId || "");
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return USER_AVATAR_COLORS[Math.abs(hash) % USER_AVATAR_COLORS.length];
}

function toMentionToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseRoute(pathname) {
  const normalized = (pathname || "").replace(/\/+$/, "");
  const path = normalized || "/";

  if (path === "/" || path === "/dashboard") {
    return { view: "dashboard", projectId: null };
  }
  if (path === "/users") return { view: "users", projectId: null };
  if (path === "/profile") {
    return { view: "profile", projectId: null };
  }
  if (path === "/reset-password") {
    return { view: "reset-password", projectId: null };
  }
  if (path === "/__boneyard") {
    return { view: "__boneyard", projectId: null };
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

function initialActiveView(pathname) {
  const p = parseRoute(pathname);
  if (p.view === "_legacy" || p.unknown || p.view === "__boneyard")
    return "dashboard";
  if (
    p.view === "board" ||
    p.view === "backlog" ||
    p.view === "summary" ||
    p.view === "settings"
  )
    return p.view;
  return p.view;
}

function BoneyardCapturePage() {
  const mockUsersById = new Map([["1", "Demo User"], ["2", "Alex Morgan"]]);
  const mockNoop = async () => {};
  return (
    <main className="grid gap-4 bg-[#f7f8fa] p-4">
      <BacklogView
        tasks={[
          {
            id: "t1",
            title: "Prepare skeleton capture seed",
            status: "todo",
            sprintId: null,
            priority: "Medium",
            storyPoints: 3,
            assigneeId: "1",
            projectKey: "DEMO",
            projectCode: "DEMO",
            projectId: "p1",
          },
        ]}
        sprints={[]}
        allTasks={[
          {
            id: "t1",
            title: "Prepare skeleton capture seed",
            status: "todo",
            sprintId: null,
            priority: "Medium",
            storyPoints: 3,
            assigneeId: "1",
            projectKey: "DEMO",
            projectCode: "DEMO",
            projectId: "p1",
          },
        ]}
        rowsData={null}
        usersById={mockUsersById}
        userAvatarColor={() => "#2d64d9"}
        workflowStages={DEFAULT_WORKFLOW_STAGES}
        selectedSprintId={null}
        onSelectSprint={() => {}}
        canManage
        onStartSprint={mockNoop}
        onCompleteSprint={mockNoop}
        onDeleteSprint={mockNoop}
        onAssignTaskToSprint={mockNoop}
        onCreateSprint={mockNoop}
        onAddTask={() => {}}
        onOpenTask={() => {}}
        onDeleteTask={mockNoop}
        onNotify={() => {}}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
        isLoading={false}
      />
      <ProjectManagementView
        projects={[
          {
            id: "p1",
            name: "Demo Project",
            projectKey: "DEMO",
            description: "Fixture project for boneyard capture.",
            members: [
              { id: "1", name: "Demo User", isProjectAdmin: true },
              { id: "2", name: "Alex Morgan", isProjectAdmin: false },
            ],
          },
        ]}
        isLoading={false}
        canManageOrganization
        canOpenProjectSettings={() => true}
        onCreateProject={mockNoop}
        onUpdateProject={mockNoop}
        onDeleteProject={mockNoop}
        onConfigureProject={() => {}}
        onNotify={() => {}}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
      />
      <AppSettingsView canManage onNotify={() => {}} />
      <SummaryView
        projectId="p1"
        sprints={[]}
        onFetchOverview={async () => ({
          kpis: {
            totalTasks: 12,
            completedTasks: 7,
            overdueTasks: 1,
            completionRate: 58.3,
            avgOpenAgeDays: 4.2,
            totalStoryPoints: 36,
            completedStoryPoints: 20,
          },
          statusDistribution: [
            { label: "To Do", value: 5 },
            { label: "In Progress", value: 4 },
            { label: "Done", value: 3 },
          ],
          priorityDistribution: [
            { label: "Low", value: 2 },
            { label: "Medium", value: 6 },
            { label: "High", value: 4 },
          ],
          typeDistribution: [
            { label: "Feature", value: 6 },
            { label: "Bug", value: 3 },
            { label: "Task", value: 3 },
          ],
        })}
        onFetchSprint={async () => ({
          velocityTrend: [
            { label: "Sprint 1", value: 8 },
            { label: "Sprint 2", value: 10 },
            { label: "Sprint 3", value: 12 },
          ],
        })}
        onFetchFlow={async () => ({
          throughput: [
            { label: "Week 1", value: 4 },
            { label: "Week 2", value: 5 },
            { label: "Week 3", value: 3 },
          ],
        })}
        onFetchWorkload={async () => ({
          assigneeLoad: [
            { label: "Demo User", value: 5 },
            { label: "Alex Morgan", value: 4 },
          ],
        })}
        onExportReport={() => {}}
      />
    </main>
  );
}

function App() {
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [createTaskFieldErrors, setCreateTaskFieldErrors] = useState({});
  const [createTaskSprintId, setCreateTaskSprintId] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const {
    token,
    setToken,
    authLoading,
    setAuthLoading,
    currentUser,
    setCurrentUser,
    users,
    setUsers,
    userGroups,
    setUserGroups,
    sprints,
    setSprints,
    projects,
    setProjects,
    projectSettings,
    setProjectSettings,
    columns,
    setColumns,
    boardTotalsByStatus,
    setBoardTotalsByStatus,
    backlogTasks,
    setBacklogTasks,
    allTasks,
    setAllTasks,
    setSprintTasks,
    selectedSprintId,
    setSelectedSprintId,
    currentProjectId,
    setCurrentProjectId,
    loading,
    setLoading,
    error,
    setError,
    taskTitle,
    setTaskTitle,
    storyPoints,
    setStoryPoints,
    taskDueDate,
    setTaskDueDate,
    assigneeId,
    setAssigneeId,
    taskPriority,
    setTaskPriority,
    taskType,
    setTaskType,
    taskLabel,
    setTaskLabel,
    taskVersion,
    setTaskVersion,
    showCreateTaskModal,
    setShowCreateTaskModal,
    showFilterModal,
    setShowFilterModal,
    showAssigneeOverflow,
    setShowAssigneeOverflow,
    taskBundle,
    setTaskBundle,
    activeView,
    setActiveView,
    dashboardAssignedTasks,
    setDashboardAssignedTasks,
    filters,
    setFilters,
    filterDraft,
    setFilterDraft,
    notifications,
    setNotifications,
    unreadCount,
    setUnreadCount,
    notificationCenterOpen,
    setNotificationCenterOpen,
    setNotificationStreamConnected,
    setNotificationStreamError,
    authMode,
    setAuthMode,
    setResetPasswordForm,
  } = useAppStore(
    useShallow((state) => ({
      token: state.token,
      setToken: state.setToken,
      authLoading: state.authLoading,
      setAuthLoading: state.setAuthLoading,
      currentUser: state.currentUser,
      setCurrentUser: state.setCurrentUser,
      users: state.users,
      setUsers: state.setUsers,
      userGroups: state.userGroups,
      setUserGroups: state.setUserGroups,
      sprints: state.sprints,
      setSprints: state.setSprints,
      projects: state.projects,
      setProjects: state.setProjects,
      projectSettings: state.projectSettings,
      setProjectSettings: state.setProjectSettings,
      columns: state.columns,
      setColumns: state.setColumns,
      boardTotalsByStatus: state.boardTotalsByStatus,
      setBoardTotalsByStatus: state.setBoardTotalsByStatus,
      backlogTasks: state.backlogTasks,
      setBacklogTasks: state.setBacklogTasks,
      allTasks: state.allTasks,
      setAllTasks: state.setAllTasks,
      setSprintTasks: state.setSprintTasks,
      selectedSprintId: state.selectedSprintId,
      setSelectedSprintId: state.setSelectedSprintId,
      currentProjectId: state.currentProjectId,
      setCurrentProjectId: state.setCurrentProjectId,
      loading: state.loading,
      setLoading: state.setLoading,
      error: state.error,
      setError: state.setError,
      taskTitle: state.taskTitle,
      setTaskTitle: state.setTaskTitle,
      storyPoints: state.storyPoints,
      setStoryPoints: state.setStoryPoints,
      taskDueDate: state.taskDueDate,
      setTaskDueDate: state.setTaskDueDate,
      assigneeId: state.assigneeId,
      setAssigneeId: state.setAssigneeId,
      taskPriority: state.taskPriority,
      setTaskPriority: state.setTaskPriority,
      taskType: state.taskType,
      setTaskType: state.setTaskType,
      taskLabel: state.taskLabel,
      setTaskLabel: state.setTaskLabel,
      taskVersion: state.taskVersion,
      setTaskVersion: state.setTaskVersion,
      showCreateTaskModal: state.showCreateTaskModal,
      setShowCreateTaskModal: state.setShowCreateTaskModal,
      showFilterModal: state.showFilterModal,
      setShowFilterModal: state.setShowFilterModal,
      showAssigneeOverflow: state.showAssigneeOverflow,
      setShowAssigneeOverflow: state.setShowAssigneeOverflow,
      taskBundle: state.taskBundle,
      setTaskBundle: state.setTaskBundle,
      activeView: state.activeView,
      setActiveView: state.setActiveView,
      dashboardAssignedTasks: state.dashboardAssignedTasks,
      setDashboardAssignedTasks: state.setDashboardAssignedTasks,
      filters: state.filters,
      setFilters: state.setFilters,
      filterDraft: state.filterDraft,
      setFilterDraft: state.setFilterDraft,
      notifications: state.notifications,
      setNotifications: state.setNotifications,
      unreadCount: state.unreadCount,
      setUnreadCount: state.setUnreadCount,
      notificationCenterOpen: state.notificationCenterOpen,
      setNotificationCenterOpen: state.setNotificationCenterOpen,
      setNotificationStreamConnected: state.setNotificationStreamConnected,
      setNotificationStreamError: state.setNotificationStreamError,
      authMode: state.authMode,
      setAuthMode: state.setAuthMode,
      setResetPasswordForm: state.setResetPasswordForm,
    })),
  );
  const filterPopoverRef = useRef(null);
  const assigneeOverflowRef = useRef(null);
  const createTaskDescriptionRef = useRef(null);
  const latestSettingsProjectIdRef = useRef("");
  const latestProjectIdRef = useRef("");
  const boardRequestSeqRef = useRef(0);
  const backlogRequestSeqRef = useRef(0);
  const allTasksRequestSeqRef = useRef(0);
  const sprintsRequestSeqRef = useRef(0);
  const lastReadinessBlockRef = useRef("");
  const notificationStreamRef = useRef(null);
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const [dashboardData, setDashboardData] = useState(null);
  const [projectsPageItems, setProjectsPageItems] = useState([]);
  const [projectsNextCursor, setProjectsNextCursor] = useState("");
  const [projectsHasMore, setProjectsHasMore] = useState(false);
  const [projectsLoadingMore, setProjectsLoadingMore] = useState(false);
  const [usersPageItems, setUsersPageItems] = useState([]);
  const [usersNextCursor, setUsersNextCursor] = useState("");
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [showDisabledUsersFilter, setShowDisabledUsersFilter] = useState(false);
  const [boardNextCursor, setBoardNextCursor] = useState("");
  const [boardHasMore, setBoardHasMore] = useState(false);
  const [boardLoadingMore, setBoardLoadingMore] = useState(false);
  const [backlogNextCursor, setBacklogNextCursor] = useState("");
  const [backlogHasMore, setBacklogHasMore] = useState(false);
  const [backlogLoadingMore, setBacklogLoadingMore] = useState(false);
  const [backlogRowsData, setBacklogRowsData] = useState([]);
  const [taskDrawerProjectSettings, setTaskDrawerProjectSettings] = useState(null);
  const [projectNameHintById, setProjectNameHintById] = useState({});
  const [activeSprintNameHintByProjectId, setActiveSprintNameHintByProjectId] =
    useState({});
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedFilters(filters);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filters]);
  useEffect(() => {
    setActiveView((current) =>
      current === "dashboard" ? initialActiveView(location.pathname) : current,
    );
  }, [location.pathname, setActiveView]);

  const notify = useCallback(
    (text, tone = "success") => {
      const icon = tone === "error" ? "error" : "success";
      swalToast.fire({
        icon,
        title: String(text || "").trim() || "Notification",
      });
    },
    [],
  );
  const requestConfirmation = useCallback(
    async ({ title, message, confirmLabel = "Confirm" }) => {
      const result = await Swal.fire({
        title: String(title || "").trim() || "Please confirm",
        text: String(message || "").trim(),
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: String(confirmLabel || "").trim() || "Confirm",
        cancelButtonText: "Cancel",
        reverseButtons: true,
        focusCancel: true,
      });
      return result.isConfirmed === true;
    },
    [],
  );

  const loadNotifications = useCallback(async () => {
    try {
      const [list, unread] = await Promise.all([
        apiRequest("/notifications?limit=40"),
        apiRequest("/notifications/unread-count"),
      ]);
      setNotifications(Array.isArray(list) ? list : []);
      setUnreadCount(Number(unread?.unreadCount || 0));
    } catch {
      // Notification center is optional; avoid blocking app on failures.
    }
  }, [setNotifications, setUnreadCount]);

  const registerPushNotifications = useCallback(async () => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      typeof Notification === "undefined"
    ) {
      return;
    }
    const vapidPublicKey = String(
      import.meta.env.VITE_PUSH_PUBLIC_KEY || "",
    ).trim();
    if (!vapidPublicKey) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const registration = await navigator.serviceWorker.register("/sw.js");
    const existing = await registration.pushManager.getSubscription();
    const base64ToUint8Array = (base64String) => {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const raw = window.atob(base64);
      return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
    };
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(vapidPublicKey),
      }));
    await apiRequest("/notifications/push-subscriptions", {
      method: "POST",
      body: JSON.stringify({ subscription }),
    });
  }, []);

  const unregisterPushNotifications = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = String(subscription.endpoint || "");
    if (endpoint) {
      await apiRequest("/notifications/push-subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    await subscription.unsubscribe().catch(() => {});
  }, []);

  const handleToggleNotificationCenter = useCallback(() => {
    setNotificationCenterOpen((open) => !open);
    registerPushNotifications().catch(() => {});
  }, [registerPushNotifications, setNotificationCenterOpen]);

  const openTask = useCallback(
    async (taskId) => {
      const bundle = await apiRequest(`/task-management/tasks/${taskId}`);
      setTaskBundle(bundle);
    },
    [setTaskBundle],
  );

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((user) => map.set(user.id, user.name));
    return map;
  }, [users]);
  const activeSprintId = useMemo(() => {
    const activeSprint = sprints.find((sprint) => sprint.status === "active");
    return activeSprint ? String(activeSprint.id) : "";
  }, [sprints]);
  const activeSprintName = useMemo(() => {
    const activeSprint = sprints.find((sprint) => sprint.status === "active");
    return String(activeSprint?.name || "");
  }, [sprints]);
  useEffect(() => {
    if (!currentProjectId) return;
    const project = projects.find(
      (item) => String(item.id) === String(currentProjectId),
    );
    if (project?.name) {
      setProjectNameHintById((prev) => ({
        ...prev,
        [String(currentProjectId)]: String(project.name),
      }));
    }
  }, [projects, currentProjectId]);
  useEffect(() => {
    if (!currentProjectId || !activeSprintName) return;
    setActiveSprintNameHintByProjectId((prev) => ({
      ...prev,
      [String(currentProjectId)]: String(activeSprintName),
    }));
  }, [currentProjectId, activeSprintName]);
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
  const createTaskDefaultStatus = useMemo(() => {
    const stageKeys = new Set(
      (workflowStages || []).map((stage) => String(stage?.key || "").trim()),
    );
    if (stageKeys.has("to_do")) return "to_do";
    if (stageKeys.has("todo")) return "todo";
    return "to_do";
  }, [workflowStages]);

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
    return projects
      .filter((project) =>
        (project.members || []).some(
          (member) => String(member.id) === String(currentUser.id),
        ),
      )
      .sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
          sensitivity: "base",
        }),
      );
  }, [projects, currentUser]);
  const displayProjects =
    activeView === "projects" && projectsPageItems.length
      ? projectsPageItems
      : visibleProjects;
  const displayUsers =
    activeView === "users" ? usersPageItems : users;

  const projectById = useMemo(() => {
    const map = new Map();
    projects.forEach((p) => map.set(String(p.id), p));
    return map;
  }, [projects]);
  const isOrgAdmin = currentUser?.role === "admin";
  const userManagesProject = useCallback(
    (projectId) => {
      const id = String(projectId || "");
      if (!currentUser || !id) return false;
      if (currentUser.role === "admin") return true;
      return (projectById.get(id)?.members || []).some(
        (m) =>
          String(m.id) === String(currentUser.id) && Boolean(m.isProjectAdmin),
      );
    },
    [currentUser, projectById],
  );
  const canManageProject = userManagesProject(currentProjectId);
  const evaluateProjectReadiness = useCallback(
    async (projectId) => {
      const id = String(projectId || "").trim();
      if (!id) {
        return {
          ready: false,
          missing: ["users", "board", "workflow", "integration"],
        };
      }
      const missing = [];
      const project = projectById.get(id);
      const memberCount = Array.isArray(project?.members)
        ? project.members.length
        : 0;
      if (memberCount < 1) {
        missing.push("users");
      }

      const settings =
        id === String(currentProjectId || "") && projectSettings
          ? projectSettings
          : await apiRequest(
              `/task-management/projects/${encodeURIComponent(id)}/settings`,
            );
      const stages = settings?.boardCardFields?.workflowStages;
      if (!Array.isArray(stages) || stages.length < 1) {
        missing.push("board");
      }
      const transitions = settings?.workflowRules?.transitions;
      if (!Array.isArray(transitions) || transitions.length < 1) {
        missing.push("workflow");
      }

      let integrationReady = false;
      try {
        const repos = await apiRequest(
          `/github/projects/${encodeURIComponent(id)}/repos`,
        );
        const hasRepo = Array.isArray(repos) && repos.length > 0;
        if (currentUser?.role === "admin") {
          const appGitHub = await apiRequest(
            "/task-management/app-settings/github",
          );
          const hasOrg = Boolean(String(appGitHub?.githubOrg || "").trim());
          const hasToken = Boolean(appGitHub?.hasGithubToken);
          integrationReady = hasRepo && hasOrg && hasToken;
        } else {
          integrationReady = hasRepo;
        }
      } catch {
        integrationReady = false;
      }
      if (!integrationReady) {
        missing.push("integration");
      }

      return {
        ready: missing.length === 0,
        missing,
      };
    },
    [projectById, currentProjectId, projectSettings, currentUser?.role],
  );
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
  const projectMentionCandidates = useMemo(() => {
    const projectMemberIds = new Set(
      projectUsers.map((user) => String(user.id)),
    );
    const userCandidates = projectUsers.map((user) => ({
      id: `user-${user.id}`,
      type: "user",
      name: user.name,
      email: user.email || "",
      mentionToken: toMentionToken(user.name || user.email || ""),
      sortLabel: String(user.name || "").toLowerCase(),
    }));
    const groupCandidates = (userGroups || [])
      .filter((group) => {
        const members = Array.isArray(group?.members) ? group.members : [];
        if (!members.length) return false;
        return members.every((member) =>
          projectMemberIds.has(String(member.id)),
        );
      })
      .map((group) => ({
        id: `group-${group.id}`,
        type: "group",
        name: group.name,
        email: "",
        mentionToken: toMentionToken(group.name),
        sortLabel: String(group.name || "").toLowerCase(),
      }));
    return [...userCandidates, ...groupCandidates].sort((a, b) =>
      a.sortLabel.localeCompare(b.sortLabel),
    );
  }, [projectUsers, userGroups]);
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
    () => {
      const base = assigneeFilterItems.slice(0, ASSIGNEE_VISIBLE_LIMIT);
      const selectedIds = Array.isArray(filters.assigneeIds)
        ? filters.assigneeIds
        : [];
      if (!selectedIds.length) return base;
      const selectedSet = new Set(selectedIds.map((id) => String(id)));
      const extras = assigneeFilterItems.filter(
        (item) =>
          selectedSet.has(String(item.id)) &&
          !base.some((baseItem) => String(baseItem.id) === String(item.id)),
      );
      return [...base, ...extras];
    },
    [assigneeFilterItems, filters.assigneeIds],
  );
  const overflowAssigneeItems = useMemo(
    () => {
      const base = assigneeFilterItems.slice(ASSIGNEE_VISIBLE_LIMIT);
      const selectedIds = Array.isArray(filters.assigneeIds)
        ? filters.assigneeIds
        : [];
      if (!selectedIds.length) return base;
      const selectedSet = new Set(selectedIds.map((id) => String(id)));
      return base.filter((item) => !selectedSet.has(String(item.id)));
    },
    [assigneeFilterItems, filters.assigneeIds],
  );
  const selectedAssigneeIds = useMemo(
    () => (Array.isArray(filters.assigneeIds) ? filters.assigneeIds : []),
    [filters.assigneeIds],
  );
  const isAssigneeFilterSelected = useCallback(
    (id) => selectedAssigneeIds.includes(String(id)),
    [selectedAssigneeIds],
  );
  const toggleAssigneeFilter = useCallback((id) => {
    const normalizedId = String(id);
    setFilters((prev) => {
      const existing = Array.isArray(prev.assigneeIds) ? prev.assigneeIds : [];
      const next = existing.includes(normalizedId)
        ? existing.filter((item) => item !== normalizedId)
        : [...existing, normalizedId];
      return {
        ...prev,
        assigneeIds: next,
        // Keep legacy field in sync for compatibility.
        assigneeId: next[0] || "",
      };
    });
  }, [setFilters]);

  const fetchMyAssignedTasks = async () => {
    if (!token || !currentUser) return;
    try {
      const data = await apiRequest("/task-management/dashboard");
      setDashboardData(data || null);
      setDashboardAssignedTasks(data?.assignedTasks || []);
    } catch {
      setDashboardData(null);
      setDashboardAssignedTasks([]);
    }
  };

  const refreshProjectsList = useCallback(async () => {
    if (!token) return;
    try {
      const nextProjects = await apiRequest("/task-management/projects");
      setProjects(Array.isArray(nextProjects) ? nextProjects : []);
    } catch {
      // Keep current projects list when refresh fails.
    }
  }, [token, setProjects]);

  const fetchBootstrap = async () => {
    setLoading(true);
    setError("");
    const dashboardPromise = apiRequest("/task-management/dashboard")
      .then((dashboard) => {
        setDashboardData(dashboard || null);
        setDashboardAssignedTasks(dashboard?.assignedTasks || []);
      })
      .catch(() => {
        setDashboardData(null);
        setDashboardAssignedTasks([]);
      });
    try {
      const data = await apiRequest("/task-management/bootstrap");
      setCurrentUser(data.currentUser);
      setUsers(data.users || []);
      setProjects(data.projects || []);
      setUserGroups(data.userGroups || []);
    } catch (err) {
      setError(err.message || "Failed to load bootstrap");
    } finally {
      // Do not block first paint on dashboard payload.
      dashboardPromise.catch(() => {});
      setLoading(false);
    }
  };

  const fetchProjectsPage = useCallback(
    async ({ reset = false } = {}) => {
      if (!token) return;
      const nextCursor = reset ? "" : projectsNextCursor;
      if (!reset && (!projectsHasMore || projectsLoadingMore)) return;
      setProjectsLoadingMore(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (nextCursor) params.set("cursor", nextCursor);
        const page = await apiRequest(
          `/task-management/projects/paged?${params.toString()}`,
        );
        const incoming = Array.isArray(page?.items) ? page.items : [];
        setProjectsPageItems((prev) => (reset ? incoming : [...prev, ...incoming]));
        setProjectsNextCursor(String(page?.nextCursor || ""));
        setProjectsHasMore(Boolean(page?.hasMore));
      } finally {
        setProjectsLoadingMore(false);
      }
    },
    [token, projectsNextCursor, projectsHasMore, projectsLoadingMore],
  );

  const fetchUsersPage = useCallback(
    async ({ reset = false } = {}) => {
      if (!token) return;
      const nextCursor = reset ? "" : usersNextCursor;
      if (!reset && (!usersHasMore || usersLoadingMore)) return;
      setUsersLoadingMore(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "25");
        if (nextCursor) params.set("cursor", nextCursor);
        params.set("isActive", showDisabledUsersFilter ? "false" : "true");
        const page = await apiRequest(
          `/task-management/users/paged?${params.toString()}`,
        );
        const incoming = Array.isArray(page?.items) ? page.items : [];
        setUsersPageItems((prev) => (reset ? incoming : [...prev, ...incoming]));
        setUsersNextCursor(String(page?.nextCursor || ""));
        setUsersHasMore(Boolean(page?.hasMore));
      } finally {
        setUsersLoadingMore(false);
      }
    },
    [token, usersNextCursor, usersHasMore, usersLoadingMore, showDisabledUsersFilter],
  );

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
    activeFilters = debouncedFilters,
  ) => {
    const params = new URLSearchParams();
    params.set("sprintId", sprintId ? String(sprintId) : "backlog");
    if (projectId) params.set("projectId", String(projectId));
    const selectedAssignees = Array.isArray(activeFilters.assigneeIds)
      ? activeFilters.assigneeIds
      : [];
    if (selectedAssignees.length)
      params.set("assigneeIds", selectedAssignees.join(","));
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
    activeFilters = debouncedFilters,
    options = {},
  ) => {
    if (!projectId) {
      setColumns([]);
      return;
    }
    const requestSeq = ++boardRequestSeqRef.current;
    const { append = false, cursor = "", fast = false } = options;
    const params = new URLSearchParams(
      buildTaskQuery(sprintId, projectId, activeFilters).slice(1),
    );
    params.set("limit", "40");
    if (cursor) params.set("cursor", cursor);
    if (fast) params.set("fast", "1");
    const data = await apiRequest(`/task-management/board/paged?${params.toString()}`);
    if (requestSeq !== boardRequestSeqRef.current) return;
    if (String(projectId) !== String(latestProjectIdRef.current)) return;
    const incomingColumns = Array.isArray(data?.columns) ? data.columns : [];
    setColumns((prev) => {
      if (!append) return incomingColumns;
      const byStatus = new Map(prev.map((column) => [column.status, column]));
      incomingColumns.forEach((column) => {
        const existing = byStatus.get(column.status);
        if (!existing) {
          byStatus.set(column.status, column);
          return;
        }
        byStatus.set(column.status, {
          ...existing,
          ...column,
          tasks: [...(existing.tasks || []), ...(column.tasks || [])],
        });
      });
      return Array.from(byStatus.values());
    });
    if (data?.totalsByStatus && typeof data.totalsByStatus === "object") {
      setBoardTotalsByStatus(data.totalsByStatus);
    } else if (!append) {
      const nextTotals = {};
      incomingColumns.forEach((column) => {
        nextTotals[column.status] = (column.tasks || []).length;
      });
      setBoardTotalsByStatus(nextTotals);
    }
    setBoardNextCursor(String(data?.nextCursor || ""));
    setBoardHasMore(Boolean(data?.hasMore));
    if (data?.activeSprintName) {
      setActiveSprintNameHintByProjectId((prev) => ({
        ...prev,
        [String(projectId)]: String(data.activeSprintName),
      }));
    }
    return data;
  };

  const fetchBacklog = async (
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
    sprintId = selectedSprintId,
    options = {},
  ) => {
    if (!projectId) {
      setBacklogTasks([]);
      return;
    }
    if (sprintId) {
      setBacklogTasks([]);
      return;
    }
    const requestSeq = ++backlogRequestSeqRef.current;
    const params = new URLSearchParams();
    params.set("projectId", String(projectId));
    const selectedAssignees = Array.isArray(activeFilters.assigneeIds)
      ? activeFilters.assigneeIds
      : [];
    if (selectedAssignees.length)
      params.set("assigneeIds", selectedAssignees.join(","));
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim())
      params.set("label", activeFilters.label.trim());
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.type) params.set("type", activeFilters.type);
    if (activeFilters.search.trim())
      params.set("search", activeFilters.search.trim());
    const { append = false, cursor = "" } = options;
    params.set("limit", "40");
    if (cursor) params.set("cursor", cursor);
    const data = await apiRequest(`/task-management/backlog/paged?${params.toString()}`);
    if (requestSeq !== backlogRequestSeqRef.current) return;
    if (String(projectId) !== String(latestProjectIdRef.current)) return;
    const incoming = Array.isArray(data?.items) ? data.items : [];
    setBacklogTasks((prev) => (append ? [...prev, ...incoming] : incoming));
    setBacklogNextCursor(String(data?.nextCursor || ""));
    setBacklogHasMore(Boolean(data?.hasMore));
  };
  const fetchBacklogRows = async (
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
    sprintId = selectedSprintId,
  ) => {
    if (!projectId) {
      setBacklogRowsData([]);
      return [];
    }
    const params = new URLSearchParams();
    params.set("projectId", String(projectId));
    if (sprintId) params.set("selectedSprintId", String(sprintId));
    const selectedAssignees = Array.isArray(activeFilters.assigneeIds)
      ? activeFilters.assigneeIds
      : [];
    if (selectedAssignees.length)
      params.set("assigneeIds", selectedAssignees.join(","));
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim()) params.set("label", activeFilters.label.trim());
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.type) params.set("type", activeFilters.type);
    if (activeFilters.search.trim()) params.set("search", activeFilters.search.trim());
    const data = await apiRequest(`/task-management/backlog/rows?${params.toString()}`);
    const rows = Array.isArray(data) ? data : [];
    setBacklogRowsData(rows);
    return rows;
  };

  const fetchAllTasks = async (
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
    sprintId = selectedSprintId,
    options = {},
  ) => {
    if (!projectId) {
      setAllTasks([]);
      return;
    }
    const requestSeq = ++allTasksRequestSeqRef.current;
    const params = new URLSearchParams();
    params.set("projectId", String(projectId));
    const { backlogScope = false } = options;
    if (sprintId) params.set("sprintId", String(sprintId));
    if (!sprintId && backlogScope) {
      params.set("backlogScope", "true");
    }
    if (backlogScope && sprintId) {
      params.set("includeSprintId", String(sprintId));
    }
    const selectedAssignees = Array.isArray(activeFilters.assigneeIds)
      ? activeFilters.assigneeIds
      : [];
    if (selectedAssignees.length)
      params.set("assigneeIds", selectedAssignees.join(","));
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
    if (requestSeq !== allTasksRequestSeqRef.current) return;
    if (String(projectId) !== String(latestProjectIdRef.current)) return;
    setAllTasks(data || []);
  };

  const fetchSprints = async (projectId = currentProjectId) => {
    if (!projectId) {
      setSprints([]);
      return [];
    }
    const requestSeq = ++sprintsRequestSeqRef.current;
    const data = await apiRequest(
      `/task-management/sprints?projectId=${encodeURIComponent(projectId)}`,
    );
    if (requestSeq !== sprintsRequestSeqRef.current) return [];
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

  const fetchSummaryOverview = useCallback(
    async (projectId, fromDate, toDate) => {
      const params = new URLSearchParams();
      params.set("projectId", String(projectId));
      if (fromDate) params.set("from", String(fromDate));
      if (toDate) params.set("to", String(toDate));
      return apiRequest(
        `/task-management/analytics/overview?${params.toString()}`,
      );
    },
    [],
  );

  const fetchSummarySprint = useCallback(
    async (projectId, fromDate, toDate) => {
      const params = new URLSearchParams();
      params.set("projectId", String(projectId));
      if (fromDate) params.set("from", String(fromDate));
      if (toDate) params.set("to", String(toDate));
      return apiRequest(
        `/task-management/analytics/sprint?${params.toString()}`,
      );
    },
    [],
  );

  const fetchSummaryFlow = useCallback(
    async (projectId, fromDate, toDate, interval = "week") => {
      const params = new URLSearchParams();
      params.set("projectId", String(projectId));
      params.set("interval", interval);
      if (fromDate) params.set("from", String(fromDate));
      if (toDate) params.set("to", String(toDate));
      return apiRequest(`/task-management/analytics/flow?${params.toString()}`);
    },
    [],
  );

  const fetchSummaryWorkload = useCallback(
    async (projectId, fromDate, toDate) => {
      const params = new URLSearchParams();
      params.set("projectId", String(projectId));
      if (fromDate) params.set("from", String(fromDate));
      if (toDate) params.set("to", String(toDate));
      return apiRequest(
        `/task-management/analytics/workload?${params.toString()}`,
      );
    },
    [],
  );

  const exportSummaryReport = useCallback(
    async (type, projectId, fromDate, toDate) => {
      const params = new URLSearchParams();
      params.set("projectId", String(projectId));
      params.set("type", String(type || "overview"));
      if (fromDate) params.set("from", String(fromDate));
      if (toDate) params.set("to", String(toDate));
      const response = await fetch(
        buildApiUrl(`/task-management/reports/export?${params.toString()}`),
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to export report.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const contentDisposition =
        response.headers.get("content-disposition") || "";
      const reportType = String(type || "overview");
      const fallbackName = `summary-${reportType}.xlsx`;
      const matched =
        contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ||
        contentDisposition.match(/filename="?([^"]+)"?/i);
      const filename = matched?.[1]
        ? decodeURIComponent(matched[1])
        : fallbackName;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      notify("Report downloaded.");
    },
    [notify, token],
  );

  const refreshViews = async (
    sprintId = selectedSprintId,
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
  ) => {
    if (!projectId) {
      setColumns([]);
      setBoardTotalsByStatus({});
      setBacklogTasks([]);
      setBacklogRowsData([]);
      setAllTasks([]);
      setSprints([]);
      setSprintTasks([]);
      return;
    }
    const currentActiveSprintId =
      String(
        (Array.isArray(sprints)
          ? sprints.find((sprint) => sprint.status === "active")?.id
          : "") || "",
      ) || "";
    const shouldFetchBoard = activeView === "board";
    const shouldFetchBacklog = activeView === "backlog";
    // Full task snapshot is only needed for backlog grouping/metrics.
    const shouldFetchAllTasks = activeView === "backlog";
    const shouldResolveSprintsNow = !shouldFetchBoard;
    const optimisticBoardSprintId =
      shouldFetchBoard
        ? currentActiveSprintId || "__active__"
        : String(sprintId || "");
    const sprintsPromise = shouldResolveSprintsNow
      ? fetchSprints(projectId)
      : Promise.resolve([]);
    const boardPromise =
      shouldFetchBoard && optimisticBoardSprintId
        ? fetchBoard(optimisticBoardSprintId, projectId, activeFilters, {
            fast: true,
          })
        : Promise.resolve(setColumns([]));
    await Promise.all([
      boardPromise,
      shouldFetchBacklog
        ? fetchBacklog(projectId, activeFilters, sprintId)
        : Promise.resolve(setBacklogTasks([])),
      shouldFetchBacklog
        ? fetchBacklogRows(projectId, activeFilters, sprintId)
        : Promise.resolve(setBacklogRowsData([])),
      shouldFetchAllTasks
        ? fetchAllTasks(projectId, activeFilters, sprintId, {
            backlogScope: true,
          })
        : Promise.resolve(setAllTasks([])),
    ]);

    const latestSprints = await sprintsPromise;
    if (
      shouldResolveSprintsNow &&
      sprintId &&
      !latestSprints.some((sprint) => String(sprint.id) === String(sprintId))
    ) {
      setSelectedSprintId("");
      sprintId = "";
    }
    const latestActiveSprint = shouldResolveSprintsNow
      ? latestSprints.find((sprint) => sprint.status === "active")
      : null;
    const boardSprintId = shouldResolveSprintsNow
      ? activeView === "board"
        ? String(latestActiveSprint?.id || "")
        : sprintId
      : "";
    if (!shouldFetchBoard) {
      setBoardTotalsByStatus({});
      return;
    }
    if (
      boardSprintId &&
      optimisticBoardSprintId !== "__active__" &&
      String(boardSprintId) !== String(optimisticBoardSprintId)
    ) {
      await fetchBoard(boardSprintId, projectId, activeFilters);
    }
  };

  const loadMoreProjects = useCallback(async () => {
    await fetchProjectsPage({ reset: false });
  }, [fetchProjectsPage]);

  const loadMoreUsers = useCallback(async () => {
    await fetchUsersPage({ reset: false });
  }, [fetchUsersPage]);

  const loadMoreBoard = useCallback(async () => {
    if (!boardHasMore || boardLoadingMore || !boardNextCursor) return;
    setBoardLoadingMore(true);
    try {
      await fetchBoard(activeSprintId, currentProjectId, debouncedFilters, {
        append: true,
        cursor: boardNextCursor,
      });
    } finally {
      setBoardLoadingMore(false);
    }
  }, [
    boardHasMore,
    boardLoadingMore,
    boardNextCursor,
    fetchBoard,
    activeSprintId,
    currentProjectId,
    debouncedFilters,
  ]);

  const loadMoreBacklog = useCallback(async () => {
    if (!backlogHasMore || backlogLoadingMore || !backlogNextCursor) return;
    setBacklogLoadingMore(true);
    try {
      await fetchBacklog(currentProjectId, debouncedFilters, selectedSprintId, {
        append: true,
        cursor: backlogNextCursor,
      });
    } finally {
      setBacklogLoadingMore(false);
    }
  }, [
    backlogHasMore,
    backlogLoadingMore,
    backlogNextCursor,
    fetchBacklog,
    currentProjectId,
    debouncedFilters,
    selectedSprintId,
  ]);

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
        refreshViews(selectedSprintId, projectId, debouncedFilters),
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
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationStreamConnected(false);
      if (notificationStreamRef.current) {
        notificationStreamRef.current.close();
        notificationStreamRef.current = null;
      }
      return;
    }
    loadNotifications().catch(() => {});
    const authToken = getAuthToken();
    const streamUrl = buildApiUrl(
      `/notifications/stream?token=${encodeURIComponent(authToken)}`,
    );
    const stream = new EventSource(streamUrl);
    notificationStreamRef.current = stream;
    stream.onopen = () => {
      setNotificationStreamConnected(true);
      setNotificationStreamError("");
    };
    stream.addEventListener("notification:new", (event) => {
      const payload = JSON.parse(event.data || "{}");
      setNotifications((prev) => [payload, ...prev].slice(0, 80));
      if (payload?.type === "project_membership_added") {
        refreshProjectsList().catch(() => {});
      }
    });
    stream.addEventListener("notification:unread_count", (event) => {
      const payload = JSON.parse(event.data || "{}");
      setUnreadCount(Number(payload?.unreadCount || 0));
    });
    stream.onerror = () => {
      setNotificationStreamConnected(false);
      setNotificationStreamError("Disconnected");
    };
    return () => {
      stream.close();
      notificationStreamRef.current = null;
      setNotificationStreamConnected(false);
    };
  }, [
    token,
    loadNotifications,
    setNotifications,
    setUnreadCount,
    setNotificationStreamConnected,
    setNotificationStreamError,
    refreshProjectsList,
  ]);

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
    return normalizeLabelDefinitions(labels).map((label) => label.name);
  }, [projectSettings?.generalRules?.labels]);
  const boardLabelColorsByName = useMemo(
    () => buildLabelColorMap(projectSettings?.generalRules?.labels),
    [projectSettings?.generalRules?.labels],
  );
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
  const taskDrawerProjectId = useMemo(
    () => String(taskBundle?.task?.projectId || ""),
    [taskBundle?.task?.projectId],
  );
  useEffect(() => {
    if (!taskDrawerProjectId) {
      setTaskDrawerProjectSettings(null);
      return;
    }
    if (String(taskDrawerProjectId) === String(currentProjectId)) {
      setTaskDrawerProjectSettings(projectSettings);
      return;
    }
    let cancelled = false;
    apiRequest(
      `/task-management/projects/${encodeURIComponent(taskDrawerProjectId)}/settings`,
    )
      .then((settings) => {
        if (!cancelled) setTaskDrawerProjectSettings(settings || null);
      })
      .catch(() => {
        if (!cancelled) setTaskDrawerProjectSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [taskDrawerProjectId, currentProjectId, projectSettings]);
  const drawerSettings =
    taskDrawerProjectId && String(taskDrawerProjectId) !== String(currentProjectId)
      ? taskDrawerProjectSettings
      : projectSettings;
  const drawerWorkflowStages = useMemo(
    () =>
      drawerSettings?.boardCardFields?.workflowStages?.length > 0
        ? drawerSettings.boardCardFields.workflowStages
        : DEFAULT_WORKFLOW_STAGES,
    [drawerSettings?.boardCardFields?.workflowStages],
  );
  const drawerWorkflowTransitions = useMemo(() => {
    const transitions = drawerSettings?.workflowRules?.transitions;
    return Array.isArray(transitions) ? transitions : [];
  }, [drawerSettings?.workflowRules?.transitions]);
  const drawerLabels = useMemo(() => {
    const labels = drawerSettings?.generalRules?.labels;
    return normalizeLabelDefinitions(labels).map((label) => label.name);
  }, [drawerSettings?.generalRules?.labels]);
  const drawerVersions = useMemo(() => {
    const versions = drawerSettings?.generalRules?.versions;
    if (!Array.isArray(versions)) return [];
    return [
      ...new Set(
        versions.map((version) => String(version || "").trim()).filter(Boolean),
      ),
    ];
  }, [drawerSettings?.generalRules?.versions]);

  useEffect(() => {
    latestProjectIdRef.current = String(currentProjectId || "");
  }, [currentProjectId]);

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
    refreshViews(selectedSprintId, currentProjectId, debouncedFilters).catch(
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    currentProjectId,
    debouncedFilters,
    selectedSprintId,
    token,
    loading,
  ]);

  useEffect(() => {
    if (!token || loading) return;
    if (activeView === "projects") {
      fetchProjectsPage({ reset: true }).catch(() => {});
    }
    if (activeView === "users") {
      fetchUsersPage({ reset: true }).catch(() => {});
    }
  }, [
    token,
    loading,
    activeView,
    fetchProjectsPage,
    fetchUsersPage,
    showDisabledUsersFilter,
  ]);

  useEffect(() => {
    if (!token || loading || activeView !== "dashboard") return;
    fetchMyAssignedTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loading, activeView, currentUser?.id]);

  useEffect(() => {
    setMustChangePassword(currentUser?.mustChangePassword === true);
  }, [currentUser]);

  useEffect(() => {
    if (token || mustChangePassword) return;
    const path = String(location.pathname || "").replace(/\/+$/, "") || "/";
    const query = new URLSearchParams(location.search || "");
    if (path === "/reset-password") {
      const tokenFromUrl = String(query.get("token") || "").trim();
      setAuthMode("reset-password");
      if (tokenFromUrl) {
        setResetPasswordForm((prev) => ({ ...prev, token: tokenFromUrl }));
      }
    } else if (authMode === "reset-password") {
      setAuthMode("login");
    }
  }, [
    token,
    mustChangePassword,
    location.pathname,
    location.search,
    authMode,
    setAuthMode,
    setResetPasswordForm,
  ]);

  useEffect(() => {
    if (!token || loading || activeView !== "board" || !currentProjectId)
      return;
    const params = new URLSearchParams(location.search || "");
    const taskId = params.get("taskId");
    if (!taskId) return;
    openTask(taskId)
      .catch(() => {})
      .finally(() => {
        params.delete("taskId");
        params.delete("commentId");
        navigate(
          {
            pathname: location.pathname,
            search: params.toString() ? `?${params.toString()}` : "",
          },
          { replace: true },
        );
      });
  }, [
    token,
    loading,
    activeView,
    currentProjectId,
    location.pathname,
    location.search,
    navigate,
    openTask,
  ]);

  useEffect(() => {
    if (
      activeView !== "board" &&
      activeView !== "backlog" &&
      activeView !== "summary"
    )
      return;
    setShowAssigneeOverflow(false);
    setSelectedSprintId("");
    setFilters((prev) => {
      if (
        (!Array.isArray(prev.assigneeIds) || prev.assigneeIds.length === 0) &&
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
        assigneeIds: [],
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
      location.pathname !== "/" &&
      location.pathname !== "/__boneyard"
    ) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (parsed.projectId) {
      setCurrentProjectId(String(parsed.projectId));
    }

    if (
      parsed.view === "settings" &&
      parsed.projectId &&
      currentUser &&
      !userManagesProject(parsed.projectId)
    ) {
      navigate(`/project/${parsed.projectId}/board`, { replace: true });
      return;
    }

    let nextActive = "dashboard";
    if (
      parsed.view === "board" ||
      parsed.view === "backlog" ||
      parsed.view === "summary" ||
      parsed.view === "settings"
    ) {
      nextActive = parsed.view;
    } else if (parsed.view === "users") nextActive = "users";
    else if (parsed.view === "profile") nextActive = "profile";
    else if (parsed.view === "projects") nextActive = "projects";
    else if (parsed.view === "app-settings") nextActive = "app-settings";

    setActiveView(nextActive);
  }, [
    location.pathname,
    token,
    loading,
    visibleProjects,
    navigate,
    currentProjectId,
    currentUser,
    userManagesProject,
  ]);

  const handleNavigateMain = useCallback(
    (key) => {
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
      if (key === "profile") {
        setActiveView("profile");
        navigate("/profile");
        return;
      }
      if (key === "app-settings") {
        setActiveView("app-settings");
        navigate("/settings");
        return;
      }
    },
    [navigate, setActiveView],
  );

  const handleNavigateProject = useCallback(
    (projectId, subview) => {
      const id = String(projectId);
      const targetSubview = String(subview || "board");
      const nextProject = projects.find((project) => String(project.id) === id);
      if (nextProject?.name) {
        setProjectNameHintById((prev) => ({ ...prev, [id]: nextProject.name }));
      }
      if (
        targetSubview === "board" ||
        targetSubview === "backlog" ||
        targetSubview === "summary"
      ) {
        if (targetSubview !== "board") {
          fetchSprints(id).catch(() => {});
        }
      }
      // Reset board UI immediately to avoid stale counts/tasks while switching projects.
      setColumns([]);
      setBoardTotalsByStatus({});
      setBoardNextCursor("");
      setBoardHasMore(false);
      if (!userManagesProject(id) && targetSubview === "settings") {
        lastReadinessBlockRef.current = "";
        setCurrentProjectId(id);
        setSelectedSprintId("");
        setActiveView("board");
        navigate(`/project/${id}/board`);
        return;
      }
      if (targetSubview === "board" || targetSubview === "backlog") {
        if (!userManagesProject(id)) {
          lastReadinessBlockRef.current = "";
          setCurrentProjectId(id);
          setSelectedSprintId("");
          setActiveView(targetSubview);
          navigate(`/project/${id}/${targetSubview}`);
          return;
        }
      }
      lastReadinessBlockRef.current = "";
      setCurrentProjectId(id);
      setSelectedSprintId("");
      setActiveView(targetSubview);
      navigate(`/project/${id}/${targetSubview}`);
    },
    [
      navigate,
      userManagesProject,
      projects,
      fetchSprints,
      setColumns,
      setBoardTotalsByStatus,
      setBoardNextCursor,
      setBoardHasMore,
      setActiveView,
      setCurrentProjectId,
      setSelectedSprintId,
      setProjectNameHintById,
    ],
  );

  useEffect(() => {
    if (!token || loading || !currentProjectId) return;
    if (activeView !== "board" && activeView !== "backlog") return;
    if (!canManageProject) return;
    let cancelled = false;
    (async () => {
      try {
        const readiness = await evaluateProjectReadiness(currentProjectId);
        if (cancelled || readiness.ready) return;
        const key = `${currentProjectId}:${readiness.missing.sort().join(",")}`;
        if (lastReadinessBlockRef.current !== key) {
          notify(
            `Complete required project settings before use: ${readiness.missing.join(", ")}.`,
            "error",
          );
          lastReadinessBlockRef.current = key;
        }
        setActiveView("settings");
        navigate(`/project/${encodeURIComponent(currentProjectId)}/settings`, {
          replace: true,
        });
      } catch {
        if (cancelled) return;
        notify(
          "Failed to verify project setup. Open project settings.",
          "error",
        );
        setActiveView("settings");
        navigate(`/project/${encodeURIComponent(currentProjectId)}/settings`, {
          replace: true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    token,
    loading,
    currentProjectId,
    activeView,
    evaluateProjectReadiness,
    navigate,
    notify,
    canManageProject,
    setActiveView,
  ]);

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
      const requiresChange = data.mustChangePassword === true;
      setMustChangePassword(requiresChange);
      if (!requiresChange) {
        setActiveView("dashboard");
        navigate("/dashboard", { replace: true });
      }
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
      setMustChangePassword(false);
      setActiveView("dashboard");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const forgotPassword = async ({ email }) => {
    setAuthLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      notify(
        data.message || "If the account exists, a reset email has been sent.",
      );
    } catch (err) {
      setError(err.message || "Failed to request password reset");
    } finally {
      setAuthLoading(false);
    }
  };

  const resetPassword = async ({ token: resetToken, password }) => {
    setAuthLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password }),
      });
      notify(data.message || "Password reset successful.");
    } catch (err) {
      setError(err.message || "Failed to reset password");
    } finally {
      setAuthLoading(false);
    }
  };

  const changePassword = async ({ name, currentPassword, newPassword }) => {
    setAuthLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ name, currentPassword, newPassword }),
      });
      notify(data.message || "Password updated.");
      setMustChangePassword(false);
      setActiveView("dashboard");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to change password");
    } finally {
      setAuthLoading(false);
    }
  };

  const changePasswordFromProfile = async ({
    currentPassword,
    newPassword,
  }) => {
    try {
      const data = await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      notify(data.message || "Password updated.");
    } catch (error) {
      notify(error.message || "Failed to update password.", "error");
      throw error;
    }
  };

  const updateProfileInfo = async ({ name, email }) => {
    const data = await apiRequest("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ name, email }),
    });
    if (data?.user) {
      setCurrentUser(data.user);
    }
    notify("Profile updated.");
  };

  const logout = async () => {
    await unregisterPushNotifications().catch(() => {});
    setStoredToken("");
    setToken("");
    setCurrentUser(null);
    setUsers([]);
    setUserGroups([]);
    setProjects([]);
    setProjectSettings(null);
    setSprints([]);
    setSprintTasks([]);
    setColumns([]);
    setBoardTotalsByStatus({});
    setBacklogTasks([]);
    setAllTasks([]);
    setDashboardAssignedTasks([]);
    setDashboardData(null);
    setSelectedSprintId("");
    setCurrentProjectId("");
    setTaskTitle("");
    setStoryPoints("");
    setTaskDueDate("");
    setAssigneeId("");
    setTaskPriority("medium");
    setTaskType("task");
    setTaskLabel("");
    setTaskVersion("");
    setShowCreateTaskModal(false);
    setShowFilterModal(false);
    setShowAssigneeOverflow(false);
    setFilterDraft({
      sprintId: "",
      priority: "",
      label: "",
      status: "",
      type: "",
    });
    setFilters({
      assigneeId: "",
      assigneeIds: [],
      priority: "",
      label: "",
      status: "",
      type: "",
      search: "",
    });
    setNotifications([]);
    setUnreadCount(0);
    setNotificationCenterOpen(false);
    setNotificationStreamConnected(false);
    setNotificationStreamError("");
    setActiveView("dashboard");
    setError("");
    setTaskBundle(null);
    setMustChangePassword(false);
    navigate("/dashboard", { replace: true });
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (!canManageProject) return;
    const nextErrors = {};
    if (!taskTitle.trim()) nextErrors.title = REQUIRED_FIELD_MESSAGE;
    if (!String(taskType || "").trim())
      nextErrors.type = REQUIRED_FIELD_MESSAGE;
    if (Object.keys(nextErrors).length) {
      setCreateTaskFieldErrors(nextErrors);
      return;
    }
    setCreateTaskFieldErrors({});
    if (!currentProjectId) return;
    const noActiveSprint =
      activeView === "board" && !activeSprintId && !createTaskSprintId;
    const targetSprintId = createTaskSprintId || null;
    const taskDescription = createTaskDescriptionRef.current?.innerHTML || "";
    await apiRequest("/task-management/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: taskTitle.trim(),
        description: taskDescription,
        storyPoints: storyPoints === "" ? null : Number(storyPoints),
        dueDate: taskDueDate || null,
        status: createTaskDefaultStatus,
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
    setTaskDueDate("");
    setAssigneeId("");
    setTaskPriority("medium");
    setTaskType("task");
    setTaskLabel("");
    setTaskVersion("");
    setCreateTaskSprintId("");
    if (createTaskDescriptionRef.current) {
      createTaskDescriptionRef.current.innerHTML = "";
    }
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

  const markNotificationRead = useCallback(
    async (notificationId) => {
      await apiRequest(`/notifications/${notificationId}/read`, {
        method: "PATCH",
      });
      await loadNotifications();
    },
    [loadNotifications],
  );

  const markAllNotificationsRead = useCallback(async () => {
    await apiRequest("/notifications/read-all", { method: "PATCH" });
    await loadNotifications();
  }, [loadNotifications]);

  const handleNotificationClick = useCallback(
    async (notification) => {
      setNotificationCenterOpen(false);
      await markNotificationRead(notification.id).catch(() => {});
      if (notification?.type === "project_membership_added") {
        await refreshProjectsList().catch(() => {});
      }
      const targetPath = buildNotificationPath(notification);
      navigate(targetPath);
    },
    [
      markNotificationRead,
      navigate,
      refreshProjectsList,
      setNotificationCenterOpen,
    ],
  );

  const searchGlobalTasks = useCallback(async (query) => {
    const term = String(query || "").trim();
    if (!term) return [];
    const params = new URLSearchParams();
    params.set("search", term);
    params.set("limit", "12");
    const data = await apiRequest(
      `/task-management/tasks/search?${params.toString()}`,
    );
    return Array.isArray(data) ? data : [];
  }, []);

  const openTaskFromGlobalSearch = useCallback(
    (task) => {
      const taskId = String(task?.id || "").trim();
      const projectId = String(task?.projectId || "").trim();
      if (!taskId || !projectId) return;
      navigate(
        `/project/${encodeURIComponent(projectId)}/board?taskId=${encodeURIComponent(taskId)}`,
      );
    },
    [navigate],
  );

  const openProjectBoard = useCallback(
    (id) => handleNavigateProject(id, "board"),
    [handleNavigateProject],
  );
  const openProjectSettings = useCallback(
    (projectId) => handleNavigateProject(projectId, "settings"),
    [handleNavigateProject],
  );
  const openCreateTaskModal = useCallback((targetSprintId = undefined) => {
    if (!canManageProject) return;
    setCreateTaskFieldErrors({});
    const looksLikeEventObject =
      targetSprintId &&
      typeof targetSprintId === "object" &&
      typeof targetSprintId.preventDefault === "function";
    const normalizedTargetSprintId = looksLikeEventObject
      ? undefined
      : targetSprintId;
    let nextSprintId = "";
    if (activeView === "board") {
      // Board creation always targets the active sprint.
      nextSprintId = activeSprintId || "";
    } else if (normalizedTargetSprintId !== undefined) {
      nextSprintId =
        normalizedTargetSprintId == null ||
        String(normalizedTargetSprintId) === "backlog"
          ? ""
          : String(normalizedTargetSprintId);
    }
    setCreateTaskSprintId(nextSprintId);
    if (createTaskDescriptionRef.current) {
      createTaskDescriptionRef.current.innerHTML = "";
    }
    setShowCreateTaskModal(true);
  }, [activeSprintId, activeView, canManageProject, setShowCreateTaskModal]);
  const runCreateTaskDescriptionCommand = useCallback(
    (command, value = null) => {
      if (!createTaskDescriptionRef.current) return;
      createTaskDescriptionRef.current.focus();
      document.execCommand(command, false, value);
    },
    [],
  );
  const closeTaskDrawer = useCallback(
    () => setTaskBundle(null),
    [setTaskBundle],
  );

  const saveTask = async (taskId, patch, options = {}) => {
    const lightweight = options?.lightweight === true;
    const activeTaskId = String(taskBundle?.task?.id || "");
    const expectedUpdatedAt =
      activeTaskId === String(taskId || "")
        ? String(taskBundle?.task?.updatedAt || "").trim()
        : "";
    const payload =
      !lightweight && expectedUpdatedAt
        ? { ...patch, expectedUpdatedAt }
        : patch;
    const isConflictError = (error) => {
      const message = String(error?.message || "").toLowerCase();
      return (
        message.includes("task was updated by another request") ||
        message.includes("conflict")
      );
    };
    const patchTask = (body) =>
      apiRequest(`/task-management/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    try {
      await patchTask(payload);
    } catch (error) {
      if (!isConflictError(error)) throw error;
      await openTask(taskId);
      if (lightweight) throw error;
      // If a concurrent write sneaks in, retry manual save once with fresh state.
      await patchTask(patch);
    }
    await openTask(taskId);
    if (!lightweight) {
      // Manual saves should finish with up-to-date board/dashboard data.
      await refetchAfterCrud({
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(
          error?.message || "Failed to refresh project data after saving task.",
          "error",
        );
      });
    }
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
    const confirmed = await requestConfirmation({
      title: "Delete comment",
      message: "Delete this comment? This action cannot be undone.",
      confirmLabel: "Delete comment",
    });
    if (!confirmed) {
      return;
    }
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
        body: JSON.stringify({
          email: payload.email,
          role: payload.role,
        }),
      });
      notify("User created.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(error?.message || "Failed to refresh data after creating user.", "error");
      });
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

    try {
      await apiRequest(`/task-management/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      notify("User updated.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(error?.message || "Failed to refresh data after updating user.", "error");
      });
    } catch (error) {
      notify(error.message || "Failed to update user.", "error");
      throw error;
    }
  };

  const disableUser = async (userId) => {
    const confirmed = await requestConfirmation({
      title: "Delete user",
      message:
        "Disable this user? Their account will remain for history and they will be removed from groups.",
      confirmLabel: "Disable user",
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiRequest(`/task-management/users/${userId}/disable`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      notify("User disabled.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(error?.message || "Failed to refresh data after disabling user.", "error");
      });
    } catch (error) {
      notify(error.message || "Failed to disable user.", "error");
      throw error;
    }
  };

  const enableUser = async (userId) => {
    const confirmed = await requestConfirmation({
      title: "Reactivate user",
      message: "Reactivate this user and restore account access?",
      confirmLabel: "Reactivate user",
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiRequest(`/task-management/users/${userId}/enable`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      notify("User reactivated.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(error?.message || "Failed to refresh data after reactivating user.", "error");
      });
    } catch (error) {
      notify(error.message || "Failed to reactivate user.", "error");
      throw error;
    }
  };

  const createUserGroup = async (payload) => {
    try {
      await apiRequest("/task-management/user-groups", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      notify("User group created.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(
          error?.message || "Failed to refresh data after creating user group.",
          "error",
        );
      });
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
      notify("User group updated.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(
          error?.message || "Failed to refresh data after updating user group.",
          "error",
        );
      });
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
      notify("User group deleted.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(
          error?.message || "Failed to refresh data after deleting user group.",
          "error",
        );
      });
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
      notify("Sprint created.");
      void refetchAfterCrud({
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(error?.message || "Failed to refresh data after creating sprint.", "error");
      });
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
    void refetchAfterCrud({
      includeProject: true,
      includeDashboard: true,
    }).catch((error) => {
      notify(error?.message || "Failed to refresh data after updating sprint.", "error");
    });
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
      notify("Project created.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
        projectId: id,
      }).catch((error) => {
        notify(error?.message || "Failed to refresh data after creating project.", "error");
      });
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
      notify("Project updated.");
      void refetchAfterCrud({
        includeBootstrap: true,
        includeProject: true,
        includeDashboard: true,
      }).catch((error) => {
        notify(error?.message || "Failed to refresh data after updating project.", "error");
      });
      return updated;
    } catch (error) {
      notify(error.message || "Failed to update project.", "error");
      throw error;
    }
  };

  const deleteProject = async (projectId) => {
    const confirmed = await requestConfirmation({
      title: "Delete project",
      message:
        "Delete this project? This removes all tasks and configurations permanently.",
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
    void refetchAfterCrud({
      includeProject: true,
      includeDashboard: true,
    }).catch((error) => {
      notify(error?.message || "Failed to refresh project settings data.", "error");
    });
    return updated;
  };

  const saveProjectMembers = async (memberIds, projectAdminMemberIds) => {
    if (!currentProjectId) return null;
    const updated = await apiRequest(
      `/task-management/projects/${currentProjectId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ memberIds, projectAdminMemberIds }),
      },
    );
    setProjects((prev) =>
      prev.map((project) => (project.id === updated.id ? updated : project)),
    );
    notify("Project users saved.");
    void refetchAfterCrud({
      includeBootstrap: true,
      includeProject: true,
      includeDashboard: true,
    }).catch((error) => {
      notify(error?.message || "Failed to refresh data after saving project users.", "error");
    });
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

  if (location.pathname === "/__boneyard") {
    return <BoneyardCapturePage />;
  }

  if (!token || mustChangePassword) {
    return (
      <div className="min-h-screen bg-[#f7f8fa] text-[#172b4d]">
        <AuthView
          onLogin={login}
          onRegister={register}
          onForgotPassword={forgotPassword}
          onResetPassword={resetPassword}
          onChangePassword={changePassword}
          mustChangePassword={mustChangePassword}
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
        canManage={isOrgAdmin}
        activeView={activeView}
        currentProjectId={currentProjectId}
        activeSprintName={
          activeSprintName ||
          activeSprintNameHintByProjectId[String(currentProjectId)] ||
          ""
        }
        currentProjectName={
          projectById.get(String(currentProjectId))?.name ||
          projectNameHintById[String(currentProjectId)] ||
          ""
        }
        projects={sidebarProjects}
        onNavigateMain={handleNavigateMain}
        onOpenProfileSecurity={() => handleNavigateMain("profile")}
        onNavigateProject={handleNavigateProject}
        canManageCurrentProject={canManageProject}
        notifications={notifications}
        unreadCount={unreadCount}
        notificationCenterOpen={notificationCenterOpen}
        onToggleNotificationCenter={handleToggleNotificationCenter}
        onCloseNotificationCenter={() => setNotificationCenterOpen(false)}
        onNotificationClick={handleNotificationClick}
        onMarkNotificationRead={markNotificationRead}
        onMarkAllNotificationsRead={markAllNotificationsRead}
        onGlobalTaskSearch={searchGlobalTasks}
        onOpenGlobalTask={openTaskFromGlobalSearch}
      >
        <div className={activeView === "dashboard" ? undefined : "p-4"}>
          {(activeView === "board" || activeView === "backlog") &&
          currentProjectId ? (
            <section
              className={`mb-3 grid gap-2 rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem] ${activeView === "board" ? "border-[#e2e6ee] bg-white" : ""}`}
            >
              <div className="grid gap-[0.6rem]">
                <div className="flex flex-wrap items-center gap-[0.6rem] max-[1280px]:flex-col max-[1280px]:items-stretch">
                  <div className="flex min-w-0 flex-1 basis-[800px] items-center gap-[0.4rem] rounded border border-[#d6dce8] bg-[#f7f8fa] px-2 py-[0.3rem] max-[1280px]:min-w-[250px] max-[1280px]:basis-[320px] max-[640px]:w-full max-[640px]:basis-auto">
                    <span className="text-[#6b778c]">
                      <Icon name="search" size={15} />
                    </span>
                    <input
                      className="w-full border-none bg-transparent p-0 shadow-none focus:outline-none focus-visible:outline-none"
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
                    className="relative min-w-0 shrink-0 max-w-[min(46vw,360px)] max-[640px]:order-2 max-[640px]:w-full max-[640px]:max-w-none"
                    title="Team members"
                    ref={assigneeOverflowRef}
                  >
                    <div className="flex min-w-0 flex-nowrap items-center gap-[0.45rem] overflow-x-auto py-1">
                      {visibleAssigneeItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`h-7 w-7 shrink-0 rounded-full border border-[#d6dce8] bg-[#0b6bcb] p-0 text-[0.72rem] font-bold text-white focus:outline-none focus-visible:outline-none max-[640px]:h-8 max-[640px]:w-8 max-[640px]:text-[0.74rem] ${item.isUnassigned ? "border-[#c7cfde] bg-[#f4f5f7] text-[#5e6c84]" : ""} ${isAssigneeFilterSelected(item.id) ? "ring-2 ring-[#0b6bcb] ring-offset-2 ring-offset-white" : ""}`}
                          style={
                            item.isUnassigned
                              ? undefined
                              : { backgroundColor: getUserAvatarColor(item.id) }
                          }
                          onClick={() => toggleAssigneeFilter(item.id)}
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
                          className="shrink-0 rounded-full border border-[#c7cfde] bg-[#f4f5f7] px-[0.52rem] py-[0.16rem] text-[0.72rem] font-semibold text-[#42526e] hover:bg-[#e9edf3]"
                          onClick={() => setShowAssigneeOverflow((prev) => !prev)}
                          title="Show more assignees"
                          aria-expanded={showAssigneeOverflow}
                          aria-label={`Show ${overflowAssigneeItems.length} more assignees`}
                        >
                          +{overflowAssigneeItems.length}
                        </button>
                      ) : null}
                    </div>
                    {showAssigneeOverflow && overflowAssigneeItems.length ? (
                      <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 grid max-h-[260px] w-[min(320px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] gap-[0.25rem] overflow-auto rounded-[10px] border border-[#d7dce5] bg-white p-[0.4rem] shadow-[0_10px_24px_rgba(9,30,66,0.18)]">
                        {overflowAssigneeItems.map((item) => (
                          <button
                            key={`overflow-${item.id}`}
                            type="button"
                            className={`flex items-center gap-[0.45rem] rounded-[8px] border px-[0.4rem] py-[0.35rem] text-left text-[0.82rem] text-[#253858] hover:bg-[#f4f6fa] ${isAssigneeFilterSelected(item.id) ? "border-[#0b6bcb] bg-[#d8e8fc] font-semibold text-[#0847a6]" : "border-transparent"}`}
                            onClick={() => {
                              toggleAssigneeFilter(item.id);
                              setShowAssigneeOverflow(false);
                            }}
                            title={item.label}
                          >
                            <span
                              className={`grid h-6 w-6 place-items-center rounded-full border border-[#d6dce8] text-[0.66rem] font-bold ${item.isUnassigned ? "bg-[#f4f5f7] text-[#5e6c84]" : "text-white"} ${isAssigneeFilterSelected(item.id) ? "ring-2 ring-[#0b6bcb] ring-offset-1 ring-offset-[#d8e8fc]" : ""}`}
                              style={
                                item.isUnassigned
                                  ? undefined
                                  : {
                                      backgroundColor: getUserAvatarColor(
                                        item.id,
                                      ),
                                    }
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
                  <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 max-[1280px]:ml-0 max-[640px]:order-3 max-[640px]:w-full max-[640px]:justify-end">
                    <div className="relative" ref={filterPopoverRef}>
                      <button
                        type="button"
                        className="whitespace-nowrap border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
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
                          className="absolute right-0 top-[calc(100%+0.45rem)] z-50 w-[min(560px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-x-hidden rounded-[12px] border border-[#d7dce5] bg-[#f7f8fa] p-[0.95rem] text-gray-800 shadow-[0_10px_30px_rgba(9,30,66,0.2)] max-[640px]:fixed max-[640px]:bottom-[5.4rem] max-[640px]:left-2 max-[640px]:right-2 max-[640px]:top-auto max-[640px]:z-[70] max-[640px]:w-auto max-[640px]:max-w-none max-[640px]:max-h-[58vh] max-[640px]:overflow-y-auto"
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
                    {activeView === "board" && canManageProject ? (
                      <button
                        type="button"
                        onClick={() => openCreateTaskModal()}
                      >
                        <span className="whitespace-nowrap">Add Task</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
          {error ? <p className="my-2 text-red-600">{error}</p> : null}
          {activeView === "dashboard" ? (
            <DashboardView
              currentUser={currentUser}
              projects={sidebarProjects}
              assignedTasks={dashboardAssignedTasks}
              recentTasks={dashboardData?.recentTasks || []}
              bucketCounts={dashboardData?.bucketCounts || null}
              projectCards={dashboardData?.projectCards || null}
              projectById={projectById}
              workflowStages={workflowStages}
              onOpenProject={openProjectBoard}
              onOpenTask={openTask}
            />
          ) : null}
          {showCreateTaskModal ? (
            <Modal
              open={showCreateTaskModal}
              onOpenChange={(open) => {
                setShowCreateTaskModal(open);
                if (!open) {
                  setCreateTaskFieldErrors({});
                  setCreateTaskSprintId("");
                  if (createTaskDescriptionRef.current) {
                    createTaskDescriptionRef.current.innerHTML = "";
                  }
                }
              }}
              cardClassName="max-w-[420px] gap-[0.65rem] p-[0.75rem] [&_.flex.items-center.justify-between]:pb-[0.55rem] [&_h3]:text-[0.98rem] [&_label]:gap-[0.28rem] [&_label]:text-[0.8rem] [&_label]:text-[#344563] [&_input]:px-[0.45rem] [&_select]:px-[0.45rem] [&_input]:py-[0.32rem] [&_select]:py-[0.32rem] [&_input]:text-[0.82rem] [&_select]:text-[0.82rem]"
            >
              <div className="flex items-center justify-between gap-3">
                <h3>Create Task</h3>
                <button
                  type="button"
                  className="border border-[#dfe1e6] bg-transparent text-[0.8rem] text-[#42526e] hover:bg-[#f4f5f7] px-2 py-1"
                  onClick={() => {
                    setCreateTaskFieldErrors({});
                    setShowCreateTaskModal(false);
                  }}
                >
                  X
                </button>
              </div>
              <form className="grid gap-[0.45rem]" onSubmit={createTask}>
                <div className="grid grid-cols-4 gap-[0.45rem]">
                  <label className="col-span-3">
                    <span className="inline-flex items-center">
                      Task title <span className="ml-1 text-red-600">*</span>
                    </span>
                    <input
                      placeholder="Enter task title"
                      value={taskTitle}
                      className={invalidFieldClassName(
                        Boolean(createTaskFieldErrors.title),
                      )}
                      onChange={(event) => {
                        setTaskTitle(event.target.value);
                        if (createTaskFieldErrors.title) {
                          setCreateTaskFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.title;
                            return next;
                          });
                        }
                      }}
                    />
                  </label>
                  <label className="col-span-1">
                    Story points
                    <input
                      type="number"
                      min="1"
                      max="21"
                      placeholder="SP"
                      value={storyPoints}
                      onChange={(event) => setStoryPoints(event.target.value)}
                    />
                  </label>
                </div>
                {createTaskFieldErrors.title ? (
                  <p className="text-[0.78rem] text-red-600">
                    {createTaskFieldErrors.title}
                  </p>
                ) : null}
                <label>
                  Description
                  <div className="overflow-hidden rounded-[8px] border border-[#dfe1e6] bg-white">
                    <div
                      className="flex flex-wrap gap-[0.35rem] border-b border-[#dfe1e6] bg-[#f7f8fa] p-[0.35rem]"
                      onMouseDown={(event) => {
                        if (event.target?.closest?.("button")) event.preventDefault();
                      }}
                    >
                      <button
                        type="button"
                        className="border border-[#dfe1e6] bg-transparent px-2 py-1 text-[0.75rem] text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() => runCreateTaskDescriptionCommand("bold")}
                      >
                        B
                      </button>
                      <button
                        type="button"
                        className="border border-[#dfe1e6] bg-transparent px-2 py-1 text-[0.75rem] text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() => runCreateTaskDescriptionCommand("italic")}
                      >
                        I
                      </button>
                      <button
                        type="button"
                        className="border border-[#dfe1e6] bg-transparent px-2 py-1 text-[0.75rem] text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() => runCreateTaskDescriptionCommand("underline")}
                      >
                        U
                      </button>
                      <button
                        type="button"
                        className="border border-[#dfe1e6] bg-transparent px-2 py-1 text-[0.75rem] text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() =>
                          runCreateTaskDescriptionCommand("insertUnorderedList")
                        }
                      >
                        • List
                      </button>
                      <button
                        type="button"
                        className="border border-[#dfe1e6] bg-transparent px-2 py-1 text-[0.75rem] text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() =>
                          runCreateTaskDescriptionCommand("insertOrderedList")
                        }
                      >
                        1. List
                      </button>
                      <button
                        type="button"
                        className="border border-[#dfe1e6] bg-transparent px-2 py-1 text-[0.75rem] text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() => {
                          const url = window.prompt("Enter URL");
                          if (!url) return;
                          runCreateTaskDescriptionCommand("createLink", url.trim());
                        }}
                      >
                        Link
                      </button>
                    </div>
                    <div
                      ref={createTaskDescriptionRef}
                      contentEditable
                      suppressContentEditableWarning
                      className="min-h-[84px] whitespace-pre-wrap px-[0.45rem] py-[0.35rem] text-[0.82rem] text-[#172b4d] outline-none [&_a]:break-words [&_a]:text-[#0c66e4] [&_a]:underline [&_ul]:my-[0.3rem] [&_ul]:ml-[1.1rem] [&_ul]:list-disc [&_ol]:my-[0.3rem] [&_ol]:ml-[1.1rem] [&_ol]:list-decimal"
                      data-placeholder="Add description"
                    />
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-[0.45rem]">
                  <label>
                    Due date
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(event) => setTaskDueDate(event.target.value)}
                    />
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
                </div>
                <div className="grid grid-cols-2 gap-[0.45rem]">
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
                </div>
                <div className="grid grid-cols-2 gap-[0.45rem]">
                  <div className="grid gap-[0.2rem]">
                    <label>
                      <span className="inline-flex items-center">
                        Work type <span className="ml-1 text-red-600">*</span>
                      </span>
                      <select
                        value={taskType}
                        className={invalidFieldClassName(
                          Boolean(createTaskFieldErrors.type),
                        )}
                        onChange={(event) => {
                          setTaskType(event.target.value);
                          if (createTaskFieldErrors.type) {
                            setCreateTaskFieldErrors((prev) => {
                              const next = { ...prev };
                              delete next.type;
                              return next;
                            });
                          }
                        }}
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
                    {createTaskFieldErrors.type ? (
                      <p className="text-[0.78rem] text-red-600">
                        {createTaskFieldErrors.type}
                      </p>
                    ) : null}
                  </div>
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
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    className="border border-[#dfe1e6] bg-transparent text-[0.82rem] text-[#42526e] hover:bg-[#f4f5f7] px-3 py-1.5"
                    onClick={() => {
                      setCreateTaskFieldErrors({});
                      setCreateTaskSprintId("");
                      if (createTaskDescriptionRef.current) {
                        createTaskDescriptionRef.current.innerHTML = "";
                      }
                      setShowCreateTaskModal(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-[8px] border border-[#2d64d9] bg-[#2d64d9] px-3 py-1.5 text-[0.82rem] font-medium text-white hover:border-[#1f4fc4] hover:bg-[#1f4fc4]"
                  >
                    Create Task
                  </button>
                </div>
              </form>
            </Modal>
          ) : null}
          {activeView === "backlog" ? (
            <BacklogView
              tasks={selectedSprintId ? [] : backlogTasks}
              sprints={sprints}
              allTasks={allTasks}
              isLoading={loading}
              rowsData={backlogRowsData}
              usersById={usersById}
              userAvatarColor={getUserAvatarColor}
              workflowStages={workflowStages}
              selectedSprintId={selectedSprintId}
              onSelectSprint={setSelectedSprintId}
              canManage={canManageProject}
              onStartSprint={startSprint}
              onCompleteSprint={completeSprint}
              onDeleteSprint={deleteSprint}
              onAssignTaskToSprint={assignTaskToSprintFromBacklog}
              onCreateSprint={createSprint}
              onAddTask={(targetSprintId) =>
                openCreateTaskModal(targetSprintId)
              }
              onOpenTask={openTask}
              onDeleteTask={deleteTask}
              onNotify={notify}
              hasMore={backlogHasMore}
              loadingMore={backlogLoadingMore}
              onLoadMore={loadMoreBacklog}
            />
          ) : null}

          {activeView === "board" ? (
            <BoardView
              columns={safeColumns}
              workflowTransitions={workflowTransitions}
              labelColorsByName={boardLabelColorsByName}
              currentUser={currentUser}
              userGroups={userGroups}
              usersById={usersById}
              userAvatarColor={getUserAvatarColor}
              boardTotalsByStatus={boardTotalsByStatus}
              assigneeFilterActive={selectedAssigneeIds.length > 0}
              onMove={moveTask}
              onOpenTask={openTask}
              hasMore={boardHasMore}
              loadingMore={boardLoadingMore}
              onLoadMore={loadMoreBoard}
            />
          ) : null}

          {activeView === "summary" && currentProjectId ? (
            <SummaryView
              projectId={currentProjectId}
              sprints={sprints}
              onFetchOverview={fetchSummaryOverview}
              onFetchSprint={fetchSummarySprint}
              onFetchFlow={fetchSummaryFlow}
              onFetchWorkload={fetchSummaryWorkload}
              onExportReport={exportSummaryReport}
            />
          ) : null}

          {activeView === "projects" ? (
            <ProjectManagementView
              projects={displayProjects}
              isLoading={loading}
              canManageOrganization={isOrgAdmin}
              canOpenProjectSettings={(project) =>
                isOrgAdmin ||
                (project.members || []).some(
                  (m) =>
                    String(m.id) === String(currentUser?.id) &&
                    Boolean(m.isProjectAdmin),
                )
              }
              onCreateProject={createProject}
              onUpdateProject={updateProject}
              onDeleteProject={deleteProject}
              onConfigureProject={openProjectSettings}
              onNotify={notify}
              hasMore={projectsHasMore}
              loadingMore={projectsLoadingMore}
              onLoadMore={loadMoreProjects}
            />
          ) : null}

          {activeView === "users" ? (
            <UserAdminView
              users={displayUsers}
              userGroups={userGroups}
              canManage={isOrgAdmin}
              currentUserId={currentUser?.id}
              onCreateUser={createUser}
              onUpdateUser={updateUser}
              onDisableUser={disableUser}
              onEnableUser={enableUser}
              onCreateUserGroup={createUserGroup}
              onUpdateUserGroup={updateUserGroup}
              onDeleteUserGroup={deleteUserGroup}
              hasMore={usersHasMore}
              loadingMore={usersLoadingMore}
              onLoadMore={loadMoreUsers}
              showDisabledUsers={showDisabledUsersFilter}
              onToggleShowDisabledUsers={setShowDisabledUsersFilter}
            />
          ) : null}

          {activeView === "app-settings" ? (
            <AppSettingsView canManage={isOrgAdmin} onNotify={notify} />
          ) : null}

          {activeView === "profile" ? (
            <ProfileView
              currentUser={currentUser}
              onUpdateProfile={updateProfileInfo}
              onChangePassword={changePasswordFromProfile}
            />
          ) : null}

          {activeView === "settings" && currentProjectId ? (
            <SystemSettingsView
              projectId={currentProjectId}
              settings={projectSettings}
              projectName={projectById.get(String(currentProjectId))?.name}
              users={users}
              userGroups={userGroups}
              projectMembers={
                projectById.get(String(currentProjectId))?.members || []
              }
              canManage={canManageProject}
              onSave={saveProjectSettings}
              onSaveMembers={saveProjectMembers}
              onNotify={notify}
              onGoToProjectBoard={() => openProjectBoard(currentProjectId)}
            />
          ) : null}

          <TaskDrawer
            taskBundle={taskBundle}
            currentUserId={currentUser?.id}
            users={users}
            userGroups={userGroups}
            assigneeUsers={projectUsers}
            mentionUsers={projectMentionCandidates}
            workflowStages={drawerWorkflowStages}
            workflowTransitions={drawerWorkflowTransitions}
            labels={drawerLabels}
            versions={drawerVersions}
            onClose={closeTaskDrawer}
            onSaveTask={saveTask}
            onAddComment={addComment}
            onUpdateComment={updateComment}
            onDeleteComment={deleteComment}
            onUploadAsset={uploadTaskAsset}
            onNotify={notify}
          />
        </div>
      </MainLayout>
    </div>
  );
}

export default App;
