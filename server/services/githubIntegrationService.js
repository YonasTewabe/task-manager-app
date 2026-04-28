import crypto from "crypto";
import axios from "axios";
import { dbQuery } from "../db/pool.js";
import { moveTaskStatusForAutomation } from "./taskService.js";

const TASK_KEY_REGEX = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

function normalizeText(value) {
  return String(value || "").trim();
}

function parseTaskKeysFromText(text) {
  const matches = String(text || "").toUpperCase().match(TASK_KEY_REGEX) || [];
  return [...new Set(matches)];
}

function parseTaskKeysFromPayload({ branch, title, body, commits = [] }) {
  const out = new Set();
  parseTaskKeysFromText(branch).forEach((k) => out.add(k));
  parseTaskKeysFromText(title).forEach((k) => out.add(k));
  parseTaskKeysFromText(body).forEach((k) => out.add(k));
  for (const commit of commits) {
    parseTaskKeysFromText(commit?.message).forEach((k) => out.add(k));
  }
  return [...out];
}

export async function listProjectRepos(projectId) {
  const result = await dbQuery(
    `SELECT id,
            project_id AS "projectId",
            github_installation_id AS "githubInstallationId",
            owner,
            repo,
            default_branch AS "defaultBranch",
            is_enabled AS "isEnabled",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM project_github_repos
     WHERE project_id = $1
     ORDER BY owner ASC, repo ASC`,
    [projectId],
  );
  return result.rows;
}

export async function createProjectRepo(projectId, payload) {
  const result = await dbQuery(
    `INSERT INTO project_github_repos (
       project_id, github_installation_id, owner, repo, default_branch, is_enabled
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id,
               project_id AS "projectId",
               github_installation_id AS "githubInstallationId",
               owner,
               repo,
               default_branch AS "defaultBranch",
               is_enabled AS "isEnabled",
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [
      projectId,
      payload.githubInstallationId ?? null,
      normalizeText(payload.owner),
      normalizeText(payload.repo),
      normalizeText(payload.defaultBranch) || "develop",
      payload.isEnabled !== false,
    ],
  );
  return result.rows[0];  
}

export async function updateProjectRepo(projectId, repoId, patch) {
  const fields = [];
  const params = [];
  let idx = 1;
  const map = {
    githubInstallationId: "github_installation_id",
    owner: "owner",
    repo: "repo",
    defaultBranch: "default_branch",
    isEnabled: "is_enabled",
  };
  for (const [key, dbKey] of Object.entries(map)) {
    if (patch[key] === undefined) continue;
    fields.push(`${dbKey} = $${idx}`);
    if (key === "owner" || key === "repo" || key === "defaultBranch") {
      params.push(normalizeText(patch[key]));
    } else {
      params.push(patch[key]);
    }
    idx += 1;
  }
  if (!fields.length) return null;
  fields.push("updated_at = NOW()");
  params.push(repoId, projectId);
  const result = await dbQuery(
    `UPDATE project_github_repos
     SET ${fields.join(", ")}
     WHERE id = $${idx} AND project_id = $${idx + 1}
     RETURNING id,
               project_id AS "projectId",
               github_installation_id AS "githubInstallationId",
               owner,
               repo,
               default_branch AS "defaultBranch",
               is_enabled AS "isEnabled",
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    params,
  );
  return result.rows[0] || null;
}

export async function deleteProjectRepo(projectId, repoId) {
  const result = await dbQuery(
    `DELETE FROM project_github_repos WHERE id = $1 AND project_id = $2`,
    [repoId, projectId],
  );
  return result.rowCount > 0;
}

export async function listAutomationRules(projectId) {
  const result = await dbQuery(
    `SELECT id,
            project_id AS "projectId",
            event_type AS "eventType",
            is_enabled AS "isEnabled",
            priority,
            conditions_json AS "conditions",
            actions_json AS "actions",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM project_automation_rules
     WHERE project_id = $1
     ORDER BY priority ASC, created_at ASC`,
    [projectId],
  );
  return result.rows;
}

