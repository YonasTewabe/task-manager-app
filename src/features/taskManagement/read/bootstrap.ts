import {
  fetchBootstrapApi,
  fetchDashboardApi,
  fetchProjectsApi,
  fetchProjectsPageApi,
  fetchUsersPageApi,
} from "../api.js";

export async function fetchMyAssignedTasksController(
  deps: {
    token: string;
    currentUser: AnyRecord | null;
    dashboardRequestSeqRef: { current: number };
    setDashboardData: (value: AnyRecord | null) => void;
    setDashboardAssignedTasks: (value: AnyRecord[]) => void;
  },
) {
  if (!deps.token || !deps.currentUser) return;
  const requestSeq = ++deps.dashboardRequestSeqRef.current;
  try {
    const data = await fetchDashboardApi();
    if (requestSeq !== deps.dashboardRequestSeqRef.current) return;
    deps.setDashboardData(data || null);
    deps.setDashboardAssignedTasks(data?.assignedTasks || []);
  } catch {
    if (requestSeq !== deps.dashboardRequestSeqRef.current) return;
    deps.setDashboardData(null);
    deps.setDashboardAssignedTasks([]);
  }
}

export async function refreshProjectsListController(
  deps: {
    token: string;
    setProjects: (value: AnyRecord[]) => void;
  },
) {
  if (!deps.token) return;
  try {
    const nextProjects = await fetchProjectsApi();
    deps.setProjects(Array.isArray(nextProjects) ? nextProjects : []);
  } catch {
    // Keep current projects list when refresh fails.
  }
}

export async function fetchBootstrapController(
  deps: {
    setLoading: (value: boolean) => void;
    setError: (value: string) => void;
    setDashboardData: (value: AnyRecord | null) => void;
    setDashboardAssignedTasks: (value: AnyRecord[]) => void;
    setCurrentUser: (value: AnyRecord | null) => void;
    setUsers: (value: AnyRecord[]) => void;
    setProjects: (value: AnyRecord[]) => void;
    setUserGroups: (value: AnyRecord[]) => void;
  },
) {
  deps.setLoading(true);
  deps.setError("");
  const dashboardPromise = fetchDashboardApi()
    .then((dashboard) => {
      deps.setDashboardData(dashboard || null);
      deps.setDashboardAssignedTasks(dashboard?.assignedTasks || []);
    })
    .catch(() => {
      deps.setDashboardData(null);
      deps.setDashboardAssignedTasks([]);
    });

  try {
    const data = await fetchBootstrapApi();
    deps.setCurrentUser(data.currentUser);
    deps.setUsers(data.users || []);
    deps.setProjects(data.projects || []);
    deps.setUserGroups(data.userGroups || []);
  } catch (err: any) {
    deps.setError(err?.message || "Failed to load bootstrap");
  } finally {
    dashboardPromise.catch(() => {});
    deps.setLoading(false);
  }
}

export async function fetchProjectsPageController(
  { reset = false }: AnyRecord = {},
  deps: {
    token: string;
    projectsPageRequestSeqRef: { current: number };
    projectsNextCursor: string;
    projectsHasMore: boolean;
    projectsLoadingMore: boolean;
    setProjectsLoadingMore: (value: boolean) => void;
    setProjectsPageItems: (updater: (prev: AnyRecord[]) => AnyRecord[]) => void;
    setProjectsNextCursor: (value: string) => void;
    setProjectsHasMore: (value: boolean) => void;
  },
) {
  if (!deps.token) return;
  const requestSeq = ++deps.projectsPageRequestSeqRef.current;
  const nextCursor = reset ? "" : deps.projectsNextCursor;
  if (!reset && (!deps.projectsHasMore || deps.projectsLoadingMore)) return;
  deps.setProjectsLoadingMore(true);
  try {
    const page = await fetchProjectsPageApi(nextCursor, 20);
    if (requestSeq !== deps.projectsPageRequestSeqRef.current) return;
    const incoming = Array.isArray(page?.items) ? page.items : [];
    deps.setProjectsPageItems((prev) => (reset ? incoming : [...prev, ...incoming]));
    deps.setProjectsNextCursor(String(page?.nextCursor || ""));
    deps.setProjectsHasMore(Boolean(page?.hasMore));
  } finally {
    if (requestSeq === deps.projectsPageRequestSeqRef.current) {
      deps.setProjectsLoadingMore(false);
    }
  }
}

export async function fetchUsersPageController(
  { reset = false }: AnyRecord = {},
  deps: {
    token: string;
    usersPageRequestSeqRef: { current: number };
    usersNextCursor: string;
    usersHasMore: boolean;
    usersLoadingMore: boolean;
    showDisabledUsersFilter: boolean;
    setUsersLoadingMore: (value: boolean) => void;
    setUsersPageItems: (updater: (prev: AnyRecord[]) => AnyRecord[]) => void;
    setUsersNextCursor: (value: string) => void;
    setUsersHasMore: (value: boolean) => void;
  },
) {
  if (!deps.token) return;
  const requestSeq = ++deps.usersPageRequestSeqRef.current;
  const nextCursor = reset ? "" : deps.usersNextCursor;
  if (!reset && (!deps.usersHasMore || deps.usersLoadingMore)) return;
  deps.setUsersLoadingMore(true);
  try {
    const page = await fetchUsersPageApi({
      cursor: nextCursor,
      isActive: !deps.showDisabledUsersFilter,
      limit: 25,
    });
    if (requestSeq !== deps.usersPageRequestSeqRef.current) return;
    const incoming = Array.isArray(page?.items) ? page.items : [];
    deps.setUsersPageItems((prev) => (reset ? incoming : [...prev, ...incoming]));
    deps.setUsersNextCursor(String(page?.nextCursor || ""));
    deps.setUsersHasMore(Boolean(page?.hasMore));
  } finally {
    if (requestSeq === deps.usersPageRequestSeqRef.current) {
      deps.setUsersLoadingMore(false);
    }
  }
}
