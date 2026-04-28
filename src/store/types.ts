export type Updater<T> = T | ((prev: T) => T);

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
}

export interface FilterState {
  assigneeId: string;
  assigneeIds: string[];
  priority: string;
  label: string;
  status: string;
  type: string;
  search: string;
}

export interface FilterDraftState {
  sprintId: string;
  priority: string;
  label: string;
  status: string;
  type: string;
}

export interface AppState {
  [key: string]: any;
  token: string;
  authLoading: boolean;
  currentUser: any | null;
  users: any[];
  userGroups: any[];
  sprints: any[];
  projects: any[];
  projectSettings: any | null;
  columns: any[];
  boardTotalsByStatus: Record<string, number>;
  backlogTasks: any[];
  allTasks: any[];
  sprintTasks: any[];
  selectedSprintId: string;
  currentProjectId: string;
  loading: boolean;
  error: string;
  taskTitle: string;
  storyPoints: string;
  taskDueDate: string;
  assigneeId: string;
  taskPriority: string;
  taskType: string;
  taskLabel: string;
  taskVersion: string;
  showCreateTaskModal: boolean;
  showFilterModal: boolean;
  showAssigneeOverflow: boolean;
  confirmDialog: ConfirmDialogState;
  taskBundle: any | null;
  activeView: string;
  dashboardAssignedTasks: any[];
  filters: FilterState;
  filterDraft: FilterDraftState;
}

export type SliceSetter = (updater: (state: AppState) => Partial<AppState> | AppState) => void;
