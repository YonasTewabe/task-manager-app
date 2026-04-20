import { useMemo, useState } from "react";

const EMPTY_FORM = {
  name: "",
  projectKey: "",
  description: "",
  memberIds: [],
};

export default function ProjectManagementView({
  projects,
  users,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.name.localeCompare(b.name)), [users]);

  const toggleMember = (targetKey, userId) => {
    const setState = targetKey === "create" ? setForm : setEditForm;
    setState((prev) => {
      const exists = prev.memberIds.includes(userId);
      return {
        ...prev,
        memberIds: exists
          ? prev.memberIds.filter((id) => id !== userId)
          : [...prev.memberIds, userId],
      };
    });
  };

  return (
    <section className="panel project-management-page">
      <div className="panel-head">
        <h2>Project Management</h2>
        <button type="button" onClick={() => setShowCreateModal(true)}>
          Add Project
        </button>
      </div>

      <div className="project-list">
        {projects.map((project) => (
          <article key={project.id} className="project-row">
            {editingProjectId === project.id ? (
              <div className="project-form">
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  value={editForm.projectKey}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, projectKey: e.target.value.toUpperCase() }))
                  }
                />
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <div className="member-grid">
                  {sortedUsers.map((user) => (
                    <label key={user.id} className="member-item">
                      <input
                        type="checkbox"
                        checked={editForm.memberIds.includes(user.id)}
                        onChange={() => toggleMember("edit", user.id)}
                      />
                      <span>{user.name}</span>
                    </label>
                  ))}
                </div>
                <div className="inline-form">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateProject(project.id, editForm);
                      setEditingProjectId(null);
                    }}
                  >
                    Save
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => setEditingProjectId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="project-row-main">
                <div>
                  <strong>
                    {project.name} ({project.projectKey})
                  </strong>
                  <div className="muted">{project.description || "No description"}</div>
                  <div className="project-members">
                    {(project.members || []).map((member) => (
                      <span key={member.id} className="member-pill">
                        {member.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="inline-form">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setEditingProjectId(project.id);
                      setEditForm({
                        name: project.name,
                        projectKey: project.projectKey,
                        description: project.description || "",
                        memberIds: (project.members || []).map((member) => member.id),
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => onDeleteProject(project.id)}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      {showCreateModal ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowCreateModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h3>Create Project</h3>
              <button type="button" className="ghost-btn" onClick={() => setShowCreateModal(false)}>
                Close
              </button>
            </div>
            <div className="project-form">
              <input
                placeholder="Project name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                placeholder="Project key (e.g. OPS)"
                value={form.projectKey}
                onChange={(e) => setForm((prev) => ({ ...prev, projectKey: e.target.value.toUpperCase() }))}
              />
              <textarea
                rows={3}
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
              <div>
                <p className="muted">Assign users</p>
                <div className="member-grid">
                  {sortedUsers.map((user) => (
                    <label key={user.id} className="member-item">
                      <input
                        type="checkbox"
                        checked={form.memberIds.includes(user.id)}
                        onChange={() => toggleMember("create", user.id)}
                      />
                      <span>{user.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!form.name.trim() || !form.projectKey.trim()) return;
                  onCreateProject({
                    name: form.name.trim(),
                    projectKey: form.projectKey.trim().toUpperCase(),
                    description: form.description,
                    memberIds: form.memberIds,
                  });
                  setForm(EMPTY_FORM);
                  setShowCreateModal(false);
                }}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