function canonicalRuleSignature(rule) {
  const eventType = normalizeText(rule?.eventType).toLowerCase();
  const targetStatus = normalizeText(rule?.actions?.targetStatus).toLowerCase();
  const baseBranch = normalizeText(rule?.conditions?.baseBranch).toLowerCase();
  const branchIncludes = normalizeText(rule?.conditions?.branchIncludes).toLowerCase();
  const requireTaskKey = rule?.conditions?.requireTaskKey === true;
  return [
    eventType,
    targetStatus,
    baseBranch,
    branchIncludes,
    requireTaskKey ? "1" : "0",
  ].join("|");
}

function dedupeAutomationRules(rules) {
  const seen = new Set();
  const deduped = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    const signature = canonicalRuleSignature(rule);
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(rule);
  }
  return deduped;
}

export async function replaceAutomationRules(projectId, rules) {
  await dbQuery(`DELETE FROM project_automation_rules WHERE project_id = $1`, [
    projectId,
  ]);
  const incoming = dedupeAutomationRules(rules);
  const created = [];
  for (const [index, rule] of incoming.entries()) {
    const result = await dbQuery(
      `INSERT INTO project_automation_rules (
         project_id, event_type, is_enabled, priority, conditions_json, actions_json
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
       RETURNING id,
                 project_id AS "projectId",
                 event_type AS "eventType",
                 is_enabled AS "isEnabled",
                 priority,
                 conditions_json AS "conditions",
                 actions_json AS "actions",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [
        projectId,
        normalizeText(rule.eventType),
        rule.isEnabled !== false,
        Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : index + 1,
        JSON.stringify(rule.conditions || {}),
        JSON.stringify(rule.actions || {}),
      ],
    );
    created.push(result.rows[0]);
  }
  return created;
}

async function resolveTaskIdsForKeys(projectId, taskKeys = []) {
  if (!taskKeys.length) return [];
  const normalized = [...new Set(taskKeys.map((k) => normalizeText(k).toUpperCase()))];
  const result = await dbQuery(
    `SELECT t.id,
            (p.project_key || '-' || t.task_number::text) AS "taskKey"
     FROM tasks t
     INNER JOIN projects p ON p.id = t.project_id
     WHERE t.project_id = $1
       AND (p.project_key || '-' || t.task_number::text) = ANY($2::text[])`,
    [projectId, normalized],
  );
  return result.rows;
}

async function resolveTaskIdsForExistingArtifact(
  projectId,
  artifactType,
  externalId,
  owner,
  repo,
) {
  const id = String(externalId || "").trim();
  const repoOwner = String(owner || "").trim();
  const repoName = String(repo || "").trim();
  if (!id || !repoOwner || !repoName) return [];
  const result = await dbQuery(
    `SELECT DISTINCT l.task_id AS id
     FROM task_dev_links l
     INNER JOIN tasks t ON t.id = l.task_id
     WHERE t.project_id = $1
       AND l.provider = 'github'
       AND l.artifact_type = $2
       AND l.external_id = $3
       AND LOWER(l.owner) = LOWER($4)
       AND LOWER(l.repo) = LOWER($5)`,
    [projectId, artifactType, id, repoOwner, repoName],
  );
  return result.rows.map((row) => ({ id: row.id }));
}

async function upsertDevLink({
  taskId,
  artifactType,
  externalId,
  owner,
  repo,
  url,
  titleOrMessage,
  status,
  payload,
}) {
  await dbQuery(
    `INSERT INTO task_dev_links (
       task_id, provider, artifact_type, external_id, owner, repo, url, title_or_message, status, payload_json
     )
     VALUES ($1, 'github', $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (provider, artifact_type, external_id, task_id)
     DO UPDATE SET owner = EXCLUDED.owner,
                   repo = EXCLUDED.repo,
                   url = EXCLUDED.url,
                   title_or_message = EXCLUDED.title_or_message,
                   status = EXCLUDED.status,
                   payload_json = EXCLUDED.payload_json,
                   updated_at = NOW()`,
    [
      taskId,
      artifactType,
      externalId,
      owner || "",
      repo || "",
      url || "",
      titleOrMessage || "",
      status || "",
      JSON.stringify(payload || {}),
    ],
  );
}

async function deleteDevLink({
  taskId,
  artifactType,
  externalId,
}) {
  await dbQuery(
    `DELETE FROM task_dev_links
     WHERE task_id = $1
       AND provider = 'github'
       AND artifact_type = $2
       AND external_id = $3`,
    [taskId, artifactType, externalId],
  );
}

function eventTypeFromWebhook(eventName, payload) {
  if (eventName === "push") {
    if (payload?.created) return "branch_created";
    return "commit_pushed";
  }
  if (eventName === "pull_request") {
    if (payload?.action === "opened") return "pr_opened";
    if (payload?.action === "closed" && payload?.pull_request?.merged) {
      return "pr_merged";
    }
    if (payload?.action === "closed") return "pr_closed";
    return "pr_updated";
  }
  return "unknown";
}

function matchesRule(rule, context) {
  const conditions = rule?.conditions || {};
  if (conditions.baseBranch) {
    const expected = normalizeText(conditions.baseBranch);
    if (normalizeText(context.baseBranch) !== expected) return false;
  }
  if (conditions.branchIncludes) {
    const expected = normalizeText(conditions.branchIncludes).toLowerCase();
    if (!normalizeText(context.branch).toLowerCase().includes(expected)) return false;
  }
  if (conditions.requireTaskKey === true && (!context.taskKeys || !context.taskKeys.length)) {
    return false;
  }
  return true;
}

async function runAutomationForTasks(projectId, eventType, taskIds, context) {
  if (!taskIds.length) return 0;
  const rules = await listAutomationRules(projectId);
  const candidates = rules.filter(
    (rule) => rule.isEnabled && rule.eventType === eventType && matchesRule(rule, context),
  );
  let transitions = 0;
  for (const rule of candidates) {
    const targetStatus = normalizeText(rule?.actions?.targetStatus);
    if (!targetStatus) continue;
    for (const taskId of taskIds) {
      try {
        await moveTaskStatusForAutomation(taskId, targetStatus, {
          eventType,
          ruleId: rule.id,
        });
        transitions += 1;
      } catch {
        // Skip failures per task/rule to keep webhook ingestion resilient.
      }
    }
  }
  return transitions;
}

export function verifyGithubWebhookSignature(rawBodyBuffer, signatureHeader, secret) {
  if (!secret) return true;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBodyBuffer).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(String(signatureHeader || "")),
    );
  } catch {
    return false;
  }
}

export async function ingestGithubWebhook(eventName, payload) {
  const owner = normalizeText(payload?.repository?.owner?.login);
  const repo = normalizeText(payload?.repository?.name);
  if (!owner || !repo) {
    return { processed: false, reason: "missing_repository" };
  }
  const repoMappingsResult = await dbQuery(
    `SELECT project_id AS "projectId"
     FROM project_github_repos
     WHERE LOWER(owner) = LOWER($1)
       AND LOWER(repo) = LOWER($2)
       AND is_enabled = TRUE`,
    [owner, repo],
  );
  const projectIds = [...new Set(repoMappingsResult.rows.map((r) => String(r.projectId)))];
  if (!projectIds.length) {
    return { processed: false, reason: "repo_not_mapped" };
  }

  const branch = normalizeText(payload?.ref || "").replace("refs/heads/", "");
  const pr = payload?.pull_request || {};
  const commits = Array.isArray(payload?.commits) ? payload.commits : [];
  const taskKeys = parseTaskKeysFromPayload({
    branch,
    title: pr?.title,
    body: pr?.body,
    commits,
  });
  const eventType = eventTypeFromWebhook(eventName, payload);

  const stats = { projects: projectIds.length, linksUpserted: 0, transitions: 0 };
  for (const projectId of projectIds) {
    const tasks = await resolveTaskIdsForKeys(projectId, taskKeys);
    const taskIds = tasks.map((task) => String(task.id));
    if (!taskIds.length) continue;

    if (eventName === "push") {
      if (branch) {
        for (const taskId of taskIds) {
          if (payload?.deleted) {
            await deleteDevLink({
              taskId,
              artifactType: "branch",
              externalId: `${owner}/${repo}:${branch}`,
            });
            continue;
          }
          await upsertDevLink({
            taskId,
            artifactType: "branch",
            externalId: `${owner}/${repo}:${branch}`,
            owner,
            repo,
            url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}`,
            titleOrMessage: branch,
            status: payload?.created ? "created" : "active",
            payload: {
              ref: payload?.ref,
              created_at: payload?.head_commit?.timestamp || null,
              sender: payload?.sender || null,
              pusher: payload?.pusher || null,
              head_commit: payload?.head_commit || null,
            },
          });
          stats.linksUpserted += 1;
        }
      }
      for (const commit of commits) {
        for (const taskId of taskIds) {
          await upsertDevLink({
            taskId,
            artifactType: "commit",
            externalId: commit?.id || "",
            owner,
            repo,
            url: commit?.url || "",
            titleOrMessage: commit?.message || "",
            status: "pushed",
            payload: commit,
          });
          stats.linksUpserted += 1;
        }
      }
    } else if (eventName === "pull_request" && pr?.id) {
      const state = pr?.merged
        ? "merged"
        : pr?.state === "closed"
          ? "closed"
          : pr?.draft
            ? "draft"
            : "open";
      for (const taskId of taskIds) {
        await upsertDevLink({
          taskId,
          artifactType: "pull_request",
          externalId: String(pr.id),
          owner,
          repo,
          url: pr?.html_url || "",
          titleOrMessage: pr?.title || "",
          status: state,
          payload: pr,
        });
        stats.linksUpserted += 1;
      }
    }
    stats.transitions += await runAutomationForTasks(projectId, eventType, taskIds, {
      branch,
      baseBranch: pr?.base?.ref || "",
      taskKeys,
    });
  }
  return { processed: true, eventType, ...stats };
}

