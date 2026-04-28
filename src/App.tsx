import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
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
import { buildNotificationPath } from "./utils/notificationLinks";
import { buildLabelColorMap, normalizeLabelDefinitions } from "./utils/labels.js";
import {
  REQUIRED_FIELD_MESSAGE,
  invalidFieldClassName,
} from "./utils/formValidation.js";
import { initialActiveView, parseRoute } from "./routes/routeParser.js";
import {
  handleChangePassword,
  handleChangePasswordFromProfile,
  handleForgotPassword,
  handleLogin,
  handleLogout,
  handleRegister,
  handleResetPassword,
  handleUpdateProfileInfo,
} from "./features/auth/controller.js";
import {
  registerPushSubscriptionApi,
  removePushSubscriptionApi,
} from "./features/notifications/api.js";
import {
  loadNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
} from "./features/notifications/controller.js";
import {
  fetchGithubAppSettingsApi,
  fetchGithubProjectReposApi,
  fetchProjectSettingsApi,
  fetchTaskBundleApi,
  searchTasksApi,
} from "./features/taskManagement/api.js";
import {
  completeSprintController,
  createProjectController,
  createSprintController,
  createUserController,
  createUserGroupController,
  deleteSprintController,
  deleteProjectController,
  deleteTaskController,
  deleteUserGroupController,
  disableUserController,
  enableUserController,
  saveProjectSettingsController,
  saveProjectMembersController,
  startSprintController,
  updateProjectController,
  updateSprintController,
  updateUserController,
  updateUserGroupController,
} from "./features/admin/controller.js";
import {
  addCommentController,
  addTasksToSprintController,
  assignTaskToSprintFromBacklogController,
  createTaskController,
  deleteCommentController,
  moveTaskController,
  refetchAfterCrudController,
  removeTaskFromSprintController,
  saveTaskController,
  uploadTaskAssetController,
  updateCommentController,
} from "./features/taskManagement/controller.js";
import {
  exportSummaryReportController,
  fetchAllTasksController,
  fetchBacklogController,
  fetchBacklogRowsController,
  fetchBoardController,
  fetchBootstrapController,
  fetchMyAssignedTasksController,
  fetchProjectSettingsController,
  fetchProjectsPageController,
  fetchSprintTasksController,
  fetchSprintsController,
  fetchSummaryFlowController,
  fetchSummaryOverviewController,
  fetchSummarySprintController,
  fetchSummaryWorkloadController,
  fetchUsersPageController,
  loadMoreBacklogController,
  loadMoreBoardController,
  refreshProjectsListController,
  refreshViewsController,
} from "./features/taskManagement/readController.js";
import {
  useNotificationsSlice,
  usePlanningDataSlice,
  useSessionSlice,
  useTaskDrawerSlice,
  useTaskFormSlice,
} from "./features/taskManagement/hooks/useAppStoreSlices";

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

