import { useEffect, useRef, useState } from "react";
import {
  BUILTIN_STAGE_KEYS,
  DEFAULT_WORKFLOW_STAGES,
} from "../workflowDefaults.js";

const DEFAULT_FORM = {
  boardCardFields: {
    workflowStages: DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s })),
  },
  generalRules: {
    defaultStoryPoints: 3,
    requireAssigneeForInProgress: true,
    autoMoveToBacklogOnSprintComplete: true,
  },
};

function toForm(settings) {
  const wf =
    Array.isArray(settings?.boardCardFields?.workflowStages) &&
    settings.boardCardFields.workflowStages.length > 0
      ? settings.boardCardFields.workflowStages.map((s) => ({ ...s }))
      : DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s }));

  return {
    boardCardFields: {
      workflowStages: wf,
    },
    workflowRules: {
      transitions: normalizeTransitions(
        settings?.workflowRules?.transitions,
        wf,
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

const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "users", label: "Users" },
  { id: "board-columns", label: "Board columns" },
  { id: "workflow", label: "Workflow" },
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

function payloadFromForm(form) {
  return {
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
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS[0].id);
  const [workflowFromKey, setWorkflowFromKey] = useState("");
  const [workflowToKey, setWorkflowToKey] = useState("");
  const dragFromRef = useRef(null);

  useEffect(() => {
    setForm(toForm(settings));
  }, [settings]);

  useEffect(() => {
    setMemberIds(projectMembers.map((member) => member.id));
  }, [projectMembers]);

  const setSectionValue = (section, key, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const updateStageAt = (index, partial) => {
    setForm((prev) => {
      const stages = [...prev.boardCardFields.workflowStages];
      const current = stages[index];
      const nextPartial = { ...partial };
      if (
        partial.name !== undefined &&
        current &&
        !BUILTIN_STAGE_KEYS.has(current.key)
      ) {
        nextPartial.key = toUniqueStageKey(partial.name, stages, index);
      }
      stages[index] = { ...current, ...nextPartial };
      const transitions = normalizeTransitions(
        prev.workflowRules?.transitions,
        stages,
      );
      return {
        ...prev,
        boardCardFields: { ...prev.boardCardFields, workflowStages: stages },
        workflowRules: { ...(prev.workflowRules || {}), transitions },
      };
    });
  };

  const removeStageAt = (index) => {
    const stage = form.boardCardFields.workflowStages[index];
    if (!stage || BUILTIN_STAGE_KEYS.has(stage.key)) return;
    setForm((prev) => {
      const stages = prev.boardCardFields.workflowStages.filter(
        (_, i) => i !== index,
      );
      const transitions = normalizeTransitions(
        prev.workflowRules?.transitions,
        stages,
      );
      return {
        ...prev,
        boardCardFields: {
          ...prev.boardCardFields,
          workflowStages: stages,
        },
        workflowRules: { ...(prev.workflowRules || {}), transitions },
      };
    });
  };

  const addStage = () => {
    const defaultName = "New stage";
    setForm((prev) => ({
      ...prev,
      boardCardFields: {
        ...prev.boardCardFields,
        workflowStages: [
          ...prev.boardCardFields.workflowStages,
          {
            key: toUniqueStageKey(
              defaultName,
              prev.boardCardFields.workflowStages,
            ),
            name: defaultName,
            badge: "",
            counterGroup: "upcoming",
          },
        ],
      },
      workflowRules: {
        ...(prev.workflowRules || {}),
        transitions: normalizeTransitions(prev.workflowRules?.transitions, [
          ...prev.boardCardFields.workflowStages,
          {
            key: toUniqueStageKey(
              defaultName,
              prev.boardCardFields.workflowStages,
            ),
            name: defaultName,
            badge: "",
            counterGroup: "upcoming",
          },
        ]),
      },
    }));
  };

  const stages = form.boardCardFields.workflowStages || [];
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));
  const resetSettingsForm = () => {
    setForm(toForm(settings));
  };
  const resetMembersForm = () => {
    setMemberIds(projectMembers.map((member) => member.id));
  };

  const stageNameByKey = new Map(
    stages.map((stage) => [stage.key, stage.name]),
  );
  const workflowTransitions = normalizeTransitions(
    form.workflowRules?.transitions,
    stages,
  );

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

  const toggleTransition = (from, to) => {
    const transitions = [...workflowTransitions];
    const idx = transitions.findIndex((t) => t.from === from && t.to === to);
    if (idx >= 0) transitions.splice(idx, 1);
    else
      transitions.push({
        from,
        to,
        allowAllUsers: false,
        allowedUserIds: [],
        allowedGroupIds: [],
      });
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
                  <p className="muted workflow-stages-lead"></p>
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
                    className="workflow-stage-row"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragFromRef.current;
                      dragFromRef.current = null;
                      if (from == null) return;
                      setForm((prev) => ({
                        ...prev,
                        boardCardFields: {
                          ...prev.boardCardFields,
                          workflowStages: reorderWorkflow(
                            prev.boardCardFields.workflowStages,
                            from,
                            index,
                          ),
                        },
                      }));
                    }}
                  >
                    <button
                      type="button"
                      className="workflow-drag-handle"
                      draggable={canManage}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                      onDragStart={(e) => {
                        if (!canManage) return;
                        dragFromRef.current = index;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(index));
                      }}
                      onDragEnd={() => {
                        dragFromRef.current = null;
                      }}
                      disabled={!canManage}
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
                        <input
                          className="workflow-stage-badge"
                          value={stage.badge || ""}
                          placeholder="Badge (optional)"
                          disabled={!canManage}
                          onChange={(e) =>
                            updateStageAt(index, { badge: e.target.value })
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
                            value={stage.counterGroup || "upcoming"}
                            disabled={!canManage}
                            onChange={(e) =>
                              updateStageAt(index, {
                                counterGroup: e.target.value,
                              })
                            }
                          >
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
                        onClick={() => removeStageAt(index)}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="workflow-stage-remove-spacer" />
                    )}
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {activeTab === "general" ? (
            <article
              id="settings-panel-general"
              role="tabpanel"
              aria-labelledby="settings-tab-general"
              className="settings-section settings-tab-panel"
            >
              <h3>General</h3>
              <label>
                Default story points
                <input
                  type="number"
                  min="1"
                  max="21"
                  value={form.generalRules.defaultStoryPoints}
                  onChange={(event) =>
                    setSectionValue(
                      "generalRules",
                      "defaultStoryPoints",
                      Number(event.target.value || 3),
                    )
                  }
                  disabled={!canManage}
                />
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={form.generalRules.requireAssigneeForInProgress}
                  onChange={(event) =>
                    setSectionValue(
                      "generalRules",
                      "requireAssigneeForInProgress",
                      event.target.checked,
                    )
                  }
                  disabled={!canManage}
                />
                <span>Require assignee before In Progress</span>
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={form.generalRules.autoMoveToBacklogOnSprintComplete}
                  onChange={(event) =>
                    setSectionValue(
                      "generalRules",
                      "autoMoveToBacklogOnSprintComplete",
                      event.target.checked,
                    )
                  }
                  disabled={!canManage}
                />
                <span>
                  Auto move unfinished tasks to backlog on sprint completion
                </span>
              </label>
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
                    toggleTransition(workflowFromKey, workflowToKey);
                    setWorkflowFromKey("");
                    setWorkflowToKey("");
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
                            toggleTransition(transition.from, transition.to)
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
              <div className="member-grid">
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

      <div className="settings-actions">
        {activeTab === "users" ? (
          <>
            <button
              type="button"
              className="ghost-btn"
              onClick={resetMembersForm}
              disabled={!canManage}
            >
              Reset
            </button>
            {canManage ? (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSaveMembers(memberIds);
                    onNotify?.("Project users saved.", "success");
                  } catch (error) {
                    onNotify?.(error.message || "Failed to save project users.", "error");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving..." : "Save Users"}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              className="ghost-btn"
              onClick={resetSettingsForm}
              disabled={!canManage}
            >
              Reset
            </button>
            {canManage ? (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave(payloadFromForm(form));
                    onNotify?.("Settings saved.", "success");
                  } catch (error) {
                    onNotify?.(error.message || "Failed to save settings.", "error");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