function normalizeApiBaseUrl(apiBase) {
  const base = String(apiBase || "").trim();
  if (!base) return "https://api.github.com";
  return base.replace(/\/+$/, "");
}

async function fetchAllGithubPages(client, path, baseParams = {}) {
  const perPage = 100;
  const all = [];
  let page = 1;
  let batch = [];
  do {
    const response = await client.get(path, {
      params: {
        ...baseParams,
        per_page: perPage,
        page,
      },
    });
    batch = Array.isArray(response?.data) ? response.data : [];
    all.push(...batch);
    page += 1;
  } while (batch.length === perPage);
  return all;
}

export async function resyncProjectLinks(projectId, options = {}) {
  const repos = await listProjectRepos(projectId);
  const token = String(options?.accessToken || "").trim();
  if (!token) {
    throw new Error("GITHUB_TOKEN is required for resync");
  }
  const client = axios.create({
    baseURL: normalizeApiBaseUrl(options?.apiBase),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  let linksUpserted = 0;
  let reposSucceeded = 0;
  const failures = [];
  for (const repoItem of repos) {
    if (!repoItem.isEnabled) continue;
    const owner = repoItem.owner;
    const repo = repoItem.repo;
    try {
      const [pullRequests, branches, commits] = await Promise.all([
        fetchAllGithubPages(client, `/repos/${owner}/${repo}/pulls`, {
          state: "all",
        }),
        fetchAllGithubPages(client, `/repos/${owner}/${repo}/branches`),
        fetchAllGithubPages(client, `/repos/${owner}/${repo}/commits`),
      ]);
    const commitBySha = new Map(
      (commits || [])
        .filter((item) => String(item?.sha || "").trim())
        .map((item) => [String(item.sha).trim(), item]),
    );
    for (const pr of pullRequests || []) {
      const keys = parseTaskKeysFromPayload({
        title: pr.title,
        body: pr.body,
        branch: pr.head?.ref,
      });
      const prHeadBranch = normalizeText(pr?.head?.ref);
      let prCommits = [];
      if (Number.isFinite(Number(pr?.number))) {
        try {
          prCommits = await fetchAllGithubPages(
            client,
            `/repos/${owner}/${repo}/pulls/${pr.number}/commits`,
            {},
          );
        } catch {
          prCommits = [];
        }
      }
      for (const prCommit of prCommits) {
        parseTaskKeysFromText(prCommit?.commit?.message).forEach((key) =>
          keys.push(key),
        );
      }
      const [tasksByKey, tasksByExistingPr] = await Promise.all([
        resolveTaskIdsForKeys(projectId, keys),
        resolveTaskIdsForExistingArtifact(
          projectId,
          "pull_request",
          String(pr.id || ""),
          owner,
          repo,
        ),
      ]);
      const tasks = [
        ...new Map(
          [...tasksByKey, ...tasksByExistingPr].map((task) => [
            String(task.id),
            task,
          ]),
        ).values(),
      ];
      for (const task of tasks) {
        await upsertDevLink({
          taskId: task.id,
          artifactType: "pull_request",
          externalId: String(pr.id),
          owner,
          repo,
          url: pr.html_url || "",
          titleOrMessage: pr.title || "",
          status: pr.merged_at ? "merged" : pr.state || "",
          payload: pr,
        });
        linksUpserted += 1;

        if (prHeadBranch) {
          await upsertDevLink({
            taskId: task.id,
            artifactType: "branch",
            externalId: `${owner}/${repo}:${prHeadBranch}`,
            owner,
            repo,
            url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(prHeadBranch)}`,
            titleOrMessage: prHeadBranch,
            status: "active",
            payload: {
              source: "pull_request",
              pull_request: pr,
            },
          });
          linksUpserted += 1;
        }

        for (const prCommit of prCommits) {
          const sha = normalizeText(prCommit?.sha);
          if (!sha) continue;
          await upsertDevLink({
            taskId: task.id,
            artifactType: "commit",
            externalId: sha,
            owner,
            repo,
            url: prCommit?.html_url || "",
            titleOrMessage: prCommit?.commit?.message || "",
            status: "synced",
            payload: prCommit,
          });
          linksUpserted += 1;
        }
      }
    }
    for (const branch of branches || []) {
      const keys = parseTaskKeysFromText(branch.name);
      const [tasksByKey, tasksByExistingBranch] = await Promise.all([
        resolveTaskIdsForKeys(projectId, keys),
        resolveTaskIdsForExistingArtifact(
          projectId,
          "branch",
          `${owner}/${repo}:${branch.name}`,
          owner,
          repo,
        ),
      ]);
      const tasks = [
        ...new Map(
          [...tasksByKey, ...tasksByExistingBranch].map((task) => [
            String(task.id),
            task,
          ]),
        ).values(),
      ];
      const headSha = String(branch?.commit?.sha || "").trim();
      const headCommit = headSha ? commitBySha.get(headSha) : null;
      for (const task of tasks) {
        await upsertDevLink({
          taskId: task.id,
          artifactType: "branch",
          externalId: `${owner}/${repo}:${branch.name}`,
          owner,
          repo,
          url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch.name)}`,
          titleOrMessage: branch.name,
          status: "active",
          payload: {
            ...branch,
            created_at:
              headCommit?.commit?.author?.date ||
              headCommit?.commit?.committer?.date ||
              null,
            author: headCommit?.author || null,
            commit: headCommit?.commit || null,
            head_commit: headCommit || null,
          },
        });
        linksUpserted += 1;
      }
    }
    for (const commit of commits || []) {
      const keys = parseTaskKeysFromText(commit?.commit?.message);
      const commitSha = String(commit?.sha || "").trim();
      const [tasksByKey, tasksByExistingCommit] = await Promise.all([
        resolveTaskIdsForKeys(projectId, keys),
        resolveTaskIdsForExistingArtifact(
          projectId,
          "commit",
          commitSha,
          owner,
          repo,
        ),
      ]);
      const tasks = [
        ...new Map(
          [...tasksByKey, ...tasksByExistingCommit].map((task) => [
            String(task.id),
            task,
          ]),
        ).values(),
      ];
      for (const task of tasks) {
        await upsertDevLink({
          taskId: task.id,
          artifactType: "commit",
          externalId: commitSha,
          owner,
          repo,
          url: commit.html_url || "",
          titleOrMessage: commit?.commit?.message || "",
          status: "synced",
          payload: commit,
        });
        linksUpserted += 1;
      }
    }
      reposSucceeded += 1;
    } catch (error) {
      failures.push({
        owner,
        repo,
        error:
          error?.response?.data?.message ||
          error?.message ||
          "Unknown resync error",
      });
    }
  }
  return {
    reposScanned: repos.length,
    reposSucceeded,
    reposFailed: failures.length,
    linksUpserted,
    failures,
  };
}
