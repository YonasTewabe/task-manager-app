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
  const [form, setForm] = useState(toForm(settings));
  const [memberIds, setMemberIds] = useState(
    projectMembers.map((member) => member.id),
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS[0].id);
  const [workflowFromKey, setWorkflowFromKey] = useState("");
  const [workflowToKey, setWorkflowToKey] = useState("");
  const [showAddStageModal, setShowAddStageModal] = useState(false);
  const [newStageDraft, setNewStageDraft] = useState({
    name: "",
    counterGroup: "",
    afterKey: STAGE_PLACEMENT_START,
  });
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [showAddLabelModal, setShowAddLabelModal] = useState(false);
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [showAddVersionModal, setShowAddVersionModal] = useState(false);
  const [stageMigrations, setStageMigrations] = useState({});
  const [stageDeleteDialog, setStageDeleteDialog] = useState(null);
  const dragFromRef = useRef(null);
  const blockedDropTimeoutRef = useRef(null);
  const lastSavedSettingsRef = useRef("");
  const lastSavedMembersRef = useRef("");
  const [stageDragState, setStageDragState] = useState({
    fromIndex: -1,
    fromKey: "",
    fromGroup: "",
    overIndex: -1,
  });
  const [allowedDropIndexes, setAllowedDropIndexes] = useState(() => new Set());
  const [blockedDropIndexes, setBlockedDropIndexes] = useState(() => new Set());
  const [blockedDropReason, setBlockedDropReason] = useState("");

  useEffect(() => {
    const nextForm = toForm(settings);
    setForm(nextForm);
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
    lastSavedSettingsRef.current = JSON.stringify(
      payloadFromForm(nextForm, {}),
    );
  }, [settings]);

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

  return (
    <section className="panel system-settings-page">
      <div className="panel-head">
        <h2>Project settings: {projectName}</h2>
      </div>

      <div className="settings-tabs">
        <div
          className="settings-tablist"
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
              className={`settings-tab ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-tab-panels">
          {activeTab === "board-columns" ? (
            <article
              id="settings-panel-board-columns"
              role="tabpanel"
              aria-labelledby="settings-tab-board-columns"
              className="settings-section settings-tab-panel"
            >
              <div className="workflow-stages-head">
                <div>
                  <h3>Board columns</h3>
                </div>
                {canManage ? (
                  <button type="button" onClick={addStage}>
                    Add stage
                  </button>
                ) : null}
              </div>

              <div className="workflow-stage-list">
                {stages.map((stage, index) => (
                  <div
                    key={stage.key}
                    className={`workflow-stage-row ${allowedDropIndexes.has(index) ? "drop-allowed" : ""} ${blockedDropIndexes.has(index) ? "drop-blocked" : ""} ${stageDragState.fromIndex === index ? "drop-source" : ""} ${stageDragState.overIndex === index ? "drop-hovered" : ""}`}
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
                      className="workflow-drag-handle"
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
                      <span className="workflow-drag-dots" aria-hidden>
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    </button>
                    <div className="workflow-stage-body">
                      <div className="workflow-stage-topline">
                        <input
                          className="workflow-stage-name"
                          value={stage.name}
                          placeholder="Stage name"
                          disabled={!canManage}
                          onChange={(e) =>
                            updateStageAt(index, { name: e.target.value })
                          }
                        />
                      </div>
                      <div className="workflow-stage-meta">
                        <span
                          className="workflow-stage-key muted"
                          title="Stored on tasks; used in API"
                        >
                          Key: <code>{stage.key}</code>
                          {BUILTIN_STAGE_KEYS.has(stage.key)
                            ? " · built-in"
                            : ""}
                        </span>
                        <label className="workflow-counter-label">
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
                        className="ghost-btn workflow-stage-remove"
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
                      <span className="workflow-stage-remove-spacer" />
                    )}
                  </div>
                ))}
              </div>
              {stageDragState.fromIndex >= 0 && blockedDropReason ? (
                <div className="workflow-drop-hint blocked">
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
              className="settings-section settings-tab-panel"
            >
              <div className="panel-head">
                <h3>Labels</h3>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setShowAddLabelModal(true)}
                  >
                    Add Label
                  </button>
                ) : null}
              </div>
              <div className="member-grid">
                {labels.length ? (
                  labels.map((label) => (
                    <div key={label} className="member-item">
                      <span className="member-pill">{label}</span>
                      {canManage ? (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => removeLabel(label)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="muted">No labels configured yet.</p>
                )}
              </div>
            </article>
          ) : null}
          {activeTab === "types" ? (
            <article
              id="settings-panel-types"
              role="tabpanel"
              aria-labelledby="settings-tab-types"
              className="settings-section settings-tab-panel"
            >
              <div className="panel-head">
                <h3>Types</h3>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setShowAddTypeModal(true)}
                  >
                    Add Type
                  </button>
                ) : null}
              </div>
              <div className="member-grid">
                {types.length ? (
                  types.map((type) => {
                    const meta = getWorkTypeMeta(type);
                    return (
                      <div key={type} className="member-item">
                        <span className="member-pill">{meta.label}</span>
                        {canManage ? (
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => removeType(type)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="muted">No types configured yet.</p>
                )}
              </div>
            </article>
          ) : null}
          {activeTab === "versions" ? (
            <article
              id="settings-panel-versions"
              role="tabpanel"
              aria-labelledby="settings-tab-versions"
              className="settings-section settings-tab-panel"
            >
              <div className="panel-head">
                <h3>Versions</h3>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setShowAddVersionModal(true)}
                  >
                    Add Version
                  </button>
                ) : null}
              </div>
              <div className="member-grid">
                {versions.length ? (
                  versions.map((version) => (
                    <div key={version} className="member-item">
                      <span className="member-pill">{version}</span>
                      {canManage ? (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => removeVersion(version)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="muted">No versions configured yet.</p>
                )}
              </div>
            </article>
          ) : null}
          {activeTab === "workflow" ? (
            <article
              id="settings-panel-workflow"
              role="tabpanel"
              aria-labelledby="settings-tab-workflow"
              className="settings-section settings-tab-panel"
            >
              <h3>Workflow rules</h3>
              <div className="inline-form" style={{ marginBottom: 12 }}>
                <select
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
                <select
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
                <button
                  type="button"
                  disabled={
                    !canManage ||
                    !workflowFromKey ||
                    !workflowToKey ||
                    workflowFromKey === workflowToKey
                  }
                  onClick={() => {
                    const created = addTransition(workflowFromKey, workflowToKey);
                    if (created) {
                      setWorkflowFromKey("");
                      setWorkflowToKey("");
                    }
                  }}
                >
                  Add move
                </button>
              </div>

              <div className="workflow-stage-list">
                {workflowTransitions.map((transition) => (
                  <div
                    key={`${transition.from}->${transition.to}`}
                    className="workflow-stage-row"
                  >
                    <div className="workflow-stage-body">
                      <div className="workflow-stage-topline">
                        <strong>{`${stageNameByKey.get(transition.from) || transition.from} -> ${stageNameByKey.get(transition.to) || transition.to}`}</strong>
                        <button
                          type="button"
                          className="ghost-btn"
                          disabled={!canManage}
                          onClick={() =>
                            removeTransition(transition.from, transition.to)
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="member-grid">
                        <label
                          key={`${transition.from}-${transition.to}-all-users`}
                          className="member-item"
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
                            className="member-item"
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
                            className="member-item"
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
                        <p className="muted">
                          All assigned project users can move this transition.
                        </p>
                      ) : (transition.allowedUserIds || []).length === 0 &&
                        (transition.allowedGroupIds || []).length === 0 ? (
                        <p className="muted">
                          No users selected: this transition is blocked.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
          {activeTab === "users" ? (
            <article
              id="settings-panel-users"
              role="tabpanel"
              aria-labelledby="settings-tab-users"
              className="settings-section settings-tab-panel"
            >
              <h3>Project users</h3>
              <p className="muted">
                Assign who can access and work in this project.
              </p>
              <div
                className={`member-grid ${sortedUsers.length > 6 ? "settings-users-scroll" : ""}`}
              >
                {sortedUsers.map((user) => (
                  <label key={user.id} className="member-item">
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
            <div className="panel-head">
              <h3>Add stage</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowAddStageModal(false)}
              >
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Stage name <span className="required-indicator">*</span>
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
                <span className="field-label">
                  Backlog roll-up <span className="required-indicator">*</span>
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
              <p className="muted">
                Column ordering is grouped by roll-up color: red first, blue
                second, green last. Placement applies within the selected
                roll-up group.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
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
            <div className="panel-head">
              <h3>Add Label</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowAddLabelModal(false)}
              >
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Label <span className="required-indicator">*</span>
                </span>
                <input
                  value={newLabel}
                  placeholder="Enter label name"
                  onChange={(event) => setNewLabel(event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
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
            <div className="panel-head">
              <h3>Add Type</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowAddTypeModal(false)}
              >
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Type <span className="required-indicator">*</span>
                </span>
                <input
                  value={newType}
                  placeholder="Enter type name"
                  onChange={(event) => setNewType(event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
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
            <div className="panel-head">
              <h3>Add Version</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowAddVersionModal(false)}
              >
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Version <span className="required-indicator">*</span>
                </span>
                <input
                  value={newVersion}
                  placeholder="Enter version name"
                  onChange={(event) => setNewVersion(event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
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

      <div className="settings-actions">
        {canManage && (savingSettings || savingMembers) ? (
          <span className="muted">Saving...</span>
        ) : null}
      </div>
      {stageDeleteDialog ? (
        <Modal
          open={Boolean(stageDeleteDialog)}
          onOpenChange={(open) => {
            if (!open) setStageDeleteDialog(null);
          }}
        >
            <div className="panel-head">
              <h3>Delete column</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setStageDeleteDialog(null)}
              >
                X
              </button>
            </div>
            <div className="project-form">
              <p>
                Move tasks in <strong>{stageDeleteDialog.stageName}</strong> to:
              </p>
              <select
                value={stageDeleteDialog.destinationKey}
                onChange={(event) =>
                  setStageDeleteDialog((prev) =>
                    prev
                      ? { ...prev, destinationKey: event.target.value }
                      : prev,
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setStageDeleteDialog(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
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
