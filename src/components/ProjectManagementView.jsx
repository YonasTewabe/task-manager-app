import { useState } from "react";

const EMPTY_FORM = {
  name: "",
  projectKey: "",
  description: "",
};

export default function ProjectManagementView({
  projects,
  canManage = false,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onConfigureProject,
  onNotify,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingProjectId(null);
  };

  const startEdit = (project) => {
    setEditingProjectId(project.id);
    setEditForm({
      name: project.name,
      projectKey: project.projectKey,
      description: project.description || "",
    });
    setShowEditModal(true);
  };

  return (
    <section className="panel project-management-page">
      <div className="panel-head">
        <h2>Projects</h2>
        {canManage ? (
          <button type="button" onClick={() => setShowCreateModal(true)}>
            Add Project
          </button>
        ) : null}
      </div>

      {!canManage ? (
        <p className="muted project-page-note">
          You can view projects you belong to. Only administrators can create or
          edit projects.
        </p>
      ) : null}

      <div className="project-list">
        {!projects.length ? (
          <p className="muted">
            {canManage
              ? "No projects yet. Use Add Project to create one."
              : "No projects assigned to you yet. Ask an administrator to add you to a project."}
          </p>
        ) : null}
        {projects.map((project) => (
          <article key={project.id} className="project-row">
            <div className="project-row-main">
              <button
                type="button"
                className="project-row-open"
                onClick={() => onConfigureProject(project.id)}
              >
                <strong>
                  {project.name} ({project.projectKey})
                </strong>
                <div className="muted">
                  {project.description || "No description"}
                </div>
                <div className="project-members">
                  {(project.members || []).map((member) => (
                    <span key={member.id} className="member-pill">
                      {member.name}
                    </span>
                  ))}
                </div>
              </button>
              {canManage ? (
                <div className="inline-form">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => startEdit(project)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteProject(project.id)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {canManage && showCreateModal ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h3>Create Project</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowCreateModal(false)}
              >
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Project Name <span className="required-indicator">*</span>
                </span>
                <input
                  placeholder="Enter project name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </label>
              <label>
                <span className="field-label">
                  Short code <span className="required-indicator">*</span>
                </span>
                <input
                  placeholder="e.g. OPS"
                  value={form.projectKey}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      projectKey: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  placeholder="Enter description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!form.name.trim() || !form.projectKey.trim()) return;
                    const normalizedName = form.name.trim().toLowerCase();
                    const normalizedKey = form.projectKey.trim().toUpperCase();
                    const nameExists = projects.some(
                      (project) =>
                        String(project.name || "")
                          .trim()
                          .toLowerCase() === normalizedName,
                    );
                    if (nameExists) {
                      onNotify?.("Project name already in use.", "error");
                      return;
                    }
                    const keyExists = projects.some(
                      (project) =>
                        String(project.projectKey || "")
                          .trim()
                          .toUpperCase() === normalizedKey,
                    );
                    if (keyExists) {
                      onNotify?.("Project short code already in use.", "error");
                      return;
                    }
                    try {
                      await onCreateProject({
                        name: form.name.trim(),
                        projectKey: normalizedKey,
                        description: form.description,
                      });
                      setForm(EMPTY_FORM);
                      setShowCreateModal(false);
                    } catch (error) {
                      onNotify?.(
                        error?.message || "Failed to create project.",
                        "error",
                      );
                    }
                  }}
                >
                  Create Project
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {canManage && showEditModal && editingProjectId ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeEditModal}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h3>Edit project</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={closeEditModal}
              >
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Project Name <span className="required-indicator">*</span>
                </span>
                <input
                  placeholder="Enter project name"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </label>
              <label>
                <span className="field-label">
                  Short code <span className="required-indicator">*</span>
                </span>

                <input
                  placeholder="e.g. OPS"
                  value={editForm.projectKey}
                  disabled
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      projectKey: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  placeholder="Enter description"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={async () => {
                    const normalizedName = String(editForm.name || "")
                      .trim()
                      .toLowerCase();
                    const normalizedKey = String(editForm.projectKey || "")
                      .trim()
                      .toUpperCase();
                    const duplicateName = projects.some(
                      (project) =>
                        String(project.id) !== String(editingProjectId) &&
                        String(project.name || "")
                          .trim()
                          .toLowerCase() === normalizedName,
                    );
                    if (duplicateName) {
                      onNotify?.("Project name already in use.", "error");
                      return;
                    }
                    const duplicateKey = projects.some(
                      (project) =>
                        String(project.id) !== String(editingProjectId) &&
                        String(project.projectKey || "")
                          .trim()
                          .toUpperCase() === normalizedKey,
                    );
                    if (duplicateKey) {
                      onNotify?.("Project short code already in use.", "error");
                      return;
                    }
                    try {
                      await onUpdateProject(editingProjectId, {
                        ...editForm,
                        name: String(editForm.name || "").trim(),
                        projectKey: normalizedKey,
                      });
                      closeEditModal();
                    } catch (error) {
                      onNotify?.(
                        error?.message || "Failed to update project.",
                        "error",
                      );
                    }
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={closeEditModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
