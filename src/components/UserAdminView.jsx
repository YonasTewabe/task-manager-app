import { useState } from "react";

export default function UserAdminView({
  users,
  canManage,
  currentUserId,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    email: "",
    password: "",
    role: "member",
  });

  const startEdit = (user) => {
    setEditingUserId(user.id);
    setEditDraft({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
    });
  };

  return (
    <section className="panel user-management-page">
      <div className="panel-head">
        <h2>Users</h2>
        {canManage ? (
          <button type="button" onClick={() => setShowCreateModal(true)}>
            Add User
          </button>
        ) : null}
      </div>
      <div className="user-list">
        {users.map((user) => (
          <article key={user.id} className="user-row">
            {editingUserId === user.id ? (
              <div className="user-edit-grid">
                <input
                  value={editDraft.name}
                  placeholder="Name"
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  value={editDraft.email}
                  placeholder="Email"
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, email: e.target.value }))}
                />
                <input
                  type="password"
                  value={editDraft.password}
                  placeholder="New password (optional)"
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, password: e.target.value }))}
                />
                <select
                  value={editDraft.role}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, role: e.target.value }))}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
                <div className="inline-form">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateUser(user.id, editDraft);
                      setEditingUserId(null);
                    }}
                  >
                    Save
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => setEditingUserId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="user-row-main">
                <div>
                  <strong>{user.name}</strong>
                  <div className="muted">
                    {user.email} · {user.role}
                  </div>
                </div>
                {canManage ? (
                  <div className="inline-form">
                    <button type="button" className="ghost-btn" onClick={() => startEdit(user)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteUser(user.id)}
                      disabled={String(currentUserId) === String(user.id)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </article>
        ))}
      </div>
      {canManage && showCreateModal ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowCreateModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h3>Add user</h3>
              <button type="button" className="ghost-btn" onClick={() => setShowCreateModal(false)}>
                Close
              </button>
            </div>
            <div className="user-form-grid">
              <input value={name} placeholder="Name" onChange={(e) => setName(e.target.value)} />
              <input value={email} placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
              <input
                type="password"
                value={password}
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!name.trim() || !email.trim()) return;
                  onCreateUser({ name: name.trim(), email: email.trim(), password, role });
                  setName("");
                  setEmail("");
                  setPassword("");
                  setRole("member");
                  setShowCreateModal(false);
                }}
              >
                Create User
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
