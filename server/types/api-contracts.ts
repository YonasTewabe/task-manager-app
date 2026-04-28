export interface AuthJwtPayload {
  userId: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export interface GithubSettingsDto {
  githubOrg?: string;
  githubToken?: string;
  githubWebhookSecret?: string;
}

export interface PaginationQueryDto {
  cursor?: string;
  limit?: string | number;
}

export interface TaskQueryDto extends PaginationQueryDto {
  projectId?: string;
  sprintId?: string;
  assigneeId?: string;
  assigneeIds?: string | string[];
  priority?: string;
  status?: string;
  type?: string;
  search?: string;
  label?: string;
}
