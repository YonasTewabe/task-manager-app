import { dbQuery } from "./pool.js";

const createTablesSql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  disable_reason TEXT NOT NULL DEFAULT '',
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_group_members (
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_settings (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  board_card_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  general_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO project_settings (project_id, board_card_fields, workflow_rules, general_rules)
SELECT p.id, ss.board_card_fields, ss.workflow_rules, ss.general_rules
FROM projects p
CROSS JOIN LATERAL (
  SELECT board_card_fields, workflow_rules, general_rules
  FROM system_settings
  ORDER BY updated_at DESC
  LIMIT 1
) ss
WHERE NOT EXISTS (SELECT 1 FROM project_settings ps WHERE ps.project_id = p.id);

INSERT INTO project_settings (project_id)
SELECT p.id
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM project_settings ps WHERE ps.project_id = p.id);

CREATE TABLE IF NOT EXISTS project_github_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_installation_id BIGINT,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_project_github_repos_project_id
  ON project_github_repos(project_id);
CREATE INDEX IF NOT EXISTS idx_project_github_repos_owner_repo
  ON project_github_repos(owner, repo);

CREATE TABLE IF NOT EXISTS project_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_automation_rules_project_id
  ON project_automation_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_project_automation_rules_event
  ON project_automation_rules(project_id, event_type, is_enabled, priority);

CREATE TABLE IF NOT EXISTS task_dev_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('branch', 'commit', 'pull_request')),
  external_id TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  repo TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  title_or_message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, artifact_type, external_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dev_links_task_id
  ON task_dev_links(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dev_links_repo
  ON task_dev_links(owner, repo);

CREATE TABLE IF NOT EXISTS app_integration_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  github_org TEXT NOT NULL DEFAULT '',
  github_token TEXT NOT NULL DEFAULT '',
  github_webhook_secret TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_integration_settings
ADD COLUMN IF NOT EXISTS github_org TEXT NOT NULL DEFAULT '';

INSERT INTO app_integration_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  label TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'task',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('lowest', 'low', 'medium', 'high', 'highest')),
  status TEXT NOT NULL DEFAULT 'todo',
  story_points INTEGER,
  due_date DATE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id UUID,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_by_ip TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_card_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  general_rules JSONB NOT NULL DEFAULT '{"labels": []}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (updated_at)
SELECT NOW()
WHERE NOT EXISTS (SELECT 1 FROM system_settings);

-- Older DBs may have sprints without project_id (CREATE TABLE IF NOT EXISTS skipped upgrades).
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS project_id UUID;
UPDATE sprints s
SET project_id = p.id
FROM (SELECT id FROM projects ORDER BY created_at LIMIT 1) p
WHERE s.project_id IS NULL
  AND EXISTS (SELECT 1 FROM projects LIMIT 1);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sprints_project_id_fkey'
  ) THEN
    ALTER TABLE sprints
      ADD CONSTRAINT sprints_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sprints WHERE project_id IS NULL) THEN
    ALTER TABLE sprints ALTER COLUMN project_id SET NOT NULL;
  END IF;
END $$;

-- Older DBs may have tasks without project_id (CREATE TABLE IF NOT EXISTS skipped upgrades).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID;
UPDATE tasks t
SET project_id = s.project_id
FROM sprints s
WHERE t.sprint_id = s.id
  AND t.project_id IS NULL
  AND s.project_id IS NOT NULL;
UPDATE tasks t
SET project_id = p.id
FROM (SELECT id FROM projects ORDER BY created_at LIMIT 1) p
WHERE t.project_id IS NULL
  AND EXISTS (SELECT 1 FROM projects LIMIT 1);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_project_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE project_id IS NULL) THEN
    ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_check'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_priority_check
      CHECK (priority IN ('lowest', 'low', 'medium', 'high', 'highest'));
  END IF;
END $$;
ALTER TABLE tasks ALTER COLUMN story_points DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN story_points DROP DEFAULT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version TEXT;
UPDATE tasks SET version = '' WHERE version IS NULL;
ALTER TABLE tasks ALTER COLUMN version SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN version SET DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS acceptance_criteria JSONB;
UPDATE tasks SET acceptance_criteria = '[]'::jsonb WHERE acceptance_criteria IS NULL;
ALTER TABLE tasks ALTER COLUMN acceptance_criteria SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN acceptance_criteria SET DEFAULT '[]'::jsonb;

-- Task keys: PROJECTKEY-sequential (see migrations/002_task_keys.sql).
CREATE TABLE IF NOT EXISTS project_task_seq (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  last_value INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_number INTEGER;

UPDATE tasks t
SET task_number = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at ASC, id ASC) AS rn
  FROM tasks
  WHERE task_number IS NULL
) sub
WHERE t.id = sub.id;

INSERT INTO project_task_seq (project_id, last_value)
SELECT project_id, COALESCE(MAX(task_number), 0)
FROM tasks
GROUP BY project_id
ON CONFLICT (project_id) DO UPDATE
SET last_value = GREATEST(project_task_seq.last_value, EXCLUDED.last_value);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_id_task_number_key ON tasks (project_id, task_number);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
  ON password_reset_tokens(expires_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disable_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE task_number IS NULL) THEN
    ALTER TABLE tasks ALTER COLUMN task_number SET NOT NULL;
  END IF;
END $$;
`;

export async function initSchema() {
  await dbQuery(createTablesSql);
}
