import { useEffect, useRef, useState } from "react";
import Modal from "./ui/Modal";
import {
  BUILTIN_STAGE_KEYS,
  DEFAULT_WORKFLOW_STAGES,
} from "../workflowDefaults.js";
import {
  DEFAULT_WORK_TYPE_VALUES,
  getWorkTypeMeta,
} from "../constants/workTypes.js";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";
import { apiRequest } from "../api/client";

const DEFAULT_FORM = {
  boardCardFields: {
    workflowStages: DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s })),
  },
  generalRules: {
    labels: [],
    types: DEFAULT_WORK_TYPE_VALUES,
    versions: [],
  },
};
const STAGE_PLACEMENT_START = "__start_of_group__";
const STAGE_PLACEMENT_END = "__end_of_group__";
const EMPTY_AUTOMATION_RULE_DRAFT = {
  eventType: "",
  targetStatus: "",
  branchScope: "any",
  baseBranch: "",
};

function toForm(settings) {
  const wf =
    Array.isArray(settings?.boardCardFields?.workflowStages) &&
    settings.boardCardFields.workflowStages.length > 0
      ? settings.boardCardFields.workflowStages.map((s) => ({ ...s }))
      : DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s }));
  const sortedWf = sortStagesByRollup(wf);

  return {
    boardCardFields: {
      workflowStages: sortedWf,
    },
    workflowRules: {
      transitions: normalizeTransitions(
        settings?.workflowRules?.transitions,
        sortedWf,
      ),
    },
    generalRules: {
      ...DEFAULT_FORM.generalRules,
      ...(settings?.generalRules || {}),
    },
  };
}

function reorderWorkflow(list, from, to) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  )
    return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function toStageKeyBase(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) return "stage";
  if (/^[a-z]/.test(slug)) return slug;
  return `stage-${slug}`;
}

