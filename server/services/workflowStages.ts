export const DEFAULT_WORKFLOW_STAGES = [
  {
    key: "blocked",
    name: "Blocked",
    counterGroup: "upcoming",
  },
  {
    key: "todo",
    name: "To Do",
    counterGroup: "upcoming",
  },
  {
    key: "in_progress",
    name: "In Progress",
    counterGroup: "active",
  },
  {
    key: "done",
    name: "Done",
    counterGroup: "done",
  },
];

/** @deprecated use getWorkflowStageKeys(settings) */
export const STATUS_COLUMNS = DEFAULT_WORKFLOW_STAGES.map((s) => s.key);

function inferCounterGroup(key) {
  if (key === "done") return "done";
  if (key === "in_progress") return "active";
  if (key === "blocked" || key === "todo") return "upcoming";
  return "upcoming";
}

function asUuid(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

export function normalizeWorkflowStages(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const key = String(item.key || "").trim();
    if (!/^[a-z][a-z0-9_-]{0,62}$/.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = String(item.name || key).trim() || key;
    const description = String(item.description ?? "").trim();
    const badge = String(item.badge ?? "").trim();
    let counterGroup = item.counterGroup;
    if (
      counterGroup !== "upcoming" &&
      counterGroup !== "active" &&
      counterGroup !== "done"
    ) {
      counterGroup = inferCounterGroup(key);
    }
    cleaned.push({ key, name, description, badge, counterGroup });
  }
  if (cleaned.length === 0) {
    return DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s }));
  }
  return cleaned;
}

function defaultWorkflowTransitions(stages) {
  const list = Array.isArray(stages) ? stages : [];
  const transitions = [];
  for (let i = 0; i < list.length - 1; i += 1) {
    const from = list[i]?.key;
    const to = list[i + 1]?.key;
    if (!from || !to) continue;
    transitions.push({
      from,
      to,
      allowAllUsers: true,
      allowedUserIds: [],
      allowedGroupIds: [],
    });
  }
  return transitions;
}

export const DEFAULT_WORKFLOW_TRANSITIONS = defaultWorkflowTransitions(
  DEFAULT_WORKFLOW_STAGES,
);

export function normalizeWorkflowRules(rawRules, stages) {
  const stageKeys = new Set((stages || []).map((s) => s.key));
  const raw = rawRules && typeof rawRules === "object" ? rawRules : {};
  const incoming = Array.isArray(raw.transitions) ? raw.transitions : [];
  const seen = new Set();
  const transitions = [];

  for (const item of incoming) {
    const from = String(item?.from || "").trim();
    const to = String(item?.to || "").trim();
    if (!from || !to || from === to) continue;
    if (!stageKeys.has(from) || !stageKeys.has(to)) continue;
    const pair = `${from}->${to}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const allowedUserIds = [
      ...new Set(
        (Array.isArray(item?.allowedUserIds) ? item.allowedUserIds : [])
          .map((id) => asUuid(id, null))
          .filter((id) => id != null),
      ),
    ];
    transitions.push({
      from,
      to,
      allowAllUsers: item?.allowAllUsers === true,
      allowedUserIds,
      allowedGroupIds: [
        ...new Set(
          (Array.isArray(item?.allowedGroupIds) ? item.allowedGroupIds : [])
            .map((id) => asUuid(id, null))
            .filter((id) => id != null),
        ),
      ],
    });
  }

  return {
    transitions: transitions.length
      ? transitions
      : defaultWorkflowTransitions(stages),
  };
}

export function validateWorkflowStagesForSave(raw) {
  if (!Array.isArray(raw) || raw.length < 1) {
    throw new Error("At least one workflow stage is required");
  }
  const keys = new Set();
  const names = new Set();
  for (const item of raw) {
    const key = String(item?.key || "").trim();
    if (!/^[a-z][a-z0-9_-]{0,62}$/.test(key)) {
      throw new Error(
        `Invalid stage key "${key}". Use a lowercase letter first, then letters, numbers, hyphens, or underscores.`,
      );
    }
    if (keys.has(key)) throw new Error(`Duplicate stage key: ${key}`);
    keys.add(key);
    if (!String(item?.name || "").trim()) {
      throw new Error(`Stage "${key}" needs a display name`);
    }
    const nameKey = String(item?.name || "")
      .trim()
      .toLowerCase();
    if (names.has(nameKey)) {
      throw new Error(
        `Duplicate stage name: ${String(item?.name || "").trim()}`,
      );
    }
    names.add(nameKey);
    if (
      item?.counterGroup !== "upcoming" &&
      item?.counterGroup !== "active" &&
      item?.counterGroup !== "done"
    ) {
      throw new Error(`Stage "${key}" requires a backlog roll-up`);
    }
  }
  return raw.map((item) => {
    return {
      key: String(item.key).trim(),
      name: String(item.name).trim(),
      description: String(item.description ?? "").trim(),
      badge: String(item.badge ?? "").trim(),
      counterGroup: item.counterGroup,
    };
  });
}

export function getWorkflowStageKeys(settings) {
  return normalizeWorkflowStages(settings?.boardCardFields?.workflowStages).map(
    (s) => s.key,
  );
}

export function isValidWorkflowStatus(status, settings) {
  return getWorkflowStageKeys(settings).includes(String(status || "").trim());
}
