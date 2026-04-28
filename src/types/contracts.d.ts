export type Id = string;

export interface ApiError {
  error: string;
}

export interface AuthUser {
  id: Id;
  name: string;
  email: string;
  role: "admin" | "member" | string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  authState?: "ok" | "force_password_change";
  mustChangePassword?: boolean;
}

export interface TaskSummary {
  id: Id;
  title: string;
  projectId: Id;
  status: string;
  priority: string;
  assigneeId?: Id | null;
  sprintId?: Id | null;
  updatedAt?: string;
  rowVersion?: number;
}
