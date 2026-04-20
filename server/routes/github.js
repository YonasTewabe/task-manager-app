import { Router } from "express";
import axios from "axios";
const router = Router();

function trimBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function githubConfig() {
  return {
    apiBase: trimBaseUrl(process.env.GITHUB_API_BASE) || "https://api.github.com",
    org: process.env.GITHUB_ORG,
    token: process.env.GITHUB_TOKEN,
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
    const cfg = githubConfig();
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

router.get("/branches", async (req, res) => {
  const { repo, org } = req.query;
  if (!repo) return res.status(400).json({ error: "Repo is required" });

  try {
    const cfg = githubConfig();
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
    const cfg = githubConfig();
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
    const cfg = githubConfig();
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
