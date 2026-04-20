# Task Manager (Jira-Inspired)

Jira-like task management foundation with:

- JWT authentication + role-based permissions (`admin`, `member`)
- User management
- Sprint management (create, start, complete)
- Backlog + board workflow (`todo`, `in_progress`, `done`)
- Task assignment + story points + comments + activity tracking
- GitHub/Jenkins integration routes preserved

## Setup

### 1) Install dependencies

```bash
npm install
cd server
npm install
```

### 2) Configure environment files

Copy `env.example` to `.env` in the repository root and `server/env.example` to `server/.env`.

### 3) Run locally

```bash
# run both frontend and backend from root
npm run dev:full
```

### 4) Seed demo data (optional)

```bash
cd server
npm run seed
```

Default seed admin:

- email: `admin@local.dev`
- password: `Admin123!`

## API Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/task-management/bootstrap`
- `GET /api/task-management/users`
- `POST /api/task-management/users` (admin)
- `GET /api/task-management/sprints`
- `POST /api/task-management/sprints` (admin)
- `PATCH /api/task-management/sprints/:sprintId` (admin)
- `POST /api/task-management/sprints/:sprintId/start` (admin)
- `POST /api/task-management/sprints/:sprintId/complete` (admin)
- `GET /api/task-management/backlog`
- `GET /api/task-management/board?sprintId=<id|backlog>`
- `GET /api/task-management/tasks`
- `POST /api/task-management/tasks`
- `GET /api/task-management/tasks/:taskId`
- `PATCH /api/task-management/tasks/:taskId`
- `PATCH /api/task-management/tasks/:taskId/move`
- `DELETE /api/task-management/tasks/:taskId`
- `POST /api/task-management/tasks/:taskId/comments`
- `GET /api/github/repos`
- `GET /api/github/branches?repo=<repo>&org=<org>`
- `POST /api/github/create-pr`
- `POST /api/github/pr-status`
- `GET /api/jenkins/test`
- `GET /api/jenkins/test-connection`
- `POST /api/jenkins/trigger-job`
