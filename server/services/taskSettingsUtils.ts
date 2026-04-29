import { DEFAULT_WORK_TYPE_VALUES } from "../../src/constants/workTypes.js";
import {
  DEFAULT_WORKFLOW_STAGES,
  normalizeWorkflowRules,
  normalizeWorkflowStages,
} from "./workflowStages.js";

const LEGACY_WORKFLOW_RULE_KEYS = [
  "allowBackMoveFromDone",
  "requireAssigneeForInProgress",
  "autoMoveToBacklogOnSprintComplete",
];

const REMOVED_BOARD_CARD_FIELD_KEYS = [
  "showStoryPoints",
  "showPriority",
  "showAssignee",
  "showLabel",
];

const DEFAULT_SETTINGS = {
  boardCardFields: {
    workflowStages: DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s })),
  },
  workflowRules: {},
  generalRules: {
    labels: [],
    types: DEFAULT_WORK_TYPE_VALUES,
    versions: [],
  },
};

const LABEL_COLOR_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#eab308",
  "#6366f1",
];

function sanitizeBoardCardFields(obj) {
  const o = { ...(obj && typeof obj === "object" ? obj : {}) };
  REMOVED_BOARD_CARD_FIELD_KEYS.forEach((k) => {
    delete o[k];
  });
  return o;
}

function stripLegacyWorkflowRuleKeys(obj) {
  const o = { ...(obj && typeof obj === "object" ? obj : {}) };
  LEGACY_WORKFLOW_RULE_KEYS.forEach((k) => {
    delete o[k];
  });
  return o;
}

function normalizeHexLabelColor(value) {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  return "";
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (n) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function getUniqueLabelColor(index, usedColors) {
  const preset = LABEL_COLOR_PALETTE[index % LABEL_COLOR_PALETTE.length];
  if (!usedColors.has(preset)) return preset;
  let offset = 0;
  while (offset < 720) {
    const hue = (index * 47 + offset * 19) % 360;
    const generated = hslToHex(hue, 0.65, 0.56);
    if (!usedColors.has(generated)) return generated;
    offset += 1;
  }
  return "";
}

function normalizeLabelsWithUniqueColors(labels = []) {
  const source = Array.isArray(labels) ? labels : [];
  const seenNames = new Set();
  const usedColors = new Set();
  return source
    .map((label, index) => {
      const name =
        typeof label === "string"
          ? String(label || "").trim()
          : String(label?.name || "").trim();
      if (!name) return null;
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) return null;
      seenNames.add(nameKey);
      const preferred = normalizeHexLabelColor(label?.color);
      const color =
        preferred && !usedColors.has(preferred)
          ? preferred
          : getUniqueLabelColor(index, usedColors);
      if (!color) return null;
      usedColors.add(color);
      return { name, color };
    })
    .filter(Boolean);
}

function mergeGeneralRules(rowGeneral, rowWorkflow) {
  const base =
    rowGeneral && typeof rowGeneral === "object" ? { ...rowGeneral } : {};
  const legacy =
    rowWorkflow && typeof rowWorkflow === "object" ? rowWorkflow : {};
  for (const k of LEGACY_WORKFLOW_RULE_KEYS) {
    if (base[k] === undefined && legacy[k] !== undefined) {
      base[k] = legacy[k];
    }
  }
  delete base.allowBackMoveFromDone;
  delete base.enforceUniqueTaskTitlesInSprint;
  const labels = Array.isArray(base.labels) ? base.labels : [];
  base.labels = normalizeLabelsWithUniqueColors(labels);
  const types = Array.isArray(base.types) ? base.types : [];
  const sanitizedTypes = [
    ...new Set(
      types
        .map((type) =>
          String(type || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
  base.types = sanitizedTypes.length
    ? sanitizedTypes
    : [...DEFAULT_SETTINGS.generalRules.types];
  const versions = Array.isArray(base.versions) ? base.versions : [];
  base.versions = [
    ...new Set(
      versions.map((version) => String(version || "").trim()).filter(Boolean),
    ),
  ];
  return base;
}

function pullLegacyFromWorkflowPatch(workflowPatch) {
  const pulled = {};
  if (!workflowPatch || typeof workflowPatch !== "object") return pulled;
  for (const k of LEGACY_WORKFLOW_RULE_KEYS) {
    if (workflowPatch[k] !== undefined) pulled[k] = workflowPatch[k];
  }
  return pulled;
}

function mergeSettingsRow(row) {
  if (!row) {
    const mergedBoard = sanitizeBoardCardFields({
      ...DEFAULT_SETTINGS.boardCardFields,
    });
    mergedBoard.workflowStages = normalizeWorkflowStages(
      mergedBoard.workflowStages,
    );
    return {
      boardCardFields: mergedBoard,
      workflowRules: normalizeWorkflowRules({}, mergedBoard.workflowStages),
      generalRules: { ...DEFAULT_SETTINGS.generalRules },
      updatedAt: undefined,
    };
  }
  const mergedBoard = sanitizeBoardCardFields({
    ...DEFAULT_SETTINGS.boardCardFields,
    ...(row.boardCardFields || {}),
  });
  mergedBoard.workflowStages = normalizeWorkflowStages(
    mergedBoard.workflowStages,
  );
  return {
    boardCardFields: mergedBoard,
    workflowRules: normalizeWorkflowRules(
      stripLegacyWorkflowRuleKeys(row.workflowRules || {}),
      mergedBoard.workflowStages,
    ),
    generalRules: mergeGeneralRules(row.generalRules, row.workflowRules),
    updatedAt: row.updatedAt,
  };
}

function getDefaultSettings() {
  return mergeSettingsRow(null);
}

export {
  getDefaultSettings,
  mergeSettingsRow,
  pullLegacyFromWorkflowPatch,
  sanitizeBoardCardFields,
  stripLegacyWorkflowRuleKeys,
};