function toUniqueStageKey(name, stages, skipIndex = -1) {
  const base = toStageKeyBase(name);
  const taken = new Set(
    stages
      .filter((_, index) => index !== skipIndex)
      .map((stage) => String(stage?.key || "").trim()),
  );
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function sortStagesByRollup(stages) {
  const rank = { upcoming: 0, active: 1, done: 2 };
  return [...(stages || [])]
    .map((stage, index) => ({ stage, index }))
    .sort((a, b) => {
      const aRank = rank[a.stage?.counterGroup] ?? 1;
      const bRank = rank[b.stage?.counterGroup] ?? 1;
      if (aRank !== bRank) return aRank - bRank;
      return a.index - b.index;
    })
    .map((entry) => entry.stage);
}

const SETTINGS_TABS = [
  { id: "users", label: "Users" },
  { id: "board-columns", label: "Board columns" },
  { id: "workflow", label: "Workflow" },
  { id: "integrations", label: "Integrations" },
  { id: "labels", label: "Labels" },
  { id: "types", label: "Types" },
  { id: "versions", label: "Versions" },
];

function defaultTransitions(stages) {
  const out = [];
  for (let i = 0; i < stages.length - 1; i += 1) {
    out.push({
      from: stages[i].key,
      to: stages[i + 1].key,
      allowAllUsers: false,
      allowedUserIds: [],
      allowedGroupIds: [],
    });
  }
  return out;
}

function normalizeTransitions(transitions, stages) {
  const validKeys = new Set(stages.map((s) => s.key));
  const seen = new Set();
  const cleaned = [];
  for (const item of Array.isArray(transitions) ? transitions : []) {
    const from = String(item?.from || "").trim();
    const to = String(item?.to || "").trim();
    if (!from || !to || from === to) continue;
    if (!validKeys.has(from) || !validKeys.has(to)) continue;
    const pair = `${from}->${to}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    cleaned.push({
      from,
      to,
      allowAllUsers: item?.allowAllUsers === true,
      allowedUserIds: [
        ...new Set(
          Array.isArray(item?.allowedUserIds) ? item.allowedUserIds : [],
        ),
      ],
      allowedGroupIds: [
        ...new Set(
          Array.isArray(item?.allowedGroupIds) ? item.allowedGroupIds : [],
        ),
      ],
    });
  }
  return cleaned.length ? cleaned : defaultTransitions(stages);
}

function payloadFromForm(form, workflowStageMigrations = {}) {
  const payload = {
    boardCardFields: {
      workflowStages: form.boardCardFields.workflowStages,
    },
    workflowRules: {
      transitions: normalizeTransitions(
        form?.workflowRules?.transitions,
        form?.boardCardFields?.workflowStages || [],
      ),
    },
    generalRules: form.generalRules,
  };
  const migrationEntries = Object.entries(workflowStageMigrations || {}).filter(
    ([from, to]) => String(from || "").trim() && String(to || "").trim(),
  );
  if (migrationEntries.length > 0) {
    payload.workflowStageMigrations = Object.fromEntries(migrationEntries);
  }
  return payload;
}

export default function SystemSettingsView({
  projectId,
  settings,
  projectName,
  canManage,
  users = [],
  userGroups = [],
  projectMembers = [],
  onSave,
  onSaveMembers,
  onNotify,
}) {
  const {
    settingsForm,
    setSettingsForm: setForm,
    settingsMemberIds: memberIds,
    setSettingsMemberIds: setMemberIds,
    settingsSavingSettings: savingSettings,
    setSettingsSavingSettings: setSavingSettings,
    settingsSavingMembers: savingMembers,
    setSettingsSavingMembers: setSavingMembers,
    settingsActiveTab: activeTab,
    setSettingsActiveTab: setActiveTab,
    settingsWorkflowFromKey: workflowFromKey,
    setSettingsWorkflowFromKey: setWorkflowFromKey,
    settingsWorkflowToKey: workflowToKey,
    setSettingsWorkflowToKey: setWorkflowToKey,
    settingsShowAddStageModal: showAddStageModal,
    setSettingsShowAddStageModal: setShowAddStageModal,
    settingsNewStageDraft: newStageDraft,
    setSettingsNewStageDraft: setNewStageDraft,
    settingsNewLabel: newLabel,
    setSettingsNewLabel: setNewLabel,
    settingsNewType: newType,
    setSettingsNewType: setNewType,
    settingsNewVersion: newVersion,
    setSettingsNewVersion: setNewVersion,
    settingsShowAddLabelModal: showAddLabelModal,
    setSettingsShowAddLabelModal: setShowAddLabelModal,
    settingsShowAddTypeModal: showAddTypeModal,
    setSettingsShowAddTypeModal: setShowAddTypeModal,
    settingsShowAddVersionModal: showAddVersionModal,
    setSettingsShowAddVersionModal: setShowAddVersionModal,
    settingsStageMigrations: stageMigrations,
    setSettingsStageMigrations: setStageMigrations,
    settingsStageDeleteDialog: stageDeleteDialog,
    setSettingsStageDeleteDialog: setStageDeleteDialog,
    settingsStageDragState: stageDragState,
    setSettingsStageDragState: setStageDragState,
    settingsAllowedDropIndexes: allowedDropIndexes,
    setSettingsAllowedDropIndexes: setAllowedDropIndexes,
    settingsBlockedDropIndexes: blockedDropIndexes,
    setSettingsBlockedDropIndexes: setBlockedDropIndexes,
    settingsBlockedDropReason: blockedDropReason,
    setSettingsBlockedDropReason: setBlockedDropReason,
  } = useAppStore(
    useShallow((state) => ({
      settingsForm: state.settingsForm,
      setSettingsForm: state.setSettingsForm,
      settingsMemberIds: state.settingsMemberIds,
      setSettingsMemberIds: state.setSettingsMemberIds,
      settingsSavingSettings: state.settingsSavingSettings,
      setSettingsSavingSettings: state.setSettingsSavingSettings,
      settingsSavingMembers: state.settingsSavingMembers,
      setSettingsSavingMembers: state.setSettingsSavingMembers,
      settingsActiveTab: state.settingsActiveTab,
      setSettingsActiveTab: state.setSettingsActiveTab,
      settingsWorkflowFromKey: state.settingsWorkflowFromKey,
      setSettingsWorkflowFromKey: state.setSettingsWorkflowFromKey,
      settingsWorkflowToKey: state.settingsWorkflowToKey,
      setSettingsWorkflowToKey: state.setSettingsWorkflowToKey,
      settingsShowAddStageModal: state.settingsShowAddStageModal,
      setSettingsShowAddStageModal: state.setSettingsShowAddStageModal,
      settingsNewStageDraft: state.settingsNewStageDraft,
      setSettingsNewStageDraft: state.setSettingsNewStageDraft,
      settingsNewLabel: state.settingsNewLabel,
      setSettingsNewLabel: state.setSettingsNewLabel,
      settingsNewType: state.settingsNewType,
      setSettingsNewType: state.setSettingsNewType,
      settingsNewVersion: state.settingsNewVersion,
      setSettingsNewVersion: state.setSettingsNewVersion,
      settingsShowAddLabelModal: state.settingsShowAddLabelModal,
      setSettingsShowAddLabelModal: state.setSettingsShowAddLabelModal,
      settingsShowAddTypeModal: state.settingsShowAddTypeModal,
      setSettingsShowAddTypeModal: state.setSettingsShowAddTypeModal,
      settingsShowAddVersionModal: state.settingsShowAddVersionModal,
      setSettingsShowAddVersionModal: state.setSettingsShowAddVersionModal,
      settingsStageMigrations: state.settingsStageMigrations,
      setSettingsStageMigrations: state.setSettingsStageMigrations,
      settingsStageDeleteDialog: state.settingsStageDeleteDialog,
      setSettingsStageDeleteDialog: state.setSettingsStageDeleteDialog,
      settingsStageDragState: state.settingsStageDragState,
      setSettingsStageDragState: state.setSettingsStageDragState,
      settingsAllowedDropIndexes: state.settingsAllowedDropIndexes,
      setSettingsAllowedDropIndexes: state.setSettingsAllowedDropIndexes,
      settingsBlockedDropIndexes: state.settingsBlockedDropIndexes,
      setSettingsBlockedDropIndexes: state.setSettingsBlockedDropIndexes,
      settingsBlockedDropReason: state.settingsBlockedDropReason,
      setSettingsBlockedDropReason: state.setSettingsBlockedDropReason,
    })),
  );
  const form = settingsForm ?? toForm(settings);
  const [githubRepos, setGithubRepos] = useState([]);
  const [automationRules, setAutomationRules] = useState([]);
  const [repoDraft, setRepoDraft] = useState({
    repo: "",
    defaultBranch: "develop",
    githubInstallationId: "",
  });
  const [appGithubOrg, setAppGithubOrg] = useState("");
  const [ruleDraft, setRuleDraft] = useState(EMPTY_AUTOMATION_RULE_DRAFT);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [showAddAutomationModal, setShowAddAutomationModal] = useState(false);
  const dragFromRef = useRef(null);
  const blockedDropTimeoutRef = useRef(null);
  const lastSavedSettingsRef = useRef("");
  const lastSavedMembersRef = useRef("");
  const hydratedProjectIdRef = useRef("");
  const hydratedSettingsSignatureRef = useRef("");

  useEffect(() => {
    const nextProjectId = String(projectId || "");
    const nextForm = toForm(settings);
    const incomingSignature = JSON.stringify(payloadFromForm(nextForm, {}));
    const currentFormSignature = settingsForm
      ? JSON.stringify(payloadFromForm(settingsForm, {}))
      : "";
    const projectChanged = hydratedProjectIdRef.current !== nextProjectId;
    const incomingChanged =
      hydratedSettingsSignatureRef.current !== incomingSignature;
    const matchesCurrentForm = currentFormSignature === incomingSignature;

    if (!projectChanged && (!incomingChanged || matchesCurrentForm)) {
      hydratedSettingsSignatureRef.current = incomingSignature;
      return;
    }

    setForm(nextForm);

    if (projectChanged) {
      setActiveTab("users");
      setWorkflowFromKey("");
      setWorkflowToKey("");
      setStageMigrations({});
      setStageDeleteDialog(null);
      setShowAddStageModal(false);
      setNewStageDraft({
        name: "",
        counterGroup: "",
        afterKey: STAGE_PLACEMENT_START,
      });
      setShowAddLabelModal(false);
      setShowAddTypeModal(false);
      setShowAddVersionModal(false);
      setNewLabel("");
      setNewType("");
      setNewVersion("");
      setStageDragState({
        fromIndex: -1,
        fromKey: "",
        fromGroup: "",
        overIndex: -1,
      });
      setAllowedDropIndexes(new Set());
      setBlockedDropIndexes(new Set());
      setBlockedDropReason("");
    }

    lastSavedSettingsRef.current = incomingSignature;
    hydratedProjectIdRef.current = nextProjectId;
    hydratedSettingsSignatureRef.current = incomingSignature;
  }, [projectId, settings, settingsForm]);

  useEffect(() => {
    return () => {
      window.clearTimeout(blockedDropTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setMemberIds(projectMembers.map((member) => member.id));
    lastSavedMembersRef.current = JSON.stringify(
      projectMembers.map((member) => member.id).sort(),
    );
  }, [projectMembers]);

  useEffect(() => {
    if (!projectId) {
      setGithubRepos([]);
      setAutomationRules([]);
      setAppGithubOrg("");
      return;
    }
    setGithubRepos([]);
    setAutomationRules([]);
    let cancelled = false;
    const load = async () => {
      try {
        const [repos, rules, appSettings] = await Promise.all([
          apiRequest(`/github/projects/${encodeURIComponent(projectId)}/repos`),
          apiRequest(
            `/github/projects/${encodeURIComponent(projectId)}/automation-rules`,
          ),
          apiRequest("/task-management/app-settings/github"),
        ]);
        if (cancelled) return;
        setGithubRepos(Array.isArray(repos) ? repos : []);
        setAutomationRules(Array.isArray(rules) ? rules : []);
        setAppGithubOrg(String(appSettings?.githubOrg || "").trim());
      } catch (error) {
        if (!cancelled) {
          onNotify?.(
            error.message || "Failed to load GitHub integration settings.",
            "error",
          );
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, onNotify]);

  useEffect(() => {
    if (!canManage) return undefined;
    const signature = JSON.stringify(payloadFromForm(form, stageMigrations));
    if (signature === lastSavedSettingsRef.current) return undefined;
    const timer = setTimeout(async () => {
      setSavingSettings(true);
      try {
        await onSave(payloadFromForm(form, stageMigrations));
        lastSavedSettingsRef.current = signature;
      } catch (error) {
        onNotify?.(error.message || "Failed to save settings.", "error");
      } finally {
        setSavingSettings(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [canManage, form, stageMigrations, onSave, onNotify]);

  useEffect(() => {
    if (!canManage) return undefined;
    const signature = JSON.stringify([...memberIds].sort());
    if (signature === lastSavedMembersRef.current) return undefined;
    const timer = setTimeout(async () => {
      setSavingMembers(true);
      try {
        await onSaveMembers(memberIds);
        lastSavedMembersRef.current = signature;
      } catch (error) {
        onNotify?.(error.message || "Failed to save project users.", "error");
      } finally {
        setSavingMembers(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [canManage, memberIds, onSaveMembers, onNotify]);

  const setSectionValue = (section, key, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const labels = Array.isArray(form.generalRules?.labels)
    ? form.generalRules.labels
    : [];
  const types =
    Array.isArray(form.generalRules?.types) &&
    form.generalRules.types.length > 0
      ? form.generalRules.types
      : DEFAULT_WORK_TYPE_VALUES;
  const versions = Array.isArray(form.generalRules?.versions)
    ? form.generalRules.versions
    : [];
  const addLabel = () => {
    const next = String(newLabel || "").trim();
    if (!next) return;
    const exists = labels.some(
      (label) => String(label).toLowerCase() === next.toLowerCase(),
    );
    if (exists) {
      setNewLabel("");
      return;
    }
    setSectionValue("generalRules", "labels", [...labels, next]);
    setNewLabel("");
  };
  const removeLabel = (labelToRemove) => {
    setSectionValue(
      "generalRules",
      "labels",
      labels.filter((label) => label !== labelToRemove),
    );
  };
  const addType = () => {
    const next = String(newType || "")
      .trim()
      .toLowerCase();
    if (!next) return;
    const exists = types.some(
      (type) => String(type).toLowerCase() === next.toLowerCase(),
    );
    if (exists) {
      setNewType("");
      return;
    }
    setSectionValue("generalRules", "types", [...types, next]);
    setNewType("");
  };
  const removeType = (typeToRemove) => {
    setSectionValue(
      "generalRules",
      "types",
      types.filter((type) => type !== typeToRemove),
    );
  };
  const addVersion = () => {
    const next = String(newVersion || "").trim();
    if (!next) return;
    const exists = versions.some(
      (version) => String(version).toLowerCase() === next.toLowerCase(),
    );
    if (exists) {
      setNewVersion("");
      return;
    }
    setSectionValue("generalRules", "versions", [...versions, next]);
    setNewVersion("");
  };
  const removeVersion = (versionToRemove) => {
    setSectionValue(
      "generalRules",
      "versions",
      versions.filter((version) => version !== versionToRemove),
    );
  };

  const updateStageAt = (index, partial) => {
    if (partial?.name !== undefined) {
      const nextName = String(partial.name || "")
        .trim()
        .toLowerCase();
      if (nextName) {
        const duplicate = form.boardCardFields.workflowStages.some(
          (stage, stageIndex) =>
            stageIndex !== index &&
            String(stage?.name || "")
              .trim()
              .toLowerCase() === nextName,
        );
        if (duplicate) {
          onNotify?.("Column name already in use in this project.", "error");
          return;
        }
      }
    }
    setForm((prev) => {
      const stages = [...prev.boardCardFields.workflowStages];
      const current = stages[index];
      stages[index] = { ...current, ...partial };
      const sortedStages = sortStagesByRollup(stages);
      const transitions = normalizeTransitions(
        prev.workflowRules?.transitions,
        sortedStages,
      );
      return {
        ...prev,
        boardCardFields: {
          ...prev.boardCardFields,
          workflowStages: sortedStages,
        },
        workflowRules: { ...(prev.workflowRules || {}), transitions },
      };
    });
  };

  const removeStageAt = (index, moveToKey) => {
    const stage = form.boardCardFields.workflowStages[index];
    if (!stage || BUILTIN_STAGE_KEYS.has(stage.key)) return;
    setForm((prev) => {
      const stages = prev.boardCardFields.workflowStages.filter(
        (_, i) => i !== index,
      );
      const sortedStages = sortStagesByRollup(stages);
      const transitions = normalizeTransitions(
        prev.workflowRules?.transitions,
        sortedStages,
      );
      return {
        ...prev,
        boardCardFields: {
          ...prev.boardCardFields,
          workflowStages: sortedStages,
        },
        workflowRules: { ...(prev.workflowRules || {}), transitions },
      };
    });
    if (moveToKey) {
      setStageMigrations((prev) => ({
        ...prev,
        [stage.key]: moveToKey,
      }));
    }
  };

  const addStage = () => {
    setShowAddStageModal(true);
    setNewStageDraft({
      name: "",
      counterGroup: "",
      afterKey: STAGE_PLACEMENT_START,
    });
  };

  const createStageFromDraft = () => {
    const nextName = String(newStageDraft.name || "").trim();
    const nextGroup = String(newStageDraft.counterGroup || "").trim();
    if (!nextName || !nextGroup) return;
    const duplicateName = (form.boardCardFields.workflowStages || []).some(
      (stage) =>
        String(stage?.name || "")
          .trim()
          .toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicateName) {
      onNotify?.("Column name already in use in this project.", "error");
      return;
    }
    const newKeyBase = "stage";
    setForm((prev) => {
      const existing = [...prev.boardCardFields.workflowStages];
      const newStage = {
        key: toUniqueStageKey(newKeyBase, existing),
        name: nextName,
        counterGroup: nextGroup,
      };
      const nextStages = [...existing];
      const afterKey = String(newStageDraft.afterKey || "").trim();
      let insertAt = -1;
      if (afterKey && afterKey !== STAGE_PLACEMENT_START) {
        if (afterKey === STAGE_PLACEMENT_END) {
          const rank = { upcoming: 0, active: 1, done: 2 };
          const nextRank = rank[nextGroup] ?? 1;
          const firstInGroup = nextStages.findIndex(
            (stage) => (rank[stage.counterGroup] ?? 1) === nextRank,
          );
          const firstAfterGroup = nextStages.findIndex(
            (stage) => (rank[stage.counterGroup] ?? 1) > nextRank,
          );
          if (firstInGroup >= 0) {
            insertAt =
              firstAfterGroup >= 0 ? firstAfterGroup : nextStages.length;
          } else {
            insertAt =
              firstAfterGroup >= 0 ? firstAfterGroup : nextStages.length;
          }
        } else {
          const afterIndex = nextStages.findIndex(
            (stage) => stage.key === afterKey,
          );
          insertAt = afterIndex >= 0 ? afterIndex + 1 : -1;
        }
      }
      if (insertAt < 0) {
        const rank = { upcoming: 0, active: 1, done: 2 };
        const nextRank = rank[nextGroup] ?? 1;
        const firstInGroup = nextStages.findIndex(
          (stage) => (rank[stage.counterGroup] ?? 1) === nextRank,
        );
        if (firstInGroup >= 0) {
          insertAt = firstInGroup;
        } else {
          insertAt = nextStages.findIndex(
            (stage) => (rank[stage.counterGroup] ?? 1) > nextRank,
          );
        }
        if (insertAt < 0) insertAt = nextStages.length;
      }
      nextStages.splice(insertAt, 0, newStage);
      const sortedStages = sortStagesByRollup(nextStages);
      const newStageIndex = sortedStages.findIndex(
        (stage) => stage.key === newStage.key,
      );
      const nextStage = sortedStages[newStageIndex + 1];
      const nextTransitions = normalizeTransitions(
        prev.workflowRules?.transitions,
        sortedStages,
      );
      if (
        nextStage &&
        !nextTransitions.some(
          (transition) =>
            transition.from === newStage.key && transition.to === nextStage.key,
        )
      ) {
        nextTransitions.push({
          from: newStage.key,
          to: nextStage.key,
          allowAllUsers: false,
          allowedUserIds: [],
          allowedGroupIds: [],
        });
      }
      return {
        ...prev,
        boardCardFields: {
          ...prev.boardCardFields,
          workflowStages: sortedStages,
        },
        workflowRules: {
          ...(prev.workflowRules || {}),
          transitions: normalizeTransitions(nextTransitions, sortedStages),
        },
      };
    });
    setShowAddStageModal(false);
    setNewStageDraft({
      name: "",
      counterGroup: "",
      afterKey: STAGE_PLACEMENT_START,
    });
  };

  const stages = form.boardCardFields.workflowStages || [];
  const addStagePlacementOptions = newStageDraft.counterGroup
    ? stages.filter(
        (stage) => stage.counterGroup === newStageDraft.counterGroup,
      )
    : [];
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  const stageNameByKey = new Map(
    stages.map((stage) => [stage.key, stage.name]),
  );
  const workflowTransitions = normalizeTransitions(
    form.workflowRules?.transitions,
    stages,
  );
  const dialogDestinationOptions = stageDeleteDialog
    ? stages.filter(
        (stage) =>
          stage.key !== stageDeleteDialog.stageKey &&
          String(stage.counterGroup || "") ===
            String(stageDeleteDialog.counterGroup || ""),
      )
    : [];

  const setWorkflowTransitions = (transitions) => {
    setForm((prev) => ({
      ...prev,
      workflowRules: {
        ...(prev.workflowRules || {}),
        transitions: normalizeTransitions(
          transitions,
          prev.boardCardFields.workflowStages,
        ),
      },
    }));
  };

  const addTransition = (from, to) => {
    const transitions = [...workflowTransitions];
    const idx = transitions.findIndex((t) => t.from === from && t.to === to);
    if (idx >= 0) {
      onNotify?.("This workflow move already exists.", "error");
      return false;
    }
    transitions.push({
      from,
      to,
      allowAllUsers: false,
      allowedUserIds: [],
      allowedGroupIds: [],
    });
    setWorkflowTransitions(transitions);
    return true;
  };

  const removeTransition = (from, to) => {
    const transitions = [...workflowTransitions];
    const idx = transitions.findIndex((t) => t.from === from && t.to === to);
    if (idx < 0) return;
    transitions.splice(idx, 1);
    setWorkflowTransitions(transitions);
  };

  const setTransitionUser = (from, to, userId, checked) => {
    const transitions = [...workflowTransitions];
    const idx = transitions.findIndex((t) => t.from === from && t.to === to);
    if (idx < 0) return;
    const allowed = Array.isArray(transitions[idx].allowedUserIds)
      ? transitions[idx].allowedUserIds
      : [];
    transitions[idx] = {
      ...transitions[idx],
      allowedUserIds: checked
        ? [...new Set([...allowed, userId])]
        : allowed.filter((id) => id !== userId),
    };
    setWorkflowTransitions(transitions);
  };

  const setTransitionGroup = (from, to, groupId, checked) => {
    const transitions = [...workflowTransitions];
    const idx = transitions.findIndex((t) => t.from === from && t.to === to);
    if (idx < 0) return;
    const allowed = Array.isArray(transitions[idx].allowedGroupIds)
      ? transitions[idx].allowedGroupIds
      : [];
    transitions[idx] = {
      ...transitions[idx],
      allowedGroupIds: checked
        ? [...new Set([...allowed, groupId])]
        : allowed.filter((id) => id !== groupId),
    };
    setWorkflowTransitions(transitions);
  };

  const setTransitionAllUsers = (from, to, checked) => {
    const transitions = [...workflowTransitions];
    const idx = transitions.findIndex((t) => t.from === from && t.to === to);
    if (idx < 0) return;
    transitions[idx] = {
      ...transitions[idx],
      allowAllUsers: checked,
    };
    setWorkflowTransitions(transitions);
  };

  const addRepoMapping = async () => {
    const repo = String(repoDraft.repo || "").trim();
    if (!repo || !projectId) return;
    try {
      const created = await apiRequest(
        `/github/projects/${encodeURIComponent(projectId)}/repos`,
        {
          method: "POST",
          body: JSON.stringify({
            repo,
            defaultBranch:
              String(repoDraft.defaultBranch || "").trim() || "develop",
            githubInstallationId: repoDraft.githubInstallationId
              ? Number(repoDraft.githubInstallationId)
              : null,
          }),
        },
      );
      setGithubRepos((prev) => [...prev, created]);
      setRepoDraft({
        repo: "",
        defaultBranch: "develop",
        githubInstallationId: "",
      });
      setShowAddRepoModal(false);
      onNotify?.("Repository mapping added.", "success");
    } catch (error) {
      onNotify?.(error.message || "Failed to add repository.", "error");
    }
  };

  const toggleRepoEnabled = async (repoItem, nextEnabled) => {
    if (!projectId) return;
    try {
      const updated = await apiRequest(
        `/github/projects/${encodeURIComponent(projectId)}/repos/${encodeURIComponent(repoItem.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ isEnabled: nextEnabled }),
        },
      );
      setGithubRepos((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      onNotify?.(
        error.message || "Failed to update repository mapping.",
        "error",
      );
    }
  };

  const removeRepoMapping = async (repoId) => {
    if (!projectId) return;
    try {
      await apiRequest(
        `/github/projects/${encodeURIComponent(projectId)}/repos/${encodeURIComponent(repoId)}`,
        { method: "DELETE" },
      );
      setGithubRepos((prev) => prev.filter((item) => item.id !== repoId));
    } catch (error) {
      onNotify?.(
        error.message || "Failed to remove repository mapping.",
        "error",
      );
    }
  };

  const saveAutomationRules = async (nextRules) => {
    if (!projectId) return;
    try {
      const saved = await apiRequest(
        `/github/projects/${encodeURIComponent(projectId)}/automation-rules`,
        {
          method: "PUT",
          body: JSON.stringify({ rules: nextRules }),
        },
      );
      setAutomationRules(Array.isArray(saved) ? saved : []);
    } catch (error) {
      onNotify?.(error.message || "Failed to save automation rules.", "error");
    }
  };

  const toAutomationRuleSignature = (rule) => {
    const eventType = String(rule?.eventType || "")
      .trim()
      .toLowerCase();
    const targetStatus = String(rule?.actions?.targetStatus || "")
      .trim()
      .toLowerCase();
    const baseBranch = String(rule?.conditions?.baseBranch || "")
      .trim()
      .toLowerCase();
    const branchIncludes = String(rule?.conditions?.branchIncludes || "")
      .trim()
      .toLowerCase();
    const requireTaskKey = rule?.conditions?.requireTaskKey === true ? "1" : "0";
    return [eventType, targetStatus, baseBranch, branchIncludes, requireTaskKey].join(
      "|",
    );
  };

  const addAutomationRule = async () => {
    const eventType = String(ruleDraft.eventType || "").trim();
    const targetStatus = String(ruleDraft.targetStatus || "").trim();
    if (!eventType || !targetStatus) return;
    const newRule = {
      eventType,
      isEnabled: true,
      priority: automationRules.length + 1,
      conditions: {
        requireTaskKey: true,
        ...(ruleDraft.branchScope === "specific" && ruleDraft.baseBranch
          ? { baseBranch: String(ruleDraft.baseBranch).trim() }
          : {}),
      },
      actions: { targetStatus },
    };
    const nextSignature = toAutomationRuleSignature(newRule);
    const hasDuplicate = automationRules.some(
      (rule) => toAutomationRuleSignature(rule) === nextSignature,
    );
    if (hasDuplicate) {
      onNotify?.("An identical automation rule already exists.", "error");
      return;
    }
    const nextRules = [...automationRules, newRule];
    await saveAutomationRules(nextRules);
    setRuleDraft(EMPTY_AUTOMATION_RULE_DRAFT);
    setShowAddAutomationModal(false);
  };

  const deleteAutomationRule = async (ruleId) => {
    const nextRules = automationRules.filter((rule) => rule.id !== ruleId);
    await saveAutomationRules(nextRules);
  };

  const runManualResync = async () => {
    if (!projectId) return;
    try {
      const result = await apiRequest(
        `/github/projects/${encodeURIComponent(projectId)}/resync`,
        {
          method: "POST",
          body: "{}",
        },
      );
      onNotify?.(
        `Resync finished: ${result?.linksUpserted || 0} links refreshed.`,
        "success",
      );
    } catch (error) {
      onNotify?.(error.message || "Failed to run GitHub resync.", "error");
    }
  };

  return (
    <section className="grid gap-[0.8rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]">
      <div className="flex items-center justify-between gap-3">
        <h2>
          <strong>Project settings : </strong> {projectName}
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        <div
          className="flex flex-wrap gap-1 rounded-lg border border-[#dfe3ea] bg-[#f4f5f7] p-[0.15rem]"
          role="tablist"
          aria-label="Settings categories"
        >
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              className={`m-0 rounded-md border-none bg-transparent px-[0.85rem] py-[0.45rem] text-[0.88rem] font-medium text-[#42526e] transition-colors hover:bg-white/65 hover:text-[#172b4d] ${activeTab === tab.id ? "bg-white text-[#172b4d] shadow-[0_1px_2px_rgba(9,30,66,0.12)]" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-8">
          {activeTab === "board-columns" ? (
            <article
              id="settings-panel-board-columns"
              role="tabpanel"
              aria-labelledby="settings-tab-board-columns"
              className="grid max-w-full gap-[0.55rem] rounded-lg border border-[#dfe3ea] bg-white p-[0.7rem]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-[1rem] font-bold text-[#172b4d]">
                    Board columns
                  </h3>
                  <p className="mt-[0.2rem] max-w-[62ch] text-[0.82rem] leading-[1.35] text-[#6b778c]">
                    Define the statuses shown on your board. Each column maps to
                    a task status and roll-up group (Not started, Active, or
                    Done). Drag columns to reorder within the same roll-up
                    group, and use remove to migrate tasks to another column in
                    that group.
                  </p>
                </div>
                {canManage ? (
                  <button type="button" onClick={addStage}>
                    Add stage
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                {stages.map((stage, index) => (
                  <div
                    key={stage.key}
                    className={`flex items-start gap-[0.6rem] rounded-lg border border-[#dfe1e6] bg-white px-[0.75rem] py-[0.65rem] transition-[border-color,background-color,box-shadow,transform,opacity] duration-150 ${allowedDropIndexes.has(index) ? "border-[#1a7f37] bg-[#eefcf2] shadow-[inset_0_0_0_1px_rgba(26,127,55,0.16)]" : ""} ${blockedDropIndexes.has(index) ? "border-red-600 bg-[#fff2f2] ring-1 ring-red-300" : ""} ${stageDragState.fromIndex === index ? "opacity-65" : ""} ${stageDragState.overIndex === index ? "-translate-y-px" : ""}`}
                    onDragEnter={(e) => {
                      if (!canManage || dragFromRef.current == null) return;
                      e.preventDefault();
                      setStageDragState((prev) => ({
                        ...prev,
                        overIndex: index,
                      }));
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromKey = dragFromRef.current;
                      if (!fromKey) return;
                      if (allowedDropIndexes.has(index)) {
                        setForm((prev) => {
                          const fromIndex =
                            prev.boardCardFields.workflowStages.findIndex(
                              (item) => String(item.key) === String(fromKey),
                            );
                          if (fromIndex < 0) return prev;
                          const reordered = reorderWorkflow(
                            prev.boardCardFields.workflowStages,
                            fromIndex,
                            index,
                          );
                          const sortedStages = sortStagesByRollup(reordered);
                          return {
                            ...prev,
                            boardCardFields: {
                              ...prev.boardCardFields,
                              workflowStages: sortedStages,
                            },
                            workflowRules: {
                              ...(prev.workflowRules || {}),
                              transitions: normalizeTransitions(
                                prev.workflowRules?.transitions,
                                sortedStages,
                              ),
                            },
                          };
                        });
                      } else if (blockedDropIndexes.has(index)) {
                        setBlockedDropIndexes((prev) => {
                          const next = new Set(prev);
                          next.add(index);
                          return next;
                        });
                        window.clearTimeout(blockedDropTimeoutRef.current);
                        blockedDropTimeoutRef.current = window.setTimeout(
                          () => {
                            setBlockedDropIndexes(new Set());
                            setBlockedDropReason("");
                          },
                          900,
                        );
                      }
                      dragFromRef.current = null;
                      setStageDragState({
                        fromIndex: -1,
                        fromKey: "",
                        fromGroup: "",
                        overIndex: -1,
                      });
                      setAllowedDropIndexes(new Set());
                      setBlockedDropIndexes(new Set());
                      setBlockedDropReason("");
                    }}
                  >
                    <button
                      type="button"
                      className="grid h-10 w-8 flex-shrink-0 place-items-center rounded-md border-none bg-[#f4f5f7] p-0 text-[#6b778c] disabled:cursor-not-allowed disabled:opacity-50"
                      draggable={
                        canManage && !BUILTIN_STAGE_KEYS.has(stage.key)
                      }
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                      onDragStart={(e) => {
                        if (!canManage || BUILTIN_STAGE_KEYS.has(stage.key))
                          return;
                        dragFromRef.current = String(stage.key || "");
                        const nextAllowed = new Set();
                        const nextBlocked = new Set();
                        stages.forEach((candidate, candidateIndex) => {
                          if (candidateIndex === index) return;
                          if (
                            String(candidate.counterGroup || "") ===
                            String(stage.counterGroup || "")
                          ) {
                            nextAllowed.add(candidateIndex);
                          } else {
                            nextBlocked.add(candidateIndex);
                          }
                        });
                        setAllowedDropIndexes(nextAllowed);
                        setBlockedDropIndexes(nextBlocked);
                        setBlockedDropReason(
                          "Columns can only be reordered within the same roll-up group. Built-in columns cannot be dragged, but can be used as drop targets.",
                        );
                        setStageDragState({
                          fromIndex: index,
                          fromKey: String(stage.key || ""),
                          fromGroup: String(stage.counterGroup || ""),
                          overIndex: -1,
                        });
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          "text/plain",
                          String(stage.key || ""),
                        );
                      }}
                      onDragEnd={() => {
                        dragFromRef.current = null;
                        setStageDragState({
                          fromIndex: -1,
                          fromKey: "",
                          fromGroup: "",
                          overIndex: -1,
                        });
                        setAllowedDropIndexes(new Set());
                        setBlockedDropIndexes(new Set());
                        setBlockedDropReason("");
                      }}
                      disabled={!canManage || BUILTIN_STAGE_KEYS.has(stage.key)}
                    >
                      <span
                        className="grid grid-cols-2 justify-center gap-x-1 gap-y-[3px]"
                        aria-hidden
                      >
                        <span className="h-[3px] w-[3px] rounded-full bg-[#7a869a]" />
                        <span className="h-[3px] w-[3px] rounded-full bg-[#7a869a]" />
                        <span className="h-[3px] w-[3px] rounded-full bg-[#7a869a]" />
                        <span className="h-[3px] w-[3px] rounded-full bg-[#7a869a]" />
                        <span className="h-[3px] w-[3px] rounded-full bg-[#7a869a]" />
                        <span className="h-[3px] w-[3px] rounded-full bg-[#7a869a]" />
                      </span>
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col gap-[0.35rem]">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="min-w-[8rem] flex-1 rounded border border-[#dfe1e6] px-[0.5rem] py-[0.35rem] font-bold"
                          value={stage.name}
                          placeholder="Stage name"
                          disabled={!canManage}
                          onChange={(e) =>
                            updateStageAt(index, { name: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-[0.78rem]">
                        <span
                          className="text-[#5e6c84]"
                          title="Stored on tasks; used in API"
                        >
                          Key: <code>{stage.key}</code>
                          {BUILTIN_STAGE_KEYS.has(stage.key)
                            ? " · built-in"
                            : ""}
                        </span>
                        <label className="flex items-center gap-[0.35rem] text-[0.78rem] text-[#42526e]">
                          Backlog roll-up
                          <select
                            value={stage.counterGroup || ""}
                            disabled={!canManage}
                            onChange={(e) =>
                              updateStageAt(index, {
                                counterGroup: e.target.value,
                              })
                            }
                          >
                            <option value="">Select roll-up</option>
                            <option value="upcoming">Not started (red)</option>
                            <option value="active">Active (blue)</option>
                            <option value="done">Done (green)</option>
                          </select>
                        </label>
                      </div>
                    </div>
                    {canManage && !BUILTIN_STAGE_KEYS.has(stage.key) ? (
                      <button
                        type="button"
                        className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() => {
                          const destinations = stages.filter(
                            (candidate) =>
                              candidate.key !== stage.key &&
                              String(candidate.counterGroup || "") ===
                                String(stage.counterGroup || ""),
                          );
                          if (!destinations.length) return;
                          setStageDeleteDialog({
                            index,
                            stageKey: stage.key,
                            stageName: stage.name,
                            counterGroup: stage.counterGroup || "",
                            destinationKey: "",
                          });
                        }}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="w-[4.5rem] flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
              {stageDragState.fromIndex >= 0 && blockedDropReason ? (
                <div className="rounded-lg border border-dashed border-red-600 bg-[#fff6f6] px-[0.7rem] py-[0.6rem] text-[0.82rem] leading-[1.35] text-[#7f1d1d]">
                  {blockedDropReason}
                </div>
              ) : null}
            </article>
          ) : null}

          {activeTab === "labels" ? (
            <article
              id="settings-panel-labels"
              role="tabpanel"
              aria-labelledby="settings-tab-labels"
              className="grid max-w-full gap-[0.55rem] rounded-lg border border-[#dfe3ea] bg-white p-[0.7rem]"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[1rem] font-bold text-[#172b4d]">Labels</h3>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setShowAddLabelModal(true)}
                  >
                    Add Label
                  </button>
                ) : null}
              </div>
              <p className="text-[0.82rem] text-[#6b778c]">
                Manage reusable task labels for this project.
              </p>
              <div className="grid grid-cols-1 gap-[0.42rem] sm:grid-cols-2 lg:grid-cols-3">
                {labels.length ? (
                  labels.map((label) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-[0.5rem] rounded-[10px] border border-[#e2e7f1] bg-[#f8fbff] px-[0.55rem] py-[0.45rem]"
                    >
                      <span className="truncate rounded-full border border-[#c1d3ff] bg-[#edf3ff] px-[0.52rem] py-[0.2rem] text-[0.75rem] font-semibold text-[#1f3f7f]">
                        {label}
                      </span>
                      {canManage ? (
                        <button
                          type="button"
                          className="border border-[#dfe1e6] bg-transparent text-[0.78rem] text-[#42526e] hover:bg-[#f4f5f7]"
                          onClick={() => removeLabel(label)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-[#5e6c84]">No labels configured yet.</p>
                )}
              </div>
            </article>
          ) : null}
          {activeTab === "types" ? (
            <article
              id="settings-panel-types"
              role="tabpanel"
              aria-labelledby="settings-tab-types"
              className="grid max-w-full gap-[0.55rem] rounded-lg border border-[#dfe3ea] bg-white p-[0.7rem]"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[1rem] font-bold text-[#172b4d]">Types</h3>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setShowAddTypeModal(true)}
                  >
                    Add Type
                  </button>
                ) : null}
              </div>
              <p className="text-[0.82rem] text-[#6b778c]">
                Configure available work item types.
              </p>
              <div className="grid grid-cols-1 gap-[0.42rem] sm:grid-cols-2 lg:grid-cols-3">
                {types.length ? (
                  types.map((type) => {
                    const meta = getWorkTypeMeta(type);
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between gap-[0.5rem] rounded-[10px] border border-[#e2e7f1] bg-[#f8fbff] px-[0.55rem] py-[0.45rem]"
                      >
                        <span className="truncate rounded-full border border-[#c1d3ff] bg-[#edf3ff] px-[0.52rem] py-[0.2rem] text-[0.75rem] font-semibold text-[#1f3f7f]">
                          {meta.label}
                        </span>
                        {canManage ? (
                          <button
                            type="button"
                            className="border border-[#dfe1e6] bg-transparent text-[0.78rem] text-[#42526e] hover:bg-[#f4f5f7]"
                            onClick={() => removeType(type)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[#5e6c84]">No types configured yet.</p>
                )}
              </div>
            </article>
          ) : null}
          {activeTab === "versions" ? (
            <article
              id="settings-panel-versions"
              role="tabpanel"
              aria-labelledby="settings-tab-versions"
              className="grid max-w-full gap-[0.55rem] rounded-lg border border-[#dfe3ea] bg-white p-[0.7rem]"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[1rem] font-bold text-[#172b4d]">
                  Versions
                </h3>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setShowAddVersionModal(true)}
                  >
                    Add Version
                  </button>
                ) : null}
              </div>
              <p className="text-[0.82rem] text-[#6b778c]">
                Track release versions used by tasks.
              </p>
              <div className="grid grid-cols-1 gap-[0.42rem] sm:grid-cols-2 lg:grid-cols-3">
                {versions.length ? (
                  versions.map((version) => (
                    <div
                      key={version}
                      className="flex items-center justify-between gap-[0.5rem] rounded-[10px] border border-[#e2e7f1] bg-[#f8fbff] px-[0.55rem] py-[0.45rem]"
                    >
                      <span className="truncate rounded-full border border-[#c1d3ff] bg-[#edf3ff] px-[0.52rem] py-[0.2rem] text-[0.75rem] font-semibold text-[#1f3f7f]">
                        {version}
                      </span>
                      {canManage ? (
                        <button
                          type="button"
                          className="border border-[#dfe1e6] bg-transparent text-[0.78rem] text-[#42526e] hover:bg-[#f4f5f7]"
                          onClick={() => removeVersion(version)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-[#5e6c84]">No versions configured yet.</p>
                )}
              </div>
            </article>
          ) : null}
          {activeTab === "workflow" ? (
            <article
              id="settings-panel-workflow"
              role="tabpanel"
              aria-labelledby="settings-tab-workflow"
              className="grid max-w-full gap-[0.55rem] rounded-lg border border-[#dfe3ea] bg-white p-[0.7rem]"
            >
              <h3 className="text-[1rem] font-bold text-[#172b4d]">
                Workflow rules
              </h3>
              <p className="max-w-[72ch] text-[0.82rem] leading-[1.35] text-[#6b778c]">
                Workflow rules control which status moves are allowed and who
                can perform them. Add a move from one stage to another, then
                allow all users or select specific users/groups. If no users or
                groups are selected for a move, or a move is not created that
                transition is blocked.
              </p>
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <label className="grid gap-[0.25rem] text-[0.82rem] font-semibold text-[#42526e]">
                  From stage
                  <span className="relative inline-flex min-w-[11rem]">
                    <select
                      className="w-full appearance-none rounded-[10px] border border-[#c7d2e5] bg-white px-[0.65rem] pr-8 text-[0.9rem] text-[#172b4d]"
                      value={workflowFromKey}
                      onChange={(e) => setWorkflowFromKey(e.target.value)}
                      disabled={!canManage}
                    >
                      <option value="">From stage</option>
                      {stages.map((stage) => (
                        <option key={`from-${stage.key}`} value={stage.key}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-2 inline-flex items-center text-[#6b778c]">
                      ▾
                    </span>
                  </span>
                </label>
                <label className="grid gap-[0.25rem] text-[0.82rem] font-semibold text-[#42526e]">
                  To stage
                  <span className="relative inline-flex min-w-[11rem]">
                    <select
                      className="w-full appearance-none rounded-[10px] border border-[#c7d2e5] bg-white px-[0.65rem] pr-8 text-[0.9rem] text-[#172b4d]"
                      value={workflowToKey}
                      onChange={(e) => setWorkflowToKey(e.target.value)}
                      disabled={!canManage}
                    >
                      <option value="">To stage</option>
                      {stages.map((stage) => (
                        <option key={`to-${stage.key}`} value={stage.key}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-2 inline-flex items-center text-[#6b778c]">
                      ▾
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={
                    !canManage ||
                    !workflowFromKey ||
                    !workflowToKey ||
                    workflowFromKey === workflowToKey
                  }
                  onClick={() => {
                    const created = addTransition(
                      workflowFromKey,
                      workflowToKey,
                    );
                    if (created) {
                      setWorkflowFromKey("");
                      setWorkflowToKey("");
                    }
                  }}
                >
                  Add move
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {workflowTransitions.map((transition) => (
                  <div
                    key={`${transition.from}->${transition.to}`}
                    className="flex items-start gap-[0.6rem] rounded-lg border border-[#dfe1e6] bg-white px-[0.75rem] py-[0.65rem]"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-[0.35rem]">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{`${stageNameByKey.get(transition.from) || transition.from} -> ${stageNameByKey.get(transition.to) || transition.to}`}</strong>
                        <button
                          type="button"
                          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                          disabled={!canManage}
                          onClick={() =>
                            removeTransition(transition.from, transition.to)
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-[0.4rem]">
                        <label
                          key={`${transition.from}-${transition.to}-all-users`}
                          className="flex items-center gap-[0.35rem] text-[0.85rem]"
                        >
                          <input
                            type="checkbox"
                            checked={transition.allowAllUsers === true}
                            disabled={!canManage}
                            onChange={(e) =>
                              setTransitionAllUsers(
                                transition.from,
                                transition.to,
                                e.target.checked,
                              )
                            }
                          />
                          <span>All users</span>
                        </label>
                        {projectMembers.map((member) => (
                          <label
                            key={`${transition.from}-${transition.to}-${member.id}`}
                            className="flex items-center gap-[0.35rem] text-[0.85rem]"
                          >
                            <input
                              type="checkbox"
                              checked={(
                                transition.allowedUserIds || []
                              ).includes(member.id)}
                              disabled={!canManage}
                              onChange={(e) =>
                                setTransitionUser(
                                  transition.from,
                                  transition.to,
                                  member.id,
                                  e.target.checked,
                                )
                              }
                            />
                            <span>{member.name}</span>
                          </label>
                        ))}
                        {userGroups.map((group) => (
                          <label
                            key={`${transition.from}-${transition.to}-group-${group.id}`}
                            className="flex items-center gap-[0.35rem] text-[0.85rem]"
                          >
                            <input
                              type="checkbox"
                              checked={(
                                transition.allowedGroupIds || []
                              ).includes(group.id)}
                              disabled={!canManage}
                              onChange={(e) =>
                                setTransitionGroup(
                                  transition.from,
                                  transition.to,
                                  group.id,
                                  e.target.checked,
                                )
                              }
                            />
                            <span>{`Group: ${group.name}`}</span>
                          </label>
                        ))}
                      </div>
                      {transition.allowAllUsers ? (
                        <p className="text-[#5e6c84]">
                          All assigned project users can move this transition.
                        </p>
                      ) : (transition.allowedUserIds || []).length === 0 &&
                        (transition.allowedGroupIds || []).length === 0 ? (
                        <p className="text-[#5e6c84]">
                          No users selected: this transition is blocked.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
          {activeTab === "integrations" ? (
            <article
              id="settings-panel-integrations"
              role="tabpanel"
              aria-labelledby="settings-tab-integrations"
              className="grid max-w-full gap-[0.75rem] rounded-lg border border-[#dfe3ea] bg-white p-[0.8rem]"
            >
              <div className="grid gap-[0.25rem]">
                <h3 className="text-[1rem] font-bold text-[#172b4d]">
                  GitHub integrations
                </h3>
                <p className="text-[0.82rem] leading-[1.35] text-[#6b778c]">
                  Connect repositories and define automation rules for task
                  transitions based on GitHub events.
                </p>
              </div>

              <div className="grid gap-[0.45rem] rounded-[12px] border border-[#dfe3ea] bg-[#fbfcff] p-[0.75rem]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-[0.2rem]">
                    <strong className="text-[0.94rem] text-[#172b4d]">
                      Repository mapping
                    </strong>
                    <p className="text-[0.8rem] text-[#6b778c]">
                      Owner/org from global settings:{" "}
                      <code>{appGithubOrg || "Not configured"}</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="border border-[#0b63c5] bg-[#0b6bcb] text-white hover:border-[#0957a3] hover:bg-[#095db2]"
                    disabled={!canManage || !appGithubOrg}
                    onClick={() => setShowAddRepoModal(true)}
                  >
                    Add repository
                  </button>
                </div>
              </div>

              <div className="grid gap-[0.55rem] rounded-[12px] border border-[#dfe3ea] bg-white p-[0.75rem]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong className="text-[0.94rem] text-[#172b4d]">
                    Connected repositories
                  </strong>
                  <button
                    type="button"
                    className="border border-[#d0d7e2] bg-[#f7f8fa] text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55]"
                    disabled={!canManage}
                    onClick={runManualResync}
                  >
                    Run manual resync
                  </button>
                </div>
                {githubRepos.length === 0 ? (
                  <p className="text-[#5e6c84]">
                    No repositories connected yet.
                  </p>
                ) : (
                  githubRepos.map((repoItem) => (
                    <div
                      key={repoItem.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#e6ebf3] bg-[#f8fbff] px-[0.7rem] py-[0.55rem]"
                    >
                      <div className="grid gap-[0.1rem] text-[0.86rem]">
                        <div>
                          <strong>{repoItem.owner}</strong>/{repoItem.repo}
                        </div>
                        <div className="text-[0.78rem] text-[#5e6c84]">
                          Base branch:{" "}
                          <code>{repoItem.defaultBranch || "develop"}</code>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!canManage}
                          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                          onClick={() =>
                            toggleRepoEnabled(repoItem, !repoItem.isEnabled)
                          }
                        >
                          {repoItem.isEnabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          disabled={!canManage}
                          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                          onClick={() => removeRepoMapping(repoItem.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="grid gap-[0.55rem] rounded-[12px] border border-[#dfe3ea] bg-white p-[0.75rem]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-[0.2rem]">
                    <strong className="text-[0.94rem] text-[#172b4d]">
                      Automation rules
                    </strong>
                    <p className="text-[0.8rem] text-[#6b778c]">
                      Configure status transitions by event. Rules run in
                      priority order.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="border border-[#0b63c5] bg-[#0b6bcb] text-white hover:border-[#0957a3] hover:bg-[#095db2]"
                    disabled={!canManage}
                    onClick={() => {
                      setRuleDraft(EMPTY_AUTOMATION_RULE_DRAFT);
                      setShowAddAutomationModal(true);
                    }}
                  >
                    Add automation rule
                  </button>
                </div>
                {automationRules.length === 0 ? (
                  <p className="text-[#5e6c84]">
                    No automation rules configured yet.
                  </p>
                ) : (
                  automationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#e6ebf3] bg-[#f8fbff] px-[0.7rem] py-[0.55rem]"
                    >
                      <div className="grid gap-[0.1rem] text-[0.86rem]">
                        <div>
                          <strong>{rule.eventType}</strong> {"->"}{" "}
                          <code>
                            {stageNameByKey.get(rule?.actions?.targetStatus) ||
                              rule?.actions?.targetStatus ||
                              "-"}
                          </code>
                        </div>
                        <div className="text-[0.78rem] text-[#5e6c84]">
                          {rule?.conditions?.baseBranch
                            ? `Branch: ${rule.conditions.baseBranch}`
                            : "Branch: Any"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canManage}
                        className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                        onClick={() => deleteAutomationRule(rule.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </article>
          ) : null}
          {activeTab === "users" ? (
            <article
              id="settings-panel-users"
              role="tabpanel"
              aria-labelledby="settings-tab-users"
              className="grid max-w-full gap-[0.55rem] rounded-lg border border-[#dfe3ea] bg-white p-[0.7rem]"
            >
              <h3 className="text-[1rem] font-bold text-[#172b4d]">
                Project users
              </h3>
              <p className="text-[0.82rem] leading-[1.35] text-[#6b778c]">
                Assign who can access and work in this project.
              </p>
              <div
                className={`grid grid-cols-3 gap-[0.4rem] ${sortedUsers.length > 6 ? "max-h-[5.75rem] overflow-y-auto pr-1" : ""}`}
              >
                {sortedUsers.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-[0.35rem] text-[0.85rem]"
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.includes(user.id)}
                      onChange={() =>
                        setMemberIds((prev) =>
                          prev.includes(user.id)
                            ? prev.filter((id) => id !== user.id)
                            : [...prev, user.id],
                        )
                      }
                      disabled={!canManage}
                    />
                    <span>{user.name}</span>
                  </label>
                ))}
              </div>
            </article>
          ) : null}
        </div>
      </div>
      {showAddStageModal ? (
        <Modal open={showAddStageModal} onOpenChange={setShowAddStageModal}>
          <div className="flex items-center justify-between gap-3">
            <h3>Add stage</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setShowAddStageModal(false)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <label>
              <span className="inline-flex items-center">
                Stage name <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                value={newStageDraft.name}
                placeholder="Enter stage name"
                onChange={(event) =>
                  setNewStageDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span className="inline-flex items-center">
                Backlog roll-up <span className="ml-1 text-red-600">*</span>
              </span>
              <select
                value={newStageDraft.counterGroup}
                onChange={(event) =>
                  setNewStageDraft((prev) => ({
                    ...prev,
                    counterGroup: event.target.value,
                    afterKey: STAGE_PLACEMENT_START,
                  }))
                }
              >
                <option value="">Select roll-up</option>
                <option value="upcoming">Not started (red)</option>
                <option value="active">Active (blue)</option>
                <option value="done">Done (green)</option>
              </select>
            </label>
            <label>
              Place after
              <select
                value={newStageDraft.afterKey}
                disabled={!newStageDraft.counterGroup}
                onChange={(event) =>
                  setNewStageDraft((prev) => ({
                    ...prev,
                    afterKey: event.target.value,
                  }))
                }
              >
                <option value={STAGE_PLACEMENT_START}>
                  Start of this group
                </option>
                {addStagePlacementOptions.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.name}
                  </option>
                ))}
                <option value={STAGE_PLACEMENT_END}>End of this group</option>
              </select>
            </label>
            <p className="text-[#5e6c84]">
              Column ordering is grouped by roll-up color: red first, blue
              second, green last. Placement applies within the selected roll-up
              group.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setShowAddStageModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createStageFromDraft}
                disabled={
                  !String(newStageDraft.name || "").trim() ||
                  !newStageDraft.counterGroup
                }
              >
                Add stage
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {showAddLabelModal ? (
        <Modal open={showAddLabelModal} onOpenChange={setShowAddLabelModal}>
          <div className="flex items-center justify-between gap-3">
            <h3>Add Label</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setShowAddLabelModal(false)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <label>
              <span className="inline-flex items-center">
                Label <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                value={newLabel}
                placeholder="Enter label name"
                onChange={(event) => setNewLabel(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setShowAddLabelModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!String(newLabel || "").trim()) return;
                  addLabel();
                  setShowAddLabelModal(false);
                }}
              >
                Add Label
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {showAddTypeModal ? (
        <Modal open={showAddTypeModal} onOpenChange={setShowAddTypeModal}>
          <div className="flex items-center justify-between gap-3">
            <h3>Add Type</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setShowAddTypeModal(false)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <label>
              <span className="inline-flex items-center">
                Type <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                value={newType}
                placeholder="Enter type name"
                onChange={(event) => setNewType(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setShowAddTypeModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!String(newType || "").trim()) return;
                  addType();
                  setShowAddTypeModal(false);
                }}
              >
                Add Type
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {showAddVersionModal ? (
        <Modal open={showAddVersionModal} onOpenChange={setShowAddVersionModal}>
          <div className="flex items-center justify-between gap-3">
            <h3>Add Version</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setShowAddVersionModal(false)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <label>
              <span className="inline-flex items-center">
                Version <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                value={newVersion}
                placeholder="Enter version name"
                onChange={(event) => setNewVersion(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setShowAddVersionModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!String(newVersion || "").trim()) return;
                  addVersion();
                  setShowAddVersionModal(false);
                }}
              >
                Add Version
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {showAddRepoModal ? (
        <Modal open={showAddRepoModal} onOpenChange={setShowAddRepoModal}>
          <div className="flex items-center justify-between gap-3">
            <h3>Add repository mapping</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setShowAddRepoModal(false)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <p className="text-[0.82rem] text-[#6b778c]">
              Organization: <strong>{appGithubOrg || "Not configured"}</strong>
            </p>
            <label>
              <span className="inline-flex items-center">
                Repository name <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                placeholder="Enter repository name"
                value={repoDraft.repo}
                onChange={(event) =>
                  setRepoDraft((prev) => ({
                    ...prev,
                    repo: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Default branch
              <input
                placeholder="develop"
                value={repoDraft.defaultBranch}
                onChange={(event) =>
                  setRepoDraft((prev) => ({
                    ...prev,
                    defaultBranch: event.target.value,
                  }))
                }
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setShowAddRepoModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!String(repoDraft.repo || "").trim() || !appGithubOrg}
                onClick={addRepoMapping}
              >
                Add repository
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {showAddAutomationModal ? (
        <Modal
          open={showAddAutomationModal}
          onOpenChange={setShowAddAutomationModal}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Add automation rule</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setShowAddAutomationModal(false)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <label>
              <span className="inline-flex items-center">
                Event trigger <span className="ml-1 text-red-600">*</span>
              </span>
              <select
                value={ruleDraft.eventType}
                onChange={(event) =>
                  setRuleDraft((prev) => ({
                    ...prev,
                    eventType: event.target.value,
                  }))
                }
              >
                <option value="">Select event trigger</option>
                <option value="branch_created">Branch created</option>
                <option value="commit_pushed">Commit pushed</option>
                <option value="pr_opened">PR opened</option>
                <option value="pr_updated">PR updated</option>
                <option value="pr_merged">PR merged</option>
                <option value="pr_closed">PR closed</option>
              </select>
            </label>
            <label>
              <span className="inline-flex items-center">
                Target status <span className="ml-1 text-red-600">*</span>
              </span>
              <select
                value={ruleDraft.targetStatus}
                onChange={(event) =>
                  setRuleDraft((prev) => ({
                    ...prev,
                    targetStatus: event.target.value,
                  }))
                }
              >
                <option value="">Select target status</option>
                {stages.map((stage) => (
                  <option key={`rule-stage-${stage.key}`} value={stage.key}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="branch-filter-options">
              <span>Branch filter</span>
              <label className="branch-scope-option !grid !grid-cols-[16px_auto] !items-center !gap-2">
                <input
                  type="radio"
                  name="rule-branch-scope"
                  className="!m-0 !h-4 !w-4 !min-h-4 !min-w-4 !p-0 !inline-block"
                  checked={ruleDraft.branchScope === "any"}
                  onChange={() =>
                    setRuleDraft((prev) => ({
                      ...prev,
                      branchScope: "any",
                      baseBranch: "",
                    }))
                  }
                />
                <span className="!m-0 !inline-block leading-5">On any branch</span>
              </label>
              <label className="branch-scope-option !grid !grid-cols-[16px_auto] !items-center !gap-2">
                <input
                  type="radio"
                  name="rule-branch-scope"
                  className="!m-0 !h-4 !w-4 !min-h-4 !min-w-4 !p-0 !inline-block"
                  checked={ruleDraft.branchScope === "specific"}
                  onChange={() =>
                    setRuleDraft((prev) => ({
                      ...prev,
                      branchScope: "specific",
                    }))
                  }
                />
                <span className="!m-0 !inline-block leading-5">
                  On specific branch
                </span>
              </label>
              {ruleDraft.branchScope === "specific" ? (
                <input
                  placeholder="develop"
                  value={ruleDraft.baseBranch}
                  onChange={(event) =>
                    setRuleDraft((prev) => ({
                      ...prev,
                      baseBranch: event.target.value,
                    }))
                  }
                />
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => {
                  setRuleDraft(EMPTY_AUTOMATION_RULE_DRAFT);
                  setShowAddAutomationModal(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addAutomationRule}
                disabled={
                  !String(ruleDraft.eventType || "").trim() ||
                  !String(ruleDraft.targetStatus || "").trim()
                }
              >
                Add automation rule
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <div className="flex justify-end gap-2">
        {canManage && (savingSettings || savingMembers) ? (
          <span className="text-[#5e6c84]">Saving...</span>
        ) : null}
      </div>
      {stageDeleteDialog ? (
        <Modal
          open={Boolean(stageDeleteDialog)}
          cardClassName="max-w-[460px]"
          onOpenChange={(open) => {
            if (!open) setStageDeleteDialog(null);
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Delete column</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => setStageDeleteDialog(null)}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <p>
              Move tasks in <strong>{stageDeleteDialog.stageName}</strong> to:
            </p>
            <select
              value={stageDeleteDialog.destinationKey}
              onChange={(event) =>
                setStageDeleteDialog((prev) =>
                  prev ? { ...prev, destinationKey: event.target.value } : prev,
                )
              }
            >
              <option value="">Select destination column</option>
              {dialogDestinationOptions.map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setStageDeleteDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                disabled={!stageDeleteDialog.destinationKey}
                onClick={() => {
                  if (!stageDeleteDialog.destinationKey) return;
                  removeStageAt(
                    stageDeleteDialog.index,
                    stageDeleteDialog.destinationKey,
                  );
                  setStageDeleteDialog(null);
                }}
              >
                Confirm delete
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
