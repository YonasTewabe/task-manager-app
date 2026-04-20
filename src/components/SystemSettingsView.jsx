import { useEffect, useState } from "react";

const DEFAULT_FORM = {
  boardCardFields: {
    showStoryPoints: true,
    showPriority: true,
    showAssignee: true,
    showLabel: true,
  },
  workflowRules: {
    allowBackMoveFromDone: false,
    requireAssigneeForInProgress: true,
    autoMoveToBacklogOnSprintComplete: true,
  },
  generalRules: {
    defaultStoryPoints: 3,
    enforceUniqueTaskTitlesInSprint: false,
  },
};

function toForm(settings) {
  return {
    boardCardFields: {
      ...DEFAULT_FORM.boardCardFields,
      ...(settings?.boardCardFields || {}),
    },
    workflowRules: {
      ...DEFAULT_FORM.workflowRules,
      ...(settings?.workflowRules || {}),
    },
    generalRules: {
      ...DEFAULT_FORM.generalRules,
      ...(settings?.generalRules || {}),
    },
  };
}

export default function SystemSettingsView({ settings, canManage, onSave }) {
  const [form, setForm] = useState(toForm(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm(toForm(settings));
  }, [settings]);

  const setSectionValue = (section, key, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  return (
    <section className="panel system-settings-page">
      <div className="panel-head">
        <h2>System Settings</h2>
      </div>
      <p className="muted">Configure system-wide board cards, workflow, and rule defaults.</p>

      <div className="settings-grid">
        <article className="settings-section">
          <h3>Board Card Fields</h3>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={form.boardCardFields.showStoryPoints}
              onChange={(event) =>
                setSectionValue("boardCardFields", "showStoryPoints", event.target.checked)
              }
              disabled={!canManage}
            />
            <span>Show story points on cards</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={form.boardCardFields.showPriority}
              onChange={(event) => setSectionValue("boardCardFields", "showPriority", event.target.checked)}
              disabled={!canManage}
            />
            <span>Show priority indicator</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={form.boardCardFields.showAssignee}
              onChange={(event) => setSectionValue("boardCardFields", "showAssignee", event.target.checked)}
              disabled={!canManage}
            />
            <span>Show assignee avatar</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={form.boardCardFields.showLabel}
              onChange={(event) => setSectionValue("boardCardFields", "showLabel", event.target.checked)}
              disabled={!canManage}
            />
            <span>Show label chip</span>
          </label>
        </article>

        <article className="settings-section">
          <h3>Workflow Rules</h3>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={form.workflowRules.allowBackMoveFromDone}
              onChange={(event) =>
                setSectionValue("workflowRules", "allowBackMoveFromDone", event.target.checked)
              }
              disabled={!canManage}
            />
            <span>Allow moving tasks back from Done</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={form.workflowRules.requireAssigneeForInProgress}
              onChange={(event) =>
                setSectionValue("workflowRules", "requireAssigneeForInProgress", event.target.checked)
              }
              disabled={!canManage}
            />
            <span>Require assignee before In Progress</span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={form.workflowRules.autoMoveToBacklogOnSprintComplete}
              onChange={(event) =>
                setSectionValue(
                  "workflowRules",
                  "autoMoveToBacklogOnSprintComplete",
                  event.target.checked,
                )
              }
              disabled={!canManage}
            />
            <span>Auto move unfinished tasks to backlog on sprint completion</span>
          </label>
        </article>

        <article className="settings-section">
          <h3>General Rules</h3>
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
              checked={form.generalRules.enforceUniqueTaskTitlesInSprint}
              onChange={(event) =>
                setSectionValue(
                  "generalRules",
                  "enforceUniqueTaskTitlesInSprint",
                  event.target.checked,
                )
              }
              disabled={!canManage}
            />
            <span>Enforce unique task titles per sprint</span>
          </label>
        </article>
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            setForm(toForm(settings));
            setMessage("");
          }}
        >
          Reset
        </button>
        {canManage ? (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setMessage("");
              try {
                await onSave(form);
                setMessage("Settings saved.");
              } catch (error) {
                setMessage(error.message || "Failed to save settings.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        ) : null}
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </section>
  );
}
