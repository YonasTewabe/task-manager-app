-- Comprehensive Baseline Migration: Populating Users, Groups, Projects, Sprints, Tasks, Integrations, Rules & Audit Logs

-- 1. SYSTEM SETTINGS
INSERT INTO "system_settings" (
  "id",
  "board_card_fields",
  "workflow_rules",
  "general_rules",
  "updated_at"
) VALUES (
  '50000000-0000-4000-a000-000000000001',
  '{"workflowStages":[{"key":"blocked","name":"Blocked","description":"Work that cannot proceed due to dependencies or blockers","badge":"Blocked","counterGroup":"upcoming"},{"key":"todo","name":"To Do","description":"Ready to be picked up by the team","badge":"To Do","counterGroup":"upcoming"},{"key":"in_progress","name":"In Progress","description":"Actively being developed","badge":"In Progress","counterGroup":"active"},{"key":"done","name":"Done","description":"Completed and accepted work","badge":"Done","counterGroup":"done"}]}',
  '{"transitions":[{"from":"blocked","to":"todo","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]},{"from":"todo","to":"in_progress","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]},{"from":"in_progress","to":"blocked","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]},{"from":"in_progress","to":"done","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]},{"from":"done","to":"in_progress","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]}]}',
  '{"labels":[{"name":"backend","color":"#3b82f6"},{"name":"frontend","color":"#10b981"},{"name":"api","color":"#06b6d4"},{"name":"database","color":"#8b5cf6"},{"name":"security","color":"#ef4444"},{"name":"devops","color":"#f97316"},{"name":"ui/ux","color":"#ec4899"},{"name":"performance","color":"#f59e0b"},{"name":"bugfix","color":"#84cc16"}],"types":["task","bug","hot-fix","story"],"versions":["v1.0.0","v1.1.0","v1.2.0","v2.0.0"]}',
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

-- 2. APP INTEGRATION SETTINGS
INSERT INTO "app_integration_settings" (
  "id",
  "github_org",
  "github_token",
  "github_webhook_secret",
  "updated_at"
) VALUES (
  1,
  'acme-corp',
  'ghp_mocktoken1234567890abcdefghijklmnopqrstuvwxyz',
  'whsec_mocksupersecret1234567890abcdef',
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO UPDATE SET
  "github_org" = EXCLUDED."github_org",
  "github_token" = EXCLUDED."github_token",
  "github_webhook_secret" = EXCLUDED."github_webhook_secret",
  "updated_at" = CURRENT_TIMESTAMP;

-- 3. USERS
INSERT INTO "users" (
  "id", "name", "email", "password_hash", "role", "is_active", "disable_reason", "disabled_at", "created_at", "updated_at"
) VALUES
  ('00000000-0000-4000-a000-000000000001', 'Admin User', 'admin@local.dev', '$2b$10$tNwujbXMYwaz9IHfE5uPs.YWUOMefbkOC8hQt702/8rJ4hAo6yu3O', 'admin', true, '', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-a000-000000000002', 'Sarah Chen', 'sarah.chen@local.dev', '$2b$10$EpzamK9gnhPQzTQP6CIDlOHodsf.KNweqqsqrjZYGoiT0bB3CTohC', 'member', true, '', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-a000-000000000003', 'Alex Rivera', 'alex.rivera@local.dev', '$2b$10$EpzamK9gnhPQzTQP6CIDlOHodsf.KNweqqsqrjZYGoiT0bB3CTohC', 'member', true, '', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-a000-000000000004', 'Elena Rostova', 'elena.rostova@local.dev', '$2b$10$EpzamK9gnhPQzTQP6CIDlOHodsf.KNweqqsqrjZYGoiT0bB3CTohC', 'member', true, '', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-a000-000000000005', 'Marcus Johnson', 'marcus.johnson@local.dev', '$2b$10$EpzamK9gnhPQzTQP6CIDlOHodsf.KNweqqsqrjZYGoiT0bB3CTohC', 'member', true, '', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-a000-000000000006', 'Priya Patel', 'priya.patel@local.dev', '$2b$10$EpzamK9gnhPQzTQP6CIDlOHodsf.KNweqqsqrjZYGoiT0bB3CTohC', 'member', true, '', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-a000-000000000007', 'David Vance (Inactive)', 'dev.archived@local.dev', '$2b$10$EpzamK9gnhPQzTQP6CIDlOHodsf.KNweqqsqrjZYGoiT0bB3CTohC', 'member', false, 'Departed organization (account archived)', '2026-03-15 09:00:00+00', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

-- Link disabled_by for disabled user
UPDATE "users"
SET "disabled_by" = '00000000-0000-4000-a000-000000000001'
WHERE "email" = 'dev.archived@local.dev' AND "disabled_by" IS NULL;

-- 4. USER GROUPS
INSERT INTO "user_groups" ("id", "name", "created_at") VALUES
  ('10000000-0000-4000-a000-000000000001', 'Engineering', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-a000-000000000002', 'Product & Design', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-a000-000000000003', 'Quality Assurance', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-a000-000000000004', 'DevOps & Infrastructure', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 4b. USER GROUP MEMBERS
INSERT INTO "user_group_members" ("group_id", "user_id")
SELECT g.id, u.id FROM "user_groups" g, "users" u
WHERE (g.name = 'Engineering' AND u.email IN ('alex.rivera@local.dev', 'elena.rostova@local.dev', 'marcus.johnson@local.dev'))
   OR (g.name = 'Product & Design' AND u.email IN ('sarah.chen@local.dev'))
   OR (g.name = 'Quality Assurance' AND u.email IN ('priya.patel@local.dev'))
   OR (g.name = 'DevOps & Infrastructure' AND u.email IN ('alex.rivera@local.dev', 'marcus.johnson@local.dev'))
ON CONFLICT ("group_id", "user_id") DO NOTHING;

-- 5. PROJECTS
INSERT INTO "projects" ("id", "name", "project_key", "description", "created_at") VALUES
  ('20000000-0000-4000-a000-000000000001', 'Core Platform Services', 'CORE', 'High-throughput backend microservices, authentication, caching, and data pipelines.', CURRENT_TIMESTAMP),
  ('20000000-0000-4000-a000-000000000002', 'Web Portal Experience', 'WEB', 'Customer dashboard, project board management, analytics, and collaborative workflows.', CURRENT_TIMESTAMP),
  ('20000000-0000-4000-a000-000000000003', 'Mobile App Client', 'MOB', 'Cross-platform mobile client for iOS and Android with push notifications and offline sync.', CURRENT_TIMESTAMP)
ON CONFLICT ("project_key") DO NOTHING;

-- 5b. PROJECT SETTINGS
INSERT INTO "project_settings" ("project_id", "board_card_fields", "workflow_rules", "general_rules", "updated_at")
SELECT
  p.id,
  '{"workflowStages":[{"key":"blocked","name":"Blocked","description":"Work that cannot proceed due to dependencies or blockers","badge":"Blocked","counterGroup":"upcoming"},{"key":"todo","name":"To Do","description":"Ready to be picked up by the team","badge":"To Do","counterGroup":"upcoming"},{"key":"in_progress","name":"In Progress","description":"Actively being developed","badge":"In Progress","counterGroup":"active"},{"key":"done","name":"Done","description":"Completed and accepted work","badge":"Done","counterGroup":"done"}]}',
  '{"transitions":[{"from":"blocked","to":"todo","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]},{"from":"todo","to":"in_progress","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]},{"from":"in_progress","to":"blocked","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]},{"from":"in_progress","to":"done","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]},{"from":"done","to":"in_progress","allowAllUsers":true,"allowedUserIds":[],"allowedGroupIds":[]}]}',
  '{"labels":[{"name":"backend","color":"#3b82f6"},{"name":"frontend","color":"#10b981"},{"name":"api","color":"#06b6d4"},{"name":"database","color":"#8b5cf6"},{"name":"security","color":"#ef4444"},{"name":"devops","color":"#f97316"},{"name":"ui/ux","color":"#ec4899"},{"name":"performance","color":"#f59e0b"},{"name":"bugfix","color":"#84cc16"}],"types":["task","bug","hot-fix","story"],"versions":["v1.0.0","v1.1.0","v1.2.0","v2.0.0"]}',
  CURRENT_TIMESTAMP
FROM "projects" p
WHERE p.project_key IN ('CORE', 'WEB', 'MOB')
ON CONFLICT ("project_id") DO NOTHING;

-- 5c. PROJECT MEMBERS
-- CORE members
INSERT INTO "project_members" ("project_id", "user_id", "is_project_admin")
SELECT p.id, u.id, true
FROM "projects" p, "users" u
WHERE p.project_key = 'CORE' AND u.email IN ('admin@local.dev', 'alex.rivera@local.dev')
ON CONFLICT ("project_id", "user_id") DO UPDATE SET "is_project_admin" = EXCLUDED."is_project_admin";

INSERT INTO "project_members" ("project_id", "user_id", "is_project_admin")
SELECT p.id, u.id, false
FROM "projects" p, "users" u
WHERE p.project_key = 'CORE' AND u.email IN ('sarah.chen@local.dev', 'elena.rostova@local.dev', 'marcus.johnson@local.dev', 'priya.patel@local.dev')
ON CONFLICT ("project_id", "user_id") DO NOTHING;

-- WEB members
INSERT INTO "project_members" ("project_id", "user_id", "is_project_admin")
SELECT p.id, u.id, true
FROM "projects" p, "users" u
WHERE p.project_key = 'WEB' AND u.email IN ('admin@local.dev', 'sarah.chen@local.dev')
ON CONFLICT ("project_id", "user_id") DO UPDATE SET "is_project_admin" = EXCLUDED."is_project_admin";

INSERT INTO "project_members" ("project_id", "user_id", "is_project_admin")
SELECT p.id, u.id, false
FROM "projects" p, "users" u
WHERE p.project_key = 'WEB' AND u.email IN ('alex.rivera@local.dev', 'elena.rostova@local.dev', 'priya.patel@local.dev')
ON CONFLICT ("project_id", "user_id") DO NOTHING;

-- MOB members
INSERT INTO "project_members" ("project_id", "user_id", "is_project_admin")
SELECT p.id, u.id, true
FROM "projects" p, "users" u
WHERE p.project_key = 'MOB' AND u.email IN ('admin@local.dev', 'elena.rostova@local.dev')
ON CONFLICT ("project_id", "user_id") DO UPDATE SET "is_project_admin" = EXCLUDED."is_project_admin";

INSERT INTO "project_members" ("project_id", "user_id", "is_project_admin")
SELECT p.id, u.id, false
FROM "projects" p, "users" u
WHERE p.project_key = 'MOB' AND u.email IN ('sarah.chen@local.dev', 'alex.rivera@local.dev', 'marcus.johnson@local.dev')
ON CONFLICT ("project_id", "user_id") DO NOTHING;

-- 5d. PROJECT GITHUB REPOSITORIES
INSERT INTO "project_github_repos" (
  "id", "project_id", "github_installation_id", "owner", "repo", "default_branch", "is_enabled", "created_at", "updated_at"
)
SELECT
  '60000000-0000-4000-a000-000000000001', p.id, 10001, 'acme-corp', 'core-platform-services', 'main', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'CORE'
ON CONFLICT ("project_id", "owner", "repo") DO NOTHING;

INSERT INTO "project_github_repos" (
  "id", "project_id", "github_installation_id", "owner", "repo", "default_branch", "is_enabled", "created_at", "updated_at"
)
SELECT
  '60000000-0000-4000-a000-000000000002', p.id, 10002, 'acme-corp', 'web-portal-frontend', 'main', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'WEB'
ON CONFLICT ("project_id", "owner", "repo") DO NOTHING;

INSERT INTO "project_github_repos" (
  "id", "project_id", "github_installation_id", "owner", "repo", "default_branch", "is_enabled", "created_at", "updated_at"
)
SELECT
  '60000000-0000-4000-a000-000000000003', p.id, 10003, 'acme-corp', 'mobile-app-client', 'develop', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'MOB'
ON CONFLICT ("project_id", "owner", "repo") DO NOTHING;

-- 5e. PROJECT AUTOMATION RULES
INSERT INTO "project_automation_rules" (
  "id", "project_id", "event_type", "is_enabled", "priority", "conditions_json", "actions_json", "created_at", "updated_at"
)
SELECT
  '70000000-0000-4000-a000-000000000001', p.id, 'branch_created', true, 1, '{"branchScope":"any"}', '{"targetStatus":"in_progress"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'CORE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "project_automation_rules" (
  "id", "project_id", "event_type", "is_enabled", "priority", "conditions_json", "actions_json", "created_at", "updated_at"
)
SELECT
  '70000000-0000-4000-a000-000000000002', p.id, 'pr_opened', true, 2, '{"branchScope":"any","requireTaskKey":true}', '{"targetStatus":"in_progress"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'CORE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "project_automation_rules" (
  "id", "project_id", "event_type", "is_enabled", "priority", "conditions_json", "actions_json", "created_at", "updated_at"
)
SELECT
  '70000000-0000-4000-a000-000000000003', p.id, 'commit_pushed', true, 3, '{"branchScope":"any"}', '{"targetStatus":"in_progress"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'CORE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "project_automation_rules" (
  "id", "project_id", "event_type", "is_enabled", "priority", "conditions_json", "actions_json", "created_at", "updated_at"
)
SELECT
  '70000000-0000-4000-a000-000000000004', p.id, 'pr_merged', true, 4, '{"branchScope":"specific","baseBranch":"main"}', '{"targetStatus":"done"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'CORE'
ON CONFLICT ("id") DO NOTHING;

-- WEB Automation Rules
INSERT INTO "project_automation_rules" (
  "id", "project_id", "event_type", "is_enabled", "priority", "conditions_json", "actions_json", "created_at", "updated_at"
)
SELECT
  '70000000-0000-4000-a000-000000000011', p.id, 'branch_created', true, 1, '{"branchScope":"any"}', '{"targetStatus":"in_progress"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'WEB'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "project_automation_rules" (
  "id", "project_id", "event_type", "is_enabled", "priority", "conditions_json", "actions_json", "created_at", "updated_at"
)
SELECT
  '70000000-0000-4000-a000-000000000012', p.id, 'pr_merged', true, 2, '{"branchScope":"specific","baseBranch":"main"}', '{"targetStatus":"done"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'WEB'
ON CONFLICT ("id") DO NOTHING;

-- 6. SPRINTS
INSERT INTO "sprints" ("id", "name", "project_id", "start_date", "end_date", "status", "created_at")
SELECT '30000000-0000-4000-a000-000000000001', 'CORE Sprint 1 - Foundation & Auth', p.id, '2026-08-01', '2026-08-14', 'completed', CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'CORE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "sprints" ("id", "name", "project_id", "start_date", "end_date", "status", "created_at")
SELECT '30000000-0000-4000-a000-000000000002', 'CORE Sprint 2 - API Optimization & Queue', p.id, '2026-08-15', '2026-08-29', 'active', CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'CORE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "sprints" ("id", "name", "project_id", "start_date", "end_date", "status", "created_at")
SELECT '30000000-0000-4000-a000-000000000003', 'CORE Sprint 3 - Real-time Push & Webhooks', p.id, '2026-08-30', '2026-09-13', 'planned', CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'CORE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "sprints" ("id", "name", "project_id", "start_date", "end_date", "status", "created_at")
SELECT '30000000-0000-4000-a000-000000000004', 'WEB Sprint 1 - Design System & Navigation', p.id, '2026-08-05', '2026-08-19', 'completed', CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'WEB'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "sprints" ("id", "name", "project_id", "start_date", "end_date", "status", "created_at")
SELECT '30000000-0000-4000-a000-000000000005', 'WEB Sprint 2 - Interactive Kanban & Drawer', p.id, '2026-08-20', '2026-09-03', 'active', CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'WEB'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "sprints" ("id", "name", "project_id", "start_date", "end_date", "status", "created_at")
SELECT '30000000-0000-4000-a000-000000000006', 'MOB Sprint 1 - Mobile MVP & Biometrics', p.id, '2026-08-22', '2026-09-05', 'active', CURRENT_TIMESTAMP
FROM "projects" p WHERE p.project_key = 'MOB'
ON CONFLICT ("id") DO NOTHING;

-- 7. TASKS
-- CORE Tasks
INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000001',
  'Design and implement JWT refresh token rotation',
  'Ensure secure token storage with HttpOnly cookies, rotation on refresh, and replay detection.',
  '["Refresh tokens are persisted in hashed format","Replay attempts immediately revoke the entire token family","Access tokens expire in 15 minutes"]',
  'security', 'v1.0.0', 'story', 'urgent', 'done', 5, CURRENT_DATE + INTERVAL '7 days',
  p.id, u_alex.id, s.id, u_sarah.id, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_alex
CROSS JOIN "users" u_sarah
CROSS JOIN "sprints" s
WHERE p.project_key = 'CORE' AND u_alex.email = 'alex.rivera@local.dev' AND u_sarah.email = 'sarah.chen@local.dev' AND s.id = '30000000-0000-4000-a000-000000000001'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000002',
  'Set up PostgreSQL database migrations with Prisma',
  'Create baseline schema migration including users, projects, tasks, and audit indices.',
  '["Prisma schema cleanly models all domain relations","Indexes added for query performance on board views","Foreign key constraints enforce referential integrity"]',
  'database', 'v1.0.0', 'task', 'high', 'done', 3, CURRENT_DATE + INTERVAL '7 days',
  p.id, u_marcus.id, s.id, u_alex.id, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_marcus
CROSS JOIN "users" u_alex
CROSS JOIN "sprints" s
WHERE p.project_key = 'CORE' AND u_marcus.email = 'marcus.johnson@local.dev' AND u_alex.email = 'alex.rivera@local.dev' AND s.id = '30000000-0000-4000-a000-000000000001'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000003',
  'Implement GitHub Webhook HMAC verification and event ingestion',
  'Verify x-hub-signature-256 header on incoming webhooks and route push, PR, and branch events.',
  '["Rejects unsigned or incorrectly signed requests with 401","Extracts task keys matching regex pattern (e.g. CORE-123)","Triggers configured project automation rules idempotently"]',
  'api', 'v1.1.0', 'story', 'urgent', 'in_progress', 8, CURRENT_DATE + INTERVAL '5 days',
  p.id, u_alex.id, s.id, u_sarah.id, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_alex
CROSS JOIN "users" u_sarah
CROSS JOIN "sprints" s
WHERE p.project_key = 'CORE' AND u_alex.email = 'alex.rivera@local.dev' AND u_sarah.email = 'sarah.chen@local.dev' AND s.id = '30000000-0000-4000-a000-000000000002'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000004',
  'Optimize task filtering and pagination queries',
  'Query execution times spike with >1000 tasks per project; introduce compound indexes.',
  '["Index on (projectId, status, updatedAt DESC)","API response time under 40ms for 500 items","Cursor pagination implemented for task history feed"]',
  'performance', 'v1.1.0', 'task', 'high', 'in_progress', 5, CURRENT_DATE + INTERVAL '6 days',
  p.id, u_marcus.id, s.id, u_alex.id, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_marcus
CROSS JOIN "users" u_alex
CROSS JOIN "sprints" s
WHERE p.project_key = 'CORE' AND u_marcus.email = 'marcus.johnson@local.dev' AND u_alex.email = 'alex.rivera@local.dev' AND s.id = '30000000-0000-4000-a000-000000000002'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000005',
  'Resolve race condition in concurrent task status update',
  'Simultaneous drag-and-drop actions can overwrite rowVersion and cause optimistic lock conflicts.',
  '["Atomic update with rowVersion check","Return 409 Conflict with latest task data on stale update","Unit test replicating simultaneous write scenario"]',
  'bugfix', 'v1.1.0', 'bug', 'high', 'blocked', 3, CURRENT_DATE + INTERVAL '3 days',
  p.id, u_marcus.id, s.id, u_priya.id, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_marcus
CROSS JOIN "users" u_priya
CROSS JOIN "sprints" s
WHERE p.project_key = 'CORE' AND u_marcus.email = 'marcus.johnson@local.dev' AND u_priya.email = 'priya.patel@local.dev' AND s.id = '30000000-0000-4000-a000-000000000002'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000006',
  'Implement Web Push notification dispatch worker',
  'Queue web-push notifications asynchronously when users are assigned to high-priority items.',
  '["Supports VAPID protocol with payload encryption","Prunes expired or invalid subscription endpoints (410 Gone)","Batching mechanism prevents rate limit throttling"]',
  'backend', 'v1.2.0', 'story', 'medium', 'todo', 5, CURRENT_DATE + INTERVAL '10 days',
  p.id, u_alex.id, s.id, u_sarah.id, 6, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_alex
CROSS JOIN "users" u_sarah
CROSS JOIN "sprints" s
WHERE p.project_key = 'CORE' AND u_alex.email = 'alex.rivera@local.dev' AND u_sarah.email = 'sarah.chen@local.dev' AND s.id = '30000000-0000-4000-a000-000000000002'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000007',
  'Build automated DB backup and restore verification job',
  'Nightly cron job to snapshot PostgreSQL and test restoring into isolated scratch container.',
  '["Encrypted backups pushed to offsite object storage","Healthcheck alert dispatched to Slack/email on backup failure"]',
  'devops', 'v1.2.0', 'task', 'medium', 'todo', 3, CURRENT_DATE + INTERVAL '14 days',
  p.id, u_marcus.id, NULL, u_admin.id, 7, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_marcus
CROSS JOIN "users" u_admin
WHERE p.project_key = 'CORE' AND u_marcus.email = 'marcus.johnson@local.dev' AND u_admin.email = 'admin@local.dev'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

-- WEB Tasks
INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000011',
  'Establish Tailwind typography and theme design tokens',
  'Define cohesive color palettes, typography scale, borders, and dark mode classes.',
  '["Consistent spacing and color tokens aligned with brand","Accessibility compliance for contrast ratios (WCAG AA)"]',
  'ui/ux', 'v1.0.0', 'task', 'high', 'done', 3, CURRENT_DATE + INTERVAL '7 days',
  p.id, u_elena.id, s.id, u_sarah.id, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_elena
CROSS JOIN "users" u_sarah
CROSS JOIN "sprints" s
WHERE p.project_key = 'WEB' AND u_elena.email = 'elena.rostova@local.dev' AND u_sarah.email = 'sarah.chen@local.dev' AND s.id = '30000000-0000-4000-a000-000000000004'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000012',
  'Build interactive Drag & Drop Kanban board view',
  'Support fluid drag between status columns, optimistic UI updates, and transition restriction warnings.',
  '["Smooth card animation and drag handles","Respects workflow transition permissions defined in settings","Keyboard accessible navigation"]',
  'frontend', 'v1.1.0', 'story', 'urgent', 'in_progress', 8, CURRENT_DATE + INTERVAL '4 days',
  p.id, u_elena.id, s.id, u_sarah.id, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_elena
CROSS JOIN "users" u_sarah
CROSS JOIN "sprints" s
WHERE p.project_key = 'WEB' AND u_elena.email = 'elena.rostova@local.dev' AND u_sarah.email = 'sarah.chen@local.dev' AND s.id = '30000000-0000-4000-a000-000000000005'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000013',
  'Fix layout shift when expanding task details drawer',
  'TaskDrawer causes parent board columns to resize unexpectedly on smaller laptop screens.',
  '["Overlay drawer with fixed right sheet layout","No horizontal viewport overflow or scroll jump"]',
  'bugfix', 'v1.1.0', 'bug', 'medium', 'todo', 2, CURRENT_DATE + INTERVAL '5 days',
  p.id, u_elena.id, s.id, u_priya.id, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_elena
CROSS JOIN "users" u_priya
CROSS JOIN "sprints" s
WHERE p.project_key = 'WEB' AND u_elena.email = 'elena.rostova@local.dev' AND u_priya.email = 'priya.patel@local.dev' AND s.id = '30000000-0000-4000-a000-000000000005'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000014',
  'Implement real-time in-app notification bell and popover',
  'Poll or listen to SSE notification stream and display badge with unread counters.',
  '["Unread notification badge with visual counter","Mark-as-read individual and mark-all-read actions"]',
  'frontend', 'v1.2.0', 'story', 'medium', 'todo', 5, CURRENT_DATE + INTERVAL '12 days',
  p.id, u_elena.id, NULL, u_sarah.id, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_elena
CROSS JOIN "users" u_sarah
WHERE p.project_key = 'WEB' AND u_elena.email = 'elena.rostova@local.dev' AND u_sarah.email = 'sarah.chen@local.dev'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

-- MOB Tasks
INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000021',
  'Integrate biometric authentication (FaceID / Fingerprint)',
  'Allow users to unlock session securely using hardware biometric sensors.',
  '["Fallback to master PIN on biometric failure","Encrypted keychain token storage"]',
  'security', 'v1.0.0', 'story', 'high', 'in_progress', 5, CURRENT_DATE + INTERVAL '7 days',
  p.id, u_elena.id, s.id, u_sarah.id, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_elena
CROSS JOIN "users" u_sarah
CROSS JOIN "sprints" s
WHERE p.project_key = 'MOB' AND u_elena.email = 'elena.rostova@local.dev' AND u_sarah.email = 'sarah.chen@local.dev' AND s.id = '30000000-0000-4000-a000-000000000006'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000022',
  'Offline task caching and optimistic write replay',
  'Queue local task updates in IndexedDB/SQLite while offline and sync when network resumes.',
  '["Conflict resolution logic for concurrently modified tasks","Network connectivity indicator badge"]',
  'frontend', 'v1.0.0', 'task', 'high', 'todo', 8, CURRENT_DATE + INTERVAL '9 days',
  p.id, u_marcus.id, s.id, u_alex.id, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_marcus
CROSS JOIN "users" u_alex
CROSS JOIN "sprints" s
WHERE p.project_key = 'MOB' AND u_marcus.email = 'marcus.johnson@local.dev' AND u_alex.email = 'alex.rivera@local.dev' AND s.id = '30000000-0000-4000-a000-000000000006'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

INSERT INTO "tasks" (
  "id", "title", "description", "acceptance_criteria", "label", "version", "type", "priority", "status", "story_points", "due_date", "project_id", "assignee_id", "sprint_id", "created_by", "task_number", "row_version", "created_at", "updated_at"
)
SELECT
  '40000000-0000-4000-a000-000000000023',
  'Emergency hot-fix for push token registration crash on iOS 18',
  'APNs device token conversion throws TypeError on specific iOS 18 beta builds.',
  '["Safe string conversion for byte array buffer","Graceful degradation if push permission is denied"]',
  'bugfix', 'v1.0.1', 'hot-fix', 'urgent', 'blocked', 2, CURRENT_DATE + INTERVAL '2 days',
  p.id, u_elena.id, s.id, u_priya.id, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN "users" u_elena
CROSS JOIN "users" u_priya
CROSS JOIN "sprints" s
WHERE p.project_key = 'MOB' AND u_elena.email = 'elena.rostova@local.dev' AND u_priya.email = 'priya.patel@local.dev' AND s.id = '30000000-0000-4000-a000-000000000006'
ON CONFLICT ("project_id", "task_number") DO NOTHING;

-- 8. TASK COMMENTS
INSERT INTO "task_comments" ("id", "task_id", "user_id", "body", "created_at")
SELECT
  '80000000-0000-4000-a000-000000000001',
  t.id, u.id,
  'Make sure we support secret rotation seamlessly so webhooks aren''t dropped during maintenance.',
  CURRENT_TIMESTAMP - INTERVAL '24 hours'
FROM "tasks" t, "users" u, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3 AND u.email = 'sarah.chen@local.dev'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "task_comments" ("id", "task_id", "user_id", "body", "created_at")
SELECT
  '80000000-0000-4000-a000-000000000002',
  t.id, u.id,
  'Great point Sarah! I implemented secondary signature verification with fallback to previous secret.',
  CURRENT_TIMESTAMP - INTERVAL '12 hours'
FROM "tasks" t, "users" u, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3 AND u.email = 'alex.rivera@local.dev'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "task_comments" ("id", "task_id", "user_id", "body", "created_at")
SELECT
  '80000000-0000-4000-a000-000000000003',
  t.id, u.id,
  'Tested automated branch trigger payload against local test runner, assertions passed! 🎉',
  CURRENT_TIMESTAMP - INTERVAL '2 hours'
FROM "tasks" t, "users" u, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3 AND u.email = 'priya.patel@local.dev'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "task_comments" ("id", "task_id", "user_id", "body", "created_at")
SELECT
  '80000000-0000-4000-a000-000000000004',
  t.id, u.id,
  'Blocked on reproducing this in CI environment. Marcus, can you share the load test script?',
  CURRENT_TIMESTAMP - INTERVAL '5 hours'
FROM "tasks" t, "users" u, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 5 AND u.email = 'priya.patel@local.dev'
ON CONFLICT ("id") DO NOTHING;

-- 9. TASK ACTIVITIES
INSERT INTO "task_activity" ("id", "task_id", "user_id", "action", "meta", "created_at")
SELECT
  '90000000-0000-4000-a000-000000000001',
  t.id, u.id, 'task_created',
  '{"title":"Implement GitHub Webhook HMAC verification and event ingestion","priority":"urgent"}',
  CURRENT_TIMESTAMP - INTERVAL '48 hours'
FROM "tasks" t, "users" u, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3 AND u.email = 'sarah.chen@local.dev'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "task_activity" ("id", "task_id", "user_id", "action", "meta", "created_at")
SELECT
  '90000000-0000-4000-a000-000000000002',
  t.id, u.id, 'assigned',
  '{"toUser":"alex.rivera@local.dev"}',
  CURRENT_TIMESTAMP - INTERVAL '40 hours'
FROM "tasks" t, "users" u, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3 AND u.email = 'sarah.chen@local.dev'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "task_activity" ("id", "task_id", "user_id", "action", "meta", "created_at")
SELECT
  '90000000-0000-4000-a000-000000000003',
  t.id, u.id, 'status_changed',
  '{"from":"todo","to":"in_progress"}',
  CURRENT_TIMESTAMP - INTERVAL '20 hours'
FROM "tasks" t, "users" u, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3 AND u.email = 'alex.rivera@local.dev'
ON CONFLICT ("id") DO NOTHING;

-- 10. TASK DEV LINKS
INSERT INTO "task_dev_links" (
  "id", "task_id", "provider", "artifact_type", "external_id", "owner", "repo", "url", "title_or_message", "status", "payload_json", "created_at", "updated_at"
)
SELECT
  'a0000000-0000-4000-a000-000000000001',
  t.id, 'github', 'pull_request', '142', 'acme-corp', 'core-platform-services',
  'https://github.com/acme-corp/core-platform-services/pull/142',
  'feat(webhook): HMAC signature verification and event dispatcher',
  'open', '{"prNumber":142,"headBranch":"feature/CORE-3-webhook-hmac","baseBranch":"main"}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tasks" t, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3
ON CONFLICT ("provider", "artifact_type", "external_id", "task_id") DO NOTHING;

INSERT INTO "task_dev_links" (
  "id", "task_id", "provider", "artifact_type", "external_id", "owner", "repo", "url", "title_or_message", "status", "payload_json", "created_at", "updated_at"
)
SELECT
  'a0000000-0000-4000-a000-000000000002',
  t.id, 'github', 'branch', 'feature/CORE-3-webhook-hmac', 'acme-corp', 'core-platform-services',
  'https://github.com/acme-corp/core-platform-services/tree/feature/CORE-3-webhook-hmac',
  'feature/CORE-3-webhook-hmac',
  'active', '{"branch":"feature/CORE-3-webhook-hmac"}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tasks" t, "projects" p
WHERE p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3
ON CONFLICT ("provider", "artifact_type", "external_id", "task_id") DO NOTHING;

INSERT INTO "task_dev_links" (
  "id", "task_id", "provider", "artifact_type", "external_id", "owner", "repo", "url", "title_or_message", "status", "payload_json", "created_at", "updated_at"
)
SELECT
  'a0000000-0000-4000-a000-000000000003',
  t.id, 'github', 'pull_request', '88', 'acme-corp', 'web-portal-frontend',
  'https://github.com/acme-corp/web-portal-frontend/pull/88',
  'feat(board): Interactive Kanban Drag & Drop with animated drop indicators',
  'open', '{"prNumber":88,"headBranch":"feature/WEB-2-kanban-dnd","baseBranch":"main"}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tasks" t, "projects" p
WHERE p.project_key = 'WEB' AND t.project_id = p.id AND t.task_number = 2
ON CONFLICT ("provider", "artifact_type", "external_id", "task_id") DO NOTHING;

-- 11. NOTIFICATIONS
INSERT INTO "notifications" (
  "id", "user_id", "type", "title", "body", "entity_type", "entity_id", "metadata_json", "dedupe_key", "read_at", "created_at"
)
SELECT
  'b0000000-0000-4000-a000-000000000001',
  u.id, 'task_assigned', 'New Task Assigned',
  'Sarah Chen assigned you to CORE-3: Implement GitHub Webhook HMAC verification',
  'task', t.id, json_build_object('taskId', t.id::text),
  'assign-' || t.id || '-' || u.id,
  NULL, CURRENT_TIMESTAMP - INTERVAL '38 hours'
FROM "users" u, "tasks" t, "projects" p
WHERE u.email = 'alex.rivera@local.dev' AND p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3
ON CONFLICT ("user_id", "dedupe_key") DO NOTHING;

INSERT INTO "notifications" (
  "id", "user_id", "type", "title", "body", "entity_type", "entity_id", "metadata_json", "dedupe_key", "read_at", "created_at"
)
SELECT
  'b0000000-0000-4000-a000-000000000002',
  u.id, 'task_comment', 'New Comment on CORE-3',
  'Priya Patel commented on CORE-3: Tested automated branch trigger payload...',
  'task', t.id, json_build_object('taskId', t.id::text),
  'comment-' || t.id || '-priya',
  NULL, CURRENT_TIMESTAMP - INTERVAL '2 hours'
FROM "users" u, "tasks" t, "projects" p
WHERE u.email = 'alex.rivera@local.dev' AND p.project_key = 'CORE' AND t.project_id = p.id AND t.task_number = 3
ON CONFLICT ("user_id", "dedupe_key") DO NOTHING;

INSERT INTO "notifications" (
  "id", "user_id", "type", "title", "body", "entity_type", "entity_id", "metadata_json", "dedupe_key", "read_at", "created_at"
)
SELECT
  'b0000000-0000-4000-a000-000000000003',
  u.id, 'task_assigned', 'New Task Assigned',
  'Sarah Chen assigned you to WEB-2: Build interactive Drag & Drop Kanban board view',
  'task', t.id, json_build_object('taskId', t.id::text),
  'assign-' || t.id || '-' || u.id,
  CURRENT_TIMESTAMP - INTERVAL '8 hours', CURRENT_TIMESTAMP - INTERVAL '20 hours'
FROM "users" u, "tasks" t, "projects" p
WHERE u.email = 'elena.rostova@local.dev' AND p.project_key = 'WEB' AND t.project_id = p.id AND t.task_number = 2
ON CONFLICT ("user_id", "dedupe_key") DO NOTHING;

-- 12. USER AUDIT LOGS
INSERT INTO "user_audit_log" ("id", "actor_user_id", "target_user_id", "action", "metadata_json", "created_at")
SELECT
  'c0000000-0000-4000-a000-000000000001',
  u_admin.id, u_target.id, 'user_disabled',
  '{"reason":"Departed organization (account archived)"}',
  '2026-03-15 09:00:00+00'
FROM "users" u_admin, "users" u_target
WHERE u_admin.email = 'admin@local.dev' AND u_target.email = 'dev.archived@local.dev'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "user_audit_log" ("id", "actor_user_id", "target_user_id", "action", "metadata_json", "created_at")
SELECT
  'c0000000-0000-4000-a000-000000000002',
  u_admin.id, u_alex.id, 'role_promoted',
  '{"fromRole":"member","toRole":"project_admin","projectKey":"CORE"}',
  '2026-04-01 10:00:00+00'
FROM "users" u_admin, "users" u_alex
WHERE u_admin.email = 'admin@local.dev' AND u_alex.email = 'alex.rivera@local.dev'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "user_audit_log" ("id", "actor_user_id", "target_user_id", "action", "metadata_json", "created_at")
SELECT
  'c0000000-0000-4000-a000-000000000003',
  u_admin.id, u_sarah.id, 'role_promoted',
  '{"fromRole":"member","toRole":"project_admin","projectKey":"WEB"}',
  '2026-04-01 10:05:00+00'
FROM "users" u_admin, "users" u_sarah
WHERE u_admin.email = 'admin@local.dev' AND u_sarah.email = 'sarah.chen@local.dev'
ON CONFLICT ("id") DO NOTHING;
