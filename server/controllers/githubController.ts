import axios from "axios";
import type { Request, Response } from "express";
import {
  createProjectRepo,
  deleteProjectRepo,
  ingestGithubWebhook,
  listAutomationRules,
  listProjectRepos,
  replaceAutomationRules,
  resyncProjectLinks,
  updateProjectRepo,
  verifyGithubWebhookSignature,
} from "../services/githubIntegrationService.js";
import { getGithubIntegrationSettings } from "../services/appSettingsService.js";

async function githubConfig() {
  const appSettings = await getGithubIntegrationSettings();
  return {
    apiBase: "https://api.github.com",
    org: appSettings.githubOrg,
    token: appSettings.githubToken,
    webhookSecret: appSettings.githubWebhookSecret,
  };
}

function githubClient(config) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  return axios.create({ baseURL: config.apiBase, headers });
}

export async function listReposHandler(req: Request, res: Response) {
  try {
    const cfg = await githubConfig();
    if (!cfg.org)
      return res.status(400).json({ error: "GITHUB_ORG is not configured" });
    const client = githubClient(cfg);
    let allRepos = [];
    let page = 1;
    const perPage = 100;
    let fetched;
    do {
      const response = await client.get(`/orgs/${cfg.org}/repos`, {
        params: { per_page: perPage, page },
      });
      fetched = response.data;
      allRepos = allRepos.concat(fetched);
      page += 1;
    } while (fetched.length === perPage);
    return res.json(allRepos.map((repo) => ({ name: repo.name })));
  } catch (err) {
    console.error("Error fetching repos:", err.message);
    return res.status(500).json({ error: "Failed to fetch repos" });
  }
}

export async function webhookHandler(req: Request, res: Response) {
  const cfg = await githubConfig();
  const signature = req.get("x-hub-signature-256");
  const rawPayload = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body || {}));
  if (!verifyGithubWebhookSignature(rawPayload, signature, cfg.webhookSecret)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }
  try {
    const eventName = req.get("x-github-event") || "";
    const result = await ingestGithubWebhook(eventName, req.body || {});
    return res.status(202).json(result);
  } catch (error) {
    console.error("GitHub webhook ingestion failed:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

export async function listProjectReposHandler(req: Request, res: Response) {
  try {
    const rows = await listProjectRepos(req.params.projectId);
    return res.json(rows);
  } catch {
    return res
      .status(500)
      .json({ error: "Failed to load project repositories" });
  }
}

export async function createProjectRepoHandler(req: Request, res: Response) {
  const cfg = await githubConfig();
  const owner = String(req.body?.owner || cfg.org || "").trim();
  const repo = String(req.body?.repo || "").trim();
  if (!owner || !repo) {
    return res
      .status(400)
      .json({
        error: "repo is required and global GitHub org must be configured",
      });
  }
  try {
    const row = await createProjectRepo(req.params.projectId, {
      ...(req.body || {}),
      owner,
    });
    return res.status(201).json(row);
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ error: "Repository already connected to project" });
    }
    return res.status(500).json({ error: "Failed to add repository mapping" });
  }
}

export async function updateProjectRepoHandler(req: Request, res: Response) {
  try {
    const row = await updateProjectRepo(
      req.params.projectId,
      req.params.repoId,
      req.body || {},
    );
    if (!row)
      return res.status(404).json({ error: "Repository mapping not found" });
    return res.json(row);
  } catch {
    return res
      .status(500)
      .json({ error: "Failed to update repository mapping" });
  }
}

export async function resyncProjectLinksHandler(req: Request, res: Response) {
  try {
    const cfg = await githubConfig();
    const result = await resyncProjectLinks(req.params.projectId, {
      accessToken: cfg.token,
      apiBase: cfg.apiBase,
    });
    return res.json(result);
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    const responseMessage = String(error?.response?.data?.message || "").trim();
    const message = responseMessage || error?.message || "Resync failed";
    return res.status(500).json({
      error: message,
      ...(status ? { githubStatus: status } : {}),
    });
  }
}

export async function deleteProjectRepoHandler(req: Request, res: Response) {
  try {
    const removed = await deleteProjectRepo(
      req.params.projectId,
      req.params.repoId,
    );
    if (!removed)
      return res.status(404).json({ error: "Repository mapping not found" });
    return res.status(204).send();
  } catch {
    return res
      .status(500)
      .json({ error: "Failed to remove repository mapping" });
  }
}

export async function listAutomationRulesHandler(req: Request, res: Response) {
  try {
    const rules = await listAutomationRules(req.params.projectId);
    return res.json(rules);
  } catch {
    return res.status(500).json({ error: "Failed to load automation rules" });
  }
}

export async function replaceAutomationRulesHandler(req: Request, res: Response) {
  try {
    const rules = await replaceAutomationRules(
      req.params.projectId,
      Array.isArray(req.body?.rules) ? req.body.rules : [],
    );
    return res.json(rules);
  } catch {
    return res.status(500).json({ error: "Failed to save automation rules" });
  }
}

export async function listBranchesHandler(req: Request, res: Response) {
  const { repo, org } = req.query;
  if (!repo) return res.status(400).json({ error: "Repo is required" });
  try {
    const cfg = await githubConfig();
    if (!cfg.org && !org)
      return res.status(400).json({ error: "Organization is required" });
    const client = githubClient(cfg);
    const organization = org || cfg.org;
    let allBranches = [];
    let page = 1;
    const perPage = 100;
    let fetched;
    do {
      const response = await client.get(
        `/repos/${organization}/${repo}/branches`,
        {
          params: { per_page: perPage, page },
        },
      );
      fetched = response.data;
      allBranches = allBranches.concat(fetched);
      page += 1;
    } while (fetched.length === perPage);
    return res.json(allBranches.map((branch) => ({ name: branch.name })));
  } catch (err) {
    console.error("Error fetching branches:", err.message);
    return res.status(500).json({ error: "Failed to fetch branches" });
  }
}

export async function createPrHandler(req: Request, res: Response) {
  const { owner, repo, branch, base = "main", title, body } = req.body;
  if (!repo || !branch) {
    return res.status(400).json({ message: "Missing required fields." });
  }
  try {
    const cfg = await githubConfig();
    if (!cfg.token)
      return res
        .status(400)
        .json({ message: "GITHUB_TOKEN is not configured." });
    const repoOwner = owner || cfg.org;
    const response = await axios.post(
      `${cfg.apiBase}/repos/${repoOwner}/${repo}/pulls`,
      {
        title: title || `Auto PR: ${branch} -> ${base}`,
        head: branch,
        base,
        body: body || "Auto-created from starter integration.",
      },
      {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/vnd.github+json",
        },
      },
    );
    return res.json({
      url: response.data.html_url,
      number: response.data.number,
      status: "created",
    });
  } catch (err) {
    console.error("Failed to create PR:", err.response?.data || err.message);
    return res
      .status(500)
      .json({ message: "Failed to create PR", error: err.message });
  }
}

export async function prStatusHandler(req: Request, res: Response) {
  const { owner, repo, prNumber } = req.body;
  try {
    const cfg = await githubConfig();
    if (!cfg.token)
      return res
        .status(400)
        .json({ message: "GITHUB_TOKEN is not configured." });
    const repoOwner = owner || cfg.org;
    const response = await axios.get(
      `${cfg.apiBase}/repos/${repoOwner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "User-Agent": "jenkins-status-checker",
        },
      },
    );
    return res.json({ merged: response.data.merged });
  } catch (err) {
    console.error("GitHub PR status error:", err);
    return res
      .status(500)
      .json({ message: err.response?.data?.message || err.message });
  }
}
