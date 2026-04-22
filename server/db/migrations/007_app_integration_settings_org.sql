ALTER TABLE app_integration_settings
ADD COLUMN IF NOT EXISTS github_org TEXT NOT NULL DEFAULT '';
