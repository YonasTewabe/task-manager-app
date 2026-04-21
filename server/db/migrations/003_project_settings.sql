-- Per-project board columns and workflow rules (replaces reliance on a single system_settings row).

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
