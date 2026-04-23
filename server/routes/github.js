import { Router } from "express";
import axios from "axios";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectManagementAccess } from "../middleware/projectManagement.js";
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
const router = Router();

function trimBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

async function githubConfig() {
  const appSettings = await getGithubIntegrationSettings();
  return {
    apiBase: trimBaseUrl(process.env.GITHUB_API_BASE) || "https://api.github.com",
    org: appSettings.githubOrg || process.env.GITHUB_ORG,
    token: appSettings.githubToken || process.env.GITHUB_TOKEN,
    webhookSecret:
      appSettings.githubWebhookSecret || process.env.GITHUB_WEBHOOK_SECRET || "",
  };
}

function githubClient(config) {
  const headers = { Accept: "application/vnd.github+json" };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }
  return axios.create({
    baseURL: config.apiBase,
    headers,
  });
}

router.get("/repos", async (req, res) => {
  try {
    const cfg = await githubConfig();
    if (!cfg.org) {
      return res.status(400).json({ error: "GITHUB_ORG is not configured" });
    }
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
      page++;
    } while (fetched.length === perPage);
    res.json(allRepos.map((repo) => ({ name: repo.name })));
  } catch (err) {
    console.error("Error fetching repos:", err.message);
    res.status(500).json({ error: "Failed to fetch repos" });
  }
});

router.post("/webhook", async (req, res) => {
  const cfg = await githubConfig();
  const secret = cfg.webhookSecret;
  const signature = req.get("x-hub-signature-256");
  const rawPayload = Buffer.from(JSON.stringify(req.body || {}));
  if (!verifyGithubWebhookSignature(rawPayload, signature, secret)) {
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
});

router.use(requireAuth);

router.get("/projects/:projectId/repos", async (req, res) => {
  try {
    const rows = await listProjectRepos(req.params.projectId);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to load project repositories" });
  }
});

router.post("/projects/:projectId/repos", async (req, res) => {
  if (
    !(await requireProjectManagementAccess(req, res, req.params.projectId))
  ) {
    return;
  }
  const cfg = await githubConfig();
  const owner = String(req.body?.owner || cfg.org || "").trim();
  const repo = String(req.body?.repo || "").trim();
  if (!owner || !repo) {
    return res
      .status(400)
      .json({ error: "repo is required and global GitHub org must be configured" });
  }
  try {
    const row = await createProjectRepo(req.params.projectId, {
      ...(req.body || {}),
      owner,
    });
    return res.status(201).json(row);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Repository already connected to project" });
    }
    return res.status(500).json({ error: "Failed to add repository mapping" });
  }
});

router.put("/projects/:projectId/repos/:repoId", async (req, res) => {
  if (
    !(await requireProjectManagementAccess(req, res, req.params.projectId))
  ) {
    return;
  }
  try {
      const row = await updateProjectRepo(
        req.params.projectId,
        req.params.repoId,
        req.body || {},
      );
      if (!row) return res.status(404).json({ error: "Repository mapping not found" });
      return res.json(row);
    } catch {
      return res.status(500).json({ error: "Failed to update repository mapping" });
    }
});

router.post("/projects/:projectId/resync", async (req, res) => {
  if (
    !(await requireProjectManagementAccess(req, res, req.params.projectId))
  ) {
    return;
  }
  try {
      const cfg = await githubConfig();
      const result = await resyncProjectLinks(req.params.projectId, cfg.token);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message || "Resync failed" });
    }
});

router.delete("/projects/:projectId/repos/:repoId", async (req, res) => {
  if (
    !(await requireProjectManagementAccess(req, res, req.params.projectId))
  ) {
    return;
  }
  try {
      const removed = await deleteProjectRepo(req.params.projectId, req.params.repoId);
      if (!removed) return res.status(404).json({ error: "Repository mapping not found" });
      return res.status(204).send();
    } catch {
      return res.status(500).json({ error: "Failed to remove repository mapping" });
    }
});

router.get("/projects/:projectId/automation-rules", async (req, res) => {
  try {
    const rules = await listAutomationRules(req.params.projectId);
    return res.json(rules);
  } catch {
    return res.status(500).json({ error: "Failed to load automation rules" });
  }
});

router.put("/projects/:projectId/automation-rules", async (req, res) => {
  if (
    !(await requireProjectManagementAccess(req, res, req.params.projectId))
  ) {
    return;
  }
  try {
      const rules = await replaceAutomationRules(
        req.params.projectId,
        Array.isArray(req.body?.rules) ? req.body.rules : [],
      );
      return res.json(rules);
    } catch {
      return res.status(500).json({ error: "Failed to save automation rules" });
    }
});

router.get("/branches", async (req, res) => {
  const { repo, org } = req.query;
  if (!repo) return res.status(400).json({ error: "Repo is required" });

  try {
    const cfg = await githubConfig();
    if (!cfg.org && !org) {
      return res.status(400).json({ error: "Organization is required" });
    }
    const client = githubClient(cfg);
    const organization = org || cfg.org;
    let allBranches = [];
    let page = 1;
    const perPage = 100;
    let fetched;
    do {
      const response = await client.get(
        `/repos/${organization}/${repo}/branches`,
        { params: { per_page: perPage, page } },
      );
      fetched = response.data;
      allBranches = allBranches.concat(fetched);
      page++;
    } while (fetched.length === perPage);
    res.json(allBranches.map((branch) => ({ name: branch.name })));
  } catch (err) {
    console.error("Error fetching branches:", err.message);
    res.status(500).json({ error: "Failed to fetch branches" });
  }
});

router.post("/create-pr", async (req, res) => {
  const { owner, repo, branch, base = "main", title, body } = req.body;

  if (!repo || !branch) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    const cfg = await githubConfig();
    if (!cfg.token) {
      return res.status(400).json({ message: "GITHUB_TOKEN is not configured." });
    }
    const repoOwner = owner || cfg.org;
    const prTitle = title || `Auto PR: ${branch} -> ${base}`;
    const prBody = body || "Auto-created from starter integration.";

    const response = await axios.post(
      `${cfg.apiBase}/repos/${repoOwner}/${repo}/pulls`,
      {
        title: prTitle,
        head: branch,
        base,
        body: prBody,
      },
      {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    return res.json({
      url: response.data.html_url,
      number: response.data.number,
      status: "created",
    });
  } catch (err) {
    console.error("Failed to create PR:", err.response?.data || err.message);
    return res.status(500).json({ message: "Failed to create PR", error: err.message });
  }
});

router.post("/pr-status", async (req, res) => {
  const { owner, repo, prNumber } = req.body;

  try {
    const cfg = await githubConfig();
    if (!cfg.token) {
      return res.status(400).json({ message: "GITHUB_TOKEN is not configured." });
    }
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
    res.status(500).json({ message: err.response?.data?.message || err.message });
  }
});

export default router;
