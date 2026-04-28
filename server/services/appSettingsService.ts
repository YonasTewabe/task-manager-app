import { prisma } from "../db/prisma.js";
import { asObjectRecord, asString } from "../utils/guards.js";

export async function getGithubIntegrationSettings() {
  const row =
    (await prisma.appIntegrationSettings.findFirst({
      where: {},
      select: {
        githubOrg: true,
        githubToken: true,
        githubWebhookSecret: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    })) || {};
  return {
    githubOrg: row.githubOrg || "",
    githubToken: row.githubToken || "",
    githubWebhookSecret: row.githubWebhookSecret || "",
    updatedAt: row.updatedAt || null,
  };
}

export async function updateGithubIntegrationSettings(
  patch: Record<string, unknown> = {},
) {
  const patchObj = asObjectRecord(patch);
  const current = await getGithubIntegrationSettings();
  const next = {
    githubOrg:
      patchObj.githubOrg !== undefined
        ? asString(patchObj.githubOrg).trim()
        : current.githubOrg,
    githubToken:
      patchObj.githubToken !== undefined
        ? asString(patchObj.githubToken).trim()
        : current.githubToken,
    githubWebhookSecret:
      patchObj.githubWebhookSecret !== undefined
        ? asString(patchObj.githubWebhookSecret).trim()
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
    (err as any).code = "GITHUB_SETTINGS_VALIDATION";
    throw err;
  }
  const updated = await prisma.appIntegrationSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      githubOrg: next.githubOrg,
      githubToken: next.githubToken,
      githubWebhookSecret: next.githubWebhookSecret,
    },
    update: {
      githubOrg: next.githubOrg,
      githubToken: next.githubToken,
      githubWebhookSecret: next.githubWebhookSecret,
    },
    select: {
      githubOrg: true,
      githubToken: true,
      githubWebhookSecret: true,
      updatedAt: true,
    },
  });
  return updated || next;
}
