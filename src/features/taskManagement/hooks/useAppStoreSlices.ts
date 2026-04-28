import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../../store/appStore";

export function useSessionSlice() {
  return useAppStore(
    useShallow((state) => ({
      token: state.token,
      setToken: state.setToken,
      authLoading: state.authLoading,
      setAuthLoading: state.setAuthLoading,
      currentUser: state.currentUser,
      setCurrentUser: state.setCurrentUser,
      loading: state.loading,
      setLoading: state.setLoading,
      error: state.error,
      setError: state.setError,
      authMode: state.authMode,
      setAuthMode: state.setAuthMode,
      setResetPasswordForm: state.setResetPasswordForm,
    })),
  );
}

export function usePlanningDataSlice() {
  return useAppStore(
    useShallow((state) => ({
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
      activeView: state.activeView,
      setActiveView: state.setActiveView,
      dashboardAssignedTasks: state.dashboardAssignedTasks,
      setDashboardAssignedTasks: state.setDashboardAssignedTasks,
      filters: state.filters,
      setFilters: state.setFilters,
      filterDraft: state.filterDraft,
      setFilterDraft: state.setFilterDraft,
    })),
  );
}

export function useTaskFormSlice() {
  return useAppStore(
    useShallow((state) => ({
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
    })),
  );
}

export function useTaskDrawerSlice() {
  return useAppStore(
    useShallow((state) => ({
      taskBundle: state.taskBundle,
      setTaskBundle: state.setTaskBundle,
    })),
  );
}

export function useNotificationsSlice() {
  return useAppStore(
    useShallow((state) => ({
      notifications: state.notifications,
      setNotifications: state.setNotifications,
      unreadCount: state.unreadCount,
      setUnreadCount: state.setUnreadCount,
      notificationCenterOpen: state.notificationCenterOpen,
      setNotificationCenterOpen: state.setNotificationCenterOpen,
      setNotificationStreamConnected: state.setNotificationStreamConnected,
      setNotificationStreamError: state.setNotificationStreamError,
    })),
  );
}
