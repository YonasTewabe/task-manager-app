-- Per-project sequential task numbers and display keys (PROJECTKEY-42).

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
