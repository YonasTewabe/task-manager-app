import { dbQuery } from "./pool.js";

const createTablesSql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'task',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('lowest', 'low', 'medium', 'high', 'highest')),
  status TEXT NOT NULL DEFAULT 'todo',
  story_points INTEGER,
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
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version TEXT;
UPDATE tasks SET version = '' WHERE version IS NULL;
ALTER TABLE tasks ALTER COLUMN version SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN version SET DEFAULT '';

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
