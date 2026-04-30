# Task Manager App

This app is a Jira-inspired project management application for planning work, running sprints, and tracking team delivery.  
It includes a React + Vite frontend and a Node.js + Express backend with PostgreSQL via Prisma.

## Overview

This app helps teams:

- plan and prioritize work in a backlog
- execute tasks inside active sprints
- manage task flow on a kanban-style board (`todo`, `in_progress`, `done`)
- collaborate with comments, assignment, and activity history
- control access with role-based permissions (`admin`, `member`)

## Features

- JWT authentication and role-aware authorization
- User management for team administration
- Sprint lifecycle support (create, start, complete)
- Task CRUD with assignees and story points
- Board and backlog views for day-to-day delivery tracking
- Optional GitHub and Jenkins integration paths in the backend

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Zustand, React Router
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Other:** JWT auth, Nodemailer, Web Push

## Project Structure

```text
task-manager-app/
  src/                 # Frontend source code
  server/              # Backend API + Prisma schema/migrations
    prisma/
    scripts/seed.ts    # Optional demo data seed script
  env.example          # Frontend environment template
  server/env.example   # Backend environment template
```

## Quick Start

### 1) Install dependencies

```bash
# frontend (root)
npm install

# backend
cd server
npm install
```

### 2) Configure environment variables

Copy templates and add your local values:

- `env.example` -> `.env`
- `server/env.example` -> `server/.env`

### 3) Start the app

From project root:

```bash
npm run dev:full
```

This runs frontend and backend together in development mode.

### 4) (Optional) Seed demo data

```bash
cd server
npm run seed
```

Default seeded admin credentials:

- email: `admin@local.dev`
- password: `Admin123!`

## Common Scripts

### Root (Frontend + orchestration)

- `npm run dev` - start frontend dev server
- `npm run build` - build frontend for production
- `npm run lint` - run frontend lint checks
- `npm run typecheck` - run frontend TypeScript checks
- `npm run server` - run backend dev server from root
- `npm run dev:full` - run frontend + backend together

### Server

- `npm run dev` - start backend in watch mode
- `npm run start` - start backend once
- `npm run typecheck` - run backend TypeScript checks
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate:dev` - run dev DB migrations
- `npm run seed` - seed demo data
- `npm run test` - run backend tests

## Typical Usage Flow

1. Sign in (or use seeded admin account).
2. Create team members (admin only).
3. Create a sprint and add tasks to backlog/sprint.
4. Assign tasks and estimate with story points.
5. Move tasks across board columns as work progresses.
6. Add comments and review activity history.
7. Complete sprint and start next iteration.

## Troubleshooting

- If Prisma/client errors appear, run `npm run prisma:generate` in `server`.
- If DB connection fails, verify `DATABASE_URL` and DB credentials in `server/.env`.
- If CORS issues appear, make sure `CORS_ORIGIN` and `FRONTEND_URL` match your frontend URL.
- If push notifications fail, verify VAPID keys in both root `.env` and `server/.env`.
