CREATE TABLE IF NOT EXISTS app_integration_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  github_token TEXT NOT NULL DEFAULT '',
  github_webhook_secret TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_integration_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
