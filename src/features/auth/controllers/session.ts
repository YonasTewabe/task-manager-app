export async function handleLogout(
  deps: {
    unregisterPushNotifications: () => Promise<void>;
    setStoredToken: (v: string) => void;
    setToken: (v: string) => void;
    setCurrentUser: (v: AnyRecord | null) => void;
    setUsers: (v: AnyRecord[]) => void;
    setUserGroups: (v: AnyRecord[]) => void;
    setProjects: (v: AnyRecord[]) => void;
    setProjectSettings: (v: AnyRecord | null) => void;
    setSprints: (v: AnyRecord[]) => void;
    setSprintTasks: (v: AnyRecord[]) => void;
    setColumns: (v: AnyRecord[]) => void;
    setBoardTotalsByStatus: (v: AnyRecord) => void;
    setBacklogTasks: (v: AnyRecord[]) => void;
    setAllTasks: (v: AnyRecord[]) => void;
    setDashboardAssignedTasks: (v: AnyRecord[]) => void;
    setDashboardData: (v: AnyRecord | null) => void;
    setSelectedSprintId: (v: string) => void;
    setCurrentProjectId: (v: string) => void;
    setTaskTitle: (v: string) => void;
    setStoryPoints: (v: string) => void;
    setTaskDueDate: (v: string) => void;
    setAssigneeId: (v: string) => void;
    setTaskPriority: (v: string) => void;
    setTaskType: (v: string) => void;
    setTaskLabel: (v: string) => void;
    setTaskVersion: (v: string) => void;
    setShowCreateTaskModal: (v: boolean) => void;
    setShowFilterModal: (v: boolean) => void;
    setShowAssigneeOverflow: (v: boolean) => void;
    setFilterDraft: (v: AnyRecord) => void;
    setFilters: (v: AnyRecord) => void;
    setNotifications: (v: AnyRecord[]) => void;
    setUnreadCount: (v: number) => void;
    setNotificationCenterOpen: (v: boolean) => void;
    setNotificationStreamConnected: (v: boolean) => void;
    setNotificationStreamError: (v: string) => void;
    setActiveView: (v: string) => void;
    setError: (v: string) => void;
    setTaskBundle: (v: AnyRecord | null) => void;
    setMustChangePassword: (v: boolean) => void;
    navigate: (to: string, opts?: AnyRecord) => void;
  },
) {
  // Do not block logout UI transitions on browser push APIs.
  Promise.resolve()
    .then(() => deps.unregisterPushNotifications())
    .catch(() => {});
  deps.setStoredToken("");
  deps.setToken("");
  deps.setCurrentUser(null);
  deps.setUsers([]);
  deps.setUserGroups([]);
  deps.setProjects([]);
  deps.setProjectSettings(null);
  deps.setSprints([]);
  deps.setSprintTasks([]);
  deps.setColumns([]);
  deps.setBoardTotalsByStatus({});
  deps.setBacklogTasks([]);
  deps.setAllTasks([]);
  deps.setDashboardAssignedTasks([]);
  deps.setDashboardData(null);
  deps.setSelectedSprintId("");
  deps.setCurrentProjectId("");
  deps.setTaskTitle("");
  deps.setStoryPoints("");
  deps.setTaskDueDate("");
  deps.setAssigneeId("");
  deps.setTaskPriority("medium");
  deps.setTaskType("");
  deps.setTaskLabel("");
  deps.setTaskVersion("");
  deps.setShowCreateTaskModal(false);
  deps.setShowFilterModal(false);
  deps.setShowAssigneeOverflow(false);
  deps.setFilterDraft({ sprintId: "", priority: "", label: "", status: "", type: "" });
  deps.setFilters({
    assigneeId: "",
    assigneeIds: [],
    priority: "",
    label: "",
    status: "",
    type: "",
    search: "",
  });
  deps.setNotifications([]);
  deps.setUnreadCount(0);
  deps.setNotificationCenterOpen(false);
  deps.setNotificationStreamConnected(false);
  deps.setNotificationStreamError("");
  deps.setActiveView("dashboard");
  deps.setError("");
  deps.setTaskBundle(null);
  deps.setMustChangePassword(false);
  deps.navigate("/", { replace: true });
}