function App() {
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [createTaskFieldErrors, setCreateTaskFieldErrors] = useState<any>({});
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
    loading,
    setLoading,
    error,
    setError,
    authMode,
    setAuthMode,
    setResetPasswordForm,
  } = useSessionSlice();
  const {
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
    activeView,
    setActiveView,
    dashboardAssignedTasks,
    setDashboardAssignedTasks,
    filters,
    setFilters,
    filterDraft,
    setFilterDraft,
  } = usePlanningDataSlice();
  const {
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
  } = useTaskFormSlice();
  const { taskBundle, setTaskBundle } = useTaskDrawerSlice();
  const {
    notifications,
    setNotifications,
    unreadCount,
    setUnreadCount,
    notificationCenterOpen,
    setNotificationCenterOpen,
    setNotificationStreamConnected,
    setNotificationStreamError,
  } = useNotificationsSlice();
  const filterPopoverRef = useRef(null);
  const assigneeOverflowRef = useRef(null);
  const createTaskDescriptionRef = useRef(null);
  const latestSettingsProjectIdRef = useRef("");
  const latestProjectIdRef = useRef("");
  const boardRequestSeqRef = useRef(0);
  const backlogRequestSeqRef = useRef(0);
  const backlogRowsRequestSeqRef = useRef(0);
  const allTasksRequestSeqRef = useRef(0);
  const sprintsRequestSeqRef = useRef(0);
  const projectsPageRequestSeqRef = useRef(0);
  const usersPageRequestSeqRef = useRef(0);
  const dashboardRequestSeqRef = useRef(0);
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
  const [projectNameHintById, setProjectNameHintById] = useState<any>({});
  const [activeSprintNameHintByProjectId, setActiveSprintNameHintByProjectId] =
    useState<any>({});
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
    await loadNotificationsController({ setNotifications, setUnreadCount });
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
    await registerPushSubscriptionApi(subscription);
  }, []);

  const unregisterPushNotifications = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = String(subscription.endpoint || "");
    if (endpoint) {
      await removePushSubscriptionApi(endpoint).catch(() => {});
    }
    await subscription.unsubscribe().catch(() => {});
  }, []);

  const handleToggleNotificationCenter = useCallback(() => {
    setNotificationCenterOpen((open) => !open);
    registerPushNotifications().catch(() => {});
  }, [registerPushNotifications, setNotificationCenterOpen]);

  const openTask = useCallback(
    async (taskId) => {
      const bundle = await fetchTaskBundleApi(taskId);
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
      const projectKey = String(currentProjectId);
      const projectName = String(project.name);
      setProjectNameHintById((prev) => {
        if (String(prev?.[projectKey] || "") === projectName) return prev;
        return {
          ...prev,
          [projectKey]: projectName,
        };
      });
    }
  }, [projects, currentProjectId]);
  useEffect(() => {
    if (!currentProjectId || !activeSprintName) return;
    const projectKey = String(currentProjectId);
    const sprintName = String(activeSprintName);
    setActiveSprintNameHintByProjectId((prev) => {
      if (String(prev?.[projectKey] || "") === sprintName) return prev;
      return {
        ...prev,
        [projectKey]: sprintName,
      };
    });
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
    return projects;
  }, [projects]);
  const sidebarProjects = useMemo(() => {
    if (!currentUser) return [];
    return projects.filter((project) =>
      (project.members || []).some(
        (member) => String(member.id) === String(currentUser.id),
      ),
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
          : await fetchProjectSettingsApi(id);
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
        const repos = await fetchGithubProjectReposApi(id);
        const hasRepo = Array.isArray(repos) && repos.length > 0;
        if (currentUser?.role === "admin") {
          const appGitHub = await fetchGithubAppSettingsApi();
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
    await fetchMyAssignedTasksController({
      token,
      currentUser,
      dashboardRequestSeqRef,
      setDashboardData,
      setDashboardAssignedTasks,
    });
  };

  const refreshProjectsList = useCallback(async () => {
    await refreshProjectsListController({ token, setProjects });
  }, [token, setProjects]);

  const fetchBootstrap = async () => {
    await fetchBootstrapController({
      setLoading,
      setError,
      setDashboardData,
      setDashboardAssignedTasks,
      setCurrentUser,
      setUsers,
      setProjects,
      setUserGroups,
    });
  };

  const fetchProjectsPage = useCallback(
    async ({ reset = false }: any = {}) => {
      await fetchProjectsPageController(
        { reset },
        {
          token,
          projectsPageRequestSeqRef,
          projectsNextCursor,
          projectsHasMore,
          projectsLoadingMore,
          setProjectsLoadingMore,
          setProjectsPageItems,
          setProjectsNextCursor,
          setProjectsHasMore,
        },
      );
    },
    [token, projectsNextCursor, projectsHasMore, projectsLoadingMore],
  );

  const fetchUsersPage = useCallback(
    async ({ reset = false }: any = {}) => {
      await fetchUsersPageController(
        { reset },
        {
          token,
          usersPageRequestSeqRef,
          usersNextCursor,
          usersHasMore,
          usersLoadingMore,
          showDisabledUsersFilter,
          setUsersLoadingMore,
          setUsersPageItems,
          setUsersNextCursor,
          setUsersHasMore,
        },
      );
    },
    [token, usersNextCursor, usersHasMore, usersLoadingMore, showDisabledUsersFilter],
  );

  const fetchProjectSettings = async (projectId) => {
    await fetchProjectSettingsController(projectId, {
      latestSettingsProjectIdRef,
      setProjectSettings,
    });
  };

  const fetchBoard = async (
    sprintId,
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
    options: AnyRecord = {},
  ) => {
    return fetchBoardController(sprintId, projectId, activeFilters, options, {
      boardRequestSeqRef,
      latestProjectIdRef,
      setColumns,
      setBoardTotalsByStatus,
      setBoardNextCursor,
      setBoardHasMore,
      setActiveSprintNameHintByProjectId,
    });
  };

  const fetchBacklog = async (
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
    sprintId = selectedSprintId,
    options: AnyRecord = {},
  ) => {
    await fetchBacklogController(projectId, activeFilters, sprintId, options, {
      backlogRequestSeqRef,
      latestProjectIdRef,
      setBacklogTasks,
      setBacklogNextCursor,
      setBacklogHasMore,
    });
  };
  const fetchBacklogRows = async (
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
    sprintId = selectedSprintId,
  ) => {
    return fetchBacklogRowsController(
      projectId,
      activeFilters,
      sprintId,
      {
        backlogRowsRequestSeqRef,
        latestProjectIdRef,
        setBacklogRowsData,
      } as any,
    );
  };

  const fetchAllTasks = async (
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
    sprintId = selectedSprintId,
    options: AnyRecord = {},
  ) => {
    await fetchAllTasksController(projectId, activeFilters, sprintId, options, {
      allTasksRequestSeqRef,
      latestProjectIdRef,
      setAllTasks,
    });
  };

  const fetchSprints = async (projectId = currentProjectId) => {
    return fetchSprintsController(projectId, {
      sprintsRequestSeqRef,
      latestProjectIdRef,
      setSprints,
    });
  };

  const fetchSprintTasks = async (sprintId, projectId = currentProjectId) => {
    await fetchSprintTasksController(sprintId, projectId, { setSprintTasks });
  };

  const fetchSummaryOverview = useCallback(
    async (projectId, fromDate, toDate, signal?: AbortSignal) => {
      return fetchSummaryOverviewController(projectId, fromDate, toDate, signal);
    },
    [],
  );

  const fetchSummarySprint = useCallback(
    async (projectId, fromDate, toDate, signal?: AbortSignal) => {
      return fetchSummarySprintController(projectId, fromDate, toDate, signal);
    },
    [],
  );

  const fetchSummaryFlow = useCallback(
    async (projectId, fromDate, toDate, signal?: AbortSignal, interval = "week") => {
      return fetchSummaryFlowController(projectId, fromDate, toDate, interval, signal);
    },
    [],
  );

  const fetchSummaryWorkload = useCallback(
    async (projectId, fromDate, toDate, signal?: AbortSignal) => {
      return fetchSummaryWorkloadController(projectId, fromDate, toDate, signal);
    },
    [],
  );

  const exportSummaryReport = useCallback(
    async (type, projectId, fromDate, toDate) => {
      await exportSummaryReportController(type, projectId, fromDate, toDate, {
        notify,
      });
    },
    [notify],
  );

  const refreshViews = async (
    sprintId = selectedSprintId,
    projectId = currentProjectId,
    activeFilters = debouncedFilters,
  ) => {
    await refreshViewsController(sprintId, projectId, activeFilters, {
      activeView,
      sprints,
      fetchSprints,
      fetchBoard,
      fetchBacklog,
      fetchBacklogRows,
      setColumns,
      setBoardTotalsByStatus,
      setBacklogTasks,
      setBacklogRowsData,
      setSprints,
      setSprintTasks,
      setSelectedSprintId,
    });
  };

  const loadMoreProjects = useCallback(async () => {
    await fetchProjectsPage({ reset: false });
  }, [fetchProjectsPage]);

  const loadMoreUsers = useCallback(async () => {
    await fetchUsersPage({ reset: false });
  }, [fetchUsersPage]);

  const loadMoreBoard = useCallback(async () => {
    await loadMoreBoardController({
      boardHasMore,
      boardLoadingMore,
      boardNextCursor,
      currentProjectId,
      debouncedFilters,
      setBoardLoadingMore,
      fetchBoard,
    });
  }, [
    boardHasMore,
    boardLoadingMore,
    boardNextCursor,
    fetchBoard,
    currentProjectId,
    debouncedFilters,
  ]);

  const loadMoreBacklog = useCallback(async () => {
    await loadMoreBacklogController({
      backlogHasMore,
      backlogLoadingMore,
      backlogNextCursor,
      currentProjectId,
      debouncedFilters,
      selectedSprintId,
      setBacklogLoadingMore,
      fetchBacklog,
    });
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
  }: any = {}) => {
    await refetchAfterCrudController(
      { includeBootstrap, includeProject, includeDashboard, projectId },
      {
        token,
        currentUser,
        selectedSprintId,
        debouncedFilters,
        fetchBootstrap,
        fetchProjectSettings,
        refreshViews,
        fetchMyAssignedTasks,
        setProjectSettings,
      },
    );
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
    fetchProjectSettingsApi(taskDrawerProjectId)
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
      location.pathname !== "/"
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
        navigate("/dashboard");
        return;
      }
      if (key === "projects") {
        navigate("/projects");
        return;
      }
      if (key === "users") {
        navigate("/users");
        return;
      }
      if (key === "profile") {
        navigate("/profile");
        return;
      }
      if (key === "app-settings") {
        navigate("/settings");
        return;
      }
    },
    [navigate],
  );

  const handleNavigateProject = useCallback(
    (projectId, subview) => {
      const id = String(projectId);
      const targetSubview = String(subview || "board");
      const nextProject = projects.find((project) => String(project.id) === id);
      if (nextProject?.name) {
        const nextName = String(nextProject.name);
        setProjectNameHintById((prev) => {
          if (String(prev?.[id] || "") === nextName) return prev;
          return { ...prev, [id]: nextName };
        });
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
        navigate(`/project/${id}/board`);
        return;
      }
      if (targetSubview === "board" || targetSubview === "backlog") {
        if (!userManagesProject(id)) {
          lastReadinessBlockRef.current = "";
          setCurrentProjectId(id);
          setSelectedSprintId("");
          navigate(`/project/${id}/${targetSubview}`);
          return;
        }
      }
      lastReadinessBlockRef.current = "";
      setCurrentProjectId(id);
      setSelectedSprintId("");
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
    await handleLogin(
      { email, password },
      {
        setAuthLoading,
        setError,
        setToken,
        setCurrentUser,
        setMustChangePassword,
        setActiveView,
        navigate,
        setStoredToken,
      },
    );
  };

  const register = async ({ name, email, password }) => {
    await handleRegister(
      { name, email, password },
      {
        setAuthLoading,
        setError,
        setToken,
        setCurrentUser,
        setMustChangePassword,
        setActiveView,
        navigate,
        setStoredToken,
      },
    );
  };

  const forgotPassword = async ({ email }) => {
    await handleForgotPassword({ email }, { setAuthLoading, setError, notify });
  };

  const resetPassword = async ({ token: resetToken, password }) => {
    await handleResetPassword(
      { token: resetToken, password },
      { setAuthLoading, setError, notify },
    );
  };

  const changePassword = async ({ name, currentPassword, newPassword }) => {
    await handleChangePassword(
      { name, currentPassword, newPassword },
      {
        setAuthLoading,
        setError,
        setMustChangePassword,
        setActiveView,
        navigate,
        notify,
      },
    );
  };

  const changePasswordFromProfile = async ({
    currentPassword,
    newPassword,
  }) => {
    await handleChangePasswordFromProfile(
      { currentPassword, newPassword },
      { notify },
    );
  };

  const updateProfileInfo = async ({ name, email }) => {
    await handleUpdateProfileInfo({ name, email }, { notify, setCurrentUser });
  };

  const logout = async () => {
    await handleLogout({
      unregisterPushNotifications,
      setStoredToken,
      setToken,
      setCurrentUser,
      setUsers,
      setUserGroups,
      setProjects,
      setProjectSettings,
      setSprints,
      setSprintTasks,
      setColumns,
      setBoardTotalsByStatus,
      setBacklogTasks,
      setAllTasks,
      setDashboardAssignedTasks,
      setDashboardData,
      setSelectedSprintId,
      setCurrentProjectId,
      setTaskTitle,
      setStoryPoints,
      setTaskDueDate,
      setAssigneeId,
      setTaskPriority,
      setTaskType,
      setTaskLabel,
      setTaskVersion,
      setShowCreateTaskModal,
      setShowFilterModal,
      setShowAssigneeOverflow,
      setFilterDraft,
      setFilters,
      setNotifications,
      setUnreadCount,
      setNotificationCenterOpen,
      setNotificationStreamConnected,
      setNotificationStreamError,
      setActiveView,
      setError,
      setTaskBundle,
      setMustChangePassword,
      navigate,
    });
  };

  const createTask = async (event) => {
    await createTaskController(event, {
      canManageProject,
      taskTitle,
      taskType,
      currentProjectId,
      activeView,
      activeSprintId,
      createTaskSprintId,
      createTaskDefaultStatus,
      storyPoints,
      taskDueDate,
      taskPriority,
      taskLabel,
      taskVersion,
      assigneeId,
      createTaskDescriptionRef,
      setCreateTaskFieldErrors,
      setTaskTitle,
      setStoryPoints,
      setTaskDueDate,
      setAssigneeId,
      setTaskPriority,
      setTaskType,
      setTaskLabel,
      setTaskVersion,
      setCreateTaskSprintId,
      setShowCreateTaskModal,
      notify,
      refetchAfterCrud,
      requiredFieldMessage: REQUIRED_FIELD_MESSAGE,
    });
  };

  const moveTask = async (
    taskId,
    status,
    { suppressErrorToast = false }: any = {},
  ) => {
    await moveTaskController(
      taskId,
      status,
      { suppressErrorToast },
      { notify, refetchAfterCrud },
    );
  };

  const markNotificationRead = useCallback(
    async (notificationId) => {
      await markNotificationReadController(notificationId, {
        reload: loadNotifications,
      });
    },
    [loadNotifications],
  );

  const markAllNotificationsRead = useCallback(async () => {
    await markAllNotificationsReadController({
      reload: loadNotifications,
    });
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

  const searchGlobalTasks = useCallback(async (query, cursor = "") => {
    const term = String(query || "").trim();
    if (!term) return { items: [], nextCursor: "", hasMore: false };
    const data = await searchTasksApi(term, { scope: "global", cursor, limit: 20 });
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextCursor: String(data?.nextCursor || ""),
      hasMore: Boolean(data?.hasMore),
    };
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

  const saveTask = async (taskId, patch, options: AnyRecord = {}) => {
    await saveTaskController(taskId, patch, options, {
      taskBundle,
      openTask,
      refetchAfterCrud,
      notify,
    });
  };

  const addComment = async (taskId, body) => {
    await addCommentController(taskId, body, { openTask, refetchAfterCrud });
  };
  const updateComment = async (taskId, commentId, body) => {
    await updateCommentController(taskId, commentId, body, {
      openTask,
      refetchAfterCrud,
    });
  };
  const deleteComment = async (taskId, commentId) => {
    await deleteCommentController(taskId, commentId, {
      requestConfirmation,
      openTask,
      refetchAfterCrud,
    });
  };

  const uploadTaskAsset = async (file) => {
    return uploadTaskAssetController(file);
  };

  const createUser = async (payload) => {
    await createUserController(payload, { notify, refetchAfterCrud });
  };

  const updateUser = async (userId, draft) => {
    await updateUserController(userId, draft, { notify, refetchAfterCrud });
  };

  const disableUser = async (userId) => {
    await disableUserController(userId, {
      notify,
      refetchAfterCrud,
      requestConfirmation,
    });
  };

  const enableUser = async (userId) => {
    await enableUserController(userId, {
      notify,
      refetchAfterCrud,
      requestConfirmation,
    });
  };

  const createUserGroup = async (payload) => {
    await createUserGroupController(payload, { notify, refetchAfterCrud });
  };

  const updateUserGroup = async (groupId, payload) => {
    await updateUserGroupController(groupId, payload, { notify, refetchAfterCrud });
  };

  const deleteUserGroup = async (groupId) => {
    await deleteUserGroupController(groupId, {
      notify,
      refetchAfterCrud,
      requestConfirmation,
    });
  };

  const createSprint = async (draft) => {
    return createSprintController(draft, {
      currentProjectId,
      notify,
      refetchAfterCrud,
      setSprints,
    });
  };

  const _updateSprint = async (sprintId, draft) => {
    await updateSprintController(sprintId, draft, {
      notify,
      refetchAfterCrud,
      setSprints,
    });
  };

  const createProject = async (payload) => {
    return createProjectController(payload, {
      notify,
      refetchAfterCrud,
      setProjects,
      setCurrentProjectId,
      setActiveView,
      navigate,
    });
  };

  const updateProject = async (projectId, draft) => {
    return updateProjectController(projectId, draft, {
      notify,
      refetchAfterCrud,
      setProjects,
    });
  };

  const deleteProject = async (projectId) => {
    await deleteProjectController(projectId, {
      notify,
      refetchAfterCrud,
      requestConfirmation,
      currentProjectId,
      setProjects,
      setCurrentProjectId,
      setActiveView,
      navigate,
    });
  };

  const deleteTask = async (taskId) => {
    await deleteTaskController(taskId, {
      notify,
      taskBundle,
      setTaskBundle,
      refetchAfterCrud,
      requestConfirmation,
    });
  };

  const saveProjectSettings = async (nextSettings) => {
    return saveProjectSettingsController(currentProjectId, nextSettings, {
      notify,
      refetchAfterCrud,
      setProjectSettings,
    });
  };

  const saveProjectMembers = async (memberIds, projectAdminMemberIds) => {
    return saveProjectMembersController(
      currentProjectId,
      memberIds,
      projectAdminMemberIds,
      {
        notify,
        refetchAfterCrud,
        setProjects,
      },
    );
  };

  const startSprint = async (sprintId) => {
    await startSprintController(sprintId, {
      currentProjectId,
      notify,
      refetchAfterCrud,
      setSprints,
    });
  };

  const completeSprint = async (sprintId, moveIncompleteToSprintId = null) => {
    await completeSprintController(sprintId, moveIncompleteToSprintId, {
      currentProjectId,
      refetchAfterCrud,
      setSprints,
    });
  };

  const deleteSprint = async (sprintId) => {
    await deleteSprintController(sprintId, {
      currentProjectId,
      refetchAfterCrud,
      setSprints,
    });
  };

  const assignTaskToSprintFromBacklog = async (taskId, sprintId) => {
    await assignTaskToSprintFromBacklogController(taskId, sprintId, {
      notify,
      refetchAfterCrud,
    });
  };

  const _addTasksToSprint = async (sprintId, taskIds) => {
    await addTasksToSprintController(sprintId, taskIds, {
      currentProjectId,
      filters,
      fetchBacklog,
      fetchSprintTasks,
      fetchBoard,
    });
  };

  const _removeTaskFromSprint = async (sprintId, taskId) => {
    await removeTaskFromSprintController(sprintId, taskId, {
      currentProjectId,
      filters,
      fetchBacklog,
      fetchSprintTasks,
      fetchBoard,
    });
  };
  const dashboardRecentTasks = useMemo(
    () =>
      Array.isArray(dashboardData?.recentTasks) ? dashboardData.recentTasks : null,
    [dashboardData?.recentTasks],
  );
  const dashboardBucketCounts = useMemo(
    () => (dashboardData?.bucketCounts ? dashboardData.bucketCounts : null),
    [dashboardData?.bucketCounts],
  );
  const dashboardProjectCards = useMemo(
    () =>
      Array.isArray(dashboardData?.projectCards) ? dashboardData.projectCards : null,
    [dashboardData?.projectCards],
  );

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

  const safeColumns = useMemo(() => {
    const source = columns.length
      ? [...columns]
      : workflowStages.map((s) => ({
          status: s.key,
          name: s.name,
          description: s.description,
          counterGroup: s.counterGroup,
          tasks: [],
        }));
    return source.sort((a, b) => {
      const rank = { upcoming: 0, active: 1, done: 2 };
      const aRank = rank[a.counterGroup] ?? 1;
      const bRank = rank[b.counterGroup] ?? 1;
      if (aRank !== bRank) return aRank - bRank;
      return 0;
    });
  }, [columns, workflowStages]);
  const scopedSearchLabel = activeView === "backlog" ? "Search backlog" : "Search board";
  const scopedClearSearchLabel =
    activeView === "backlog" ? "Clear backlog search" : "Clear board search";
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
                <div className="flex flex-wrap items-center gap-[0.6rem] max-[1024px]:flex-col max-[1024px]:items-stretch">
                  <div className="flex min-w-0 flex-1 basis-[800px] items-center gap-[0.4rem] rounded border border-[#d6dce8] bg-[#f7f8fa] px-2 py-[0.3rem] max-[1024px]:min-w-[250px] max-[1024px]:basis-auto max-[640px]:w-full">
                    <span className="text-[#6b778c]">
                      <Icon name="search" size={15} />
                    </span>
                    <input
                      className="w-full border-none bg-transparent p-0 shadow-none focus:border-transparent focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                      placeholder={scopedSearchLabel}
                      value={filters.search}
                      onChange={(event) =>
                        setFilters((prev) => ({
                          ...prev,
                          search: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        setFilters((prev) => ({ ...prev, search: "" }));
                      }}
                    />
                    {String(filters.search || "").trim() ? (
                      <button
                        type="button"
                        aria-label={scopedClearSearchLabel}
                        className="grid h-5 w-5 place-items-center rounded text-[0.72rem] font-semibold text-[#6b778c] hover:bg-[#e9edf3] hover:text-[#253858]"
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            search: "",
                          }))
                        }
                      >
                        x
                      </button>
                    ) : null}
                  </div>
                  <div
                    className="relative min-w-0 shrink-0 max-w-[min(46vw,360px)] max-[1024px]:max-w-none max-[640px]:order-2 max-[640px]:w-full"
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
                  <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 max-[1024px]:ml-0 max-[640px]:order-3 max-[640px]:w-full max-[640px]:justify-end">
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
              recentTasks={dashboardRecentTasks}
              bucketCounts={dashboardBucketCounts}
              projectCards={dashboardProjectCards}
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
                        if ((event.target as HTMLElement | null)?.closest?.("button")) event.preventDefault();
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
                        <option value="">Select work type</option>
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
