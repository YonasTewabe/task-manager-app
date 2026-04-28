import { dbQuery } from "../db/pool.js";

export async function getGithubIntegrationSettings() {
  const result = await dbQuery(
    `SELECT github_org AS "githubOrg",
            github_token AS "githubToken",
            github_webhook_secret AS "githubWebhookSecret",
            updated_at AS "updatedAt"
     FROM app_integration_settings
     WHERE id = 1`,
  );
  const row = result.rows[0] || {};
  return {
    githubOrg: row.githubOrg || "",
    githubToken: row.githubToken || "",
    githubWebhookSecret: row.githubWebhookSecret || "",
    updatedAt: row.updatedAt || null,
  };
}

export async function updateGithubIntegrationSettings(patch = {}) {
  const current = await getGithubIntegrationSettings();
  const next = {
    githubOrg:
      patch.githubOrg !== undefined
        ? String(patch.githubOrg || "").trim()
        : current.githubOrg,
    githubToken:
      patch.githubToken !== undefined
        ? String(patch.githubToken || "").trim()
        : current.githubToken,
    githubWebhookSecret:
      patch.githubWebhookSecret !== undefined
        ? String(patch.githubWebhookSecret || "").trim()
        : current.githubWebhookSecret,
  };
  if (
    !next.githubOrg ||
    !next.githubToken ||
    !next.githubWebhookSecret
  ) {
    const err = new Error(
      "GitHub organization, token, and webhook secret are required.",
    );
    err.code = "GITHUB_SETTINGS_VALIDATION";
    throw err;
  }
  const result = await dbQuery(
    `UPDATE app_integration_settings
     SET github_org = $1,
         github_token = $2,
         github_webhook_secret = $3,
         updated_at = NOW()
     WHERE id = 1
     RETURNING github_org AS "githubOrg",
               github_token AS "githubToken",
               github_webhook_secret AS "githubWebhookSecret",
               updated_at AS "updatedAt"`,
    [next.githubOrg, next.githubToken, next.githubWebhookSecret],
  );
  return result.rows[0] || next;
}
