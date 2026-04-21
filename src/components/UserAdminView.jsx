import { useState } from "react";
import Modal from "./ui/Modal";

export default function UserAdminView({
  users,
  userGroups = [],
  canManage,
  currentUserId,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onCreateUserGroup,
  onUpdateUserGroup,
  onDeleteUserGroup,
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    email: "",
    password: "",
    role: "member",
  });
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupMemberIds, setEditGroupMemberIds] = useState([]);

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingUserId(null);
  };

  const startEdit = (user) => {
    setEditingUserId(user.id);
    setEditDraft({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
    });
    setShowEditModal(true);
  };

  const toggleMember = (setMemberIds, userId) => {
    setMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const startEditGroup = (group) => {
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupMemberIds((group.members || []).map((m) => m.id));
    setShowEditGroupModal(true);
  };

  const closeEditGroupModal = () => {
    setShowEditGroupModal(false);
    setEditingGroupId(null);
  };

  return (
    <section className="user-management-page">
      <div className="user-admin-section-card">
        <div className="panel-head user-admin-head">
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
            </article>
          ))}
        </div>
      </div>
      <div className="user-admin-section-card">
        <div className="panel-head user-admin-head">
          <h2>User groups</h2>
          {canManage ? (
            <button type="button" onClick={() => setShowCreateGroupModal(true)}>
              Add Group
            </button>
          ) : null}
        </div>
        <div className="project-list">
          {!userGroups.length ? <p className="muted">No user groups yet.</p> : null}
          {userGroups.map((group) => (
            <article key={group.id} className="project-row">
              <div className="project-row-main">
                <div>
                  <strong>{group.name}</strong>
                  <div className="project-members">
                    {(group.members || []).map((member) => (
                      <span key={member.id} className="member-pill">{member.name}</span>
                    ))}
                  </div>
                </div>
                {canManage ? (
                  <div className="inline-form">
                    <button type="button" className="ghost-btn" onClick={() => startEditGroup(group)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => onDeleteUserGroup(group.id)}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
      {canManage && showCreateModal ? (
        <Modal open={showCreateModal} onOpenChange={setShowCreateModal}>
            <div className="panel-head">
              <h3>Add user</h3>
              <button type="button" className="ghost-btn" onClick={() => setShowCreateModal(false)}>
                X
              </button>
            </div>
            <div className="user-form-grid">
              <label>
                <span className="field-label">
                  Name <span className="required-indicator">*</span>
                </span>
                <input
                  value={name}
                  placeholder="Enter full name"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">
                  Email <span className="required-indicator">*</span>
                </span>
                <input
                  value={email}
                  placeholder="Enter email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  placeholder="Enter password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">
                  Role <span className="required-indicator">*</span>
                </span>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
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
                  onClick={() => {
                    if (!name.trim() || !email.trim() || !role) return;
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
        </Modal>
      ) : null}
      {canManage && showCreateGroupModal ? (
        <Modal open={showCreateGroupModal} onOpenChange={setShowCreateGroupModal}>
            <div className="panel-head">
              <h3>Add group</h3>
              <button type="button" className="ghost-btn" onClick={() => setShowCreateGroupModal(false)}>
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Group name <span className="required-indicator">*</span>
                </span>
                <input
                  value={groupName}
                  placeholder="Enter group name"
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </label>
              <div>
                <p className="muted">Members</p>
                <div className="member-grid">
                  {users.map((user) => (
                    <label key={user.id} className="member-item">
                      <input
                        type="checkbox"
                        checked={groupMemberIds.includes(user.id)}
                        onChange={() => toggleMember(setGroupMemberIds, user.id)}
                      />
                      <span>{user.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setShowCreateGroupModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!groupName.trim()) return;
                    onCreateUserGroup({ name: groupName.trim(), memberIds: groupMemberIds });
                    setGroupName("");
                    setGroupMemberIds([]);
                    setShowCreateGroupModal(false);
                  }}
                >
                  Create Group
                </button>
              </div>
            </div>
        </Modal>
      ) : null}
      {canManage && showEditModal && editingUserId ? (
        <Modal
          open={showEditModal}
          onOpenChange={(open) => {
            if (!open) closeEditModal();
          }}
        >
            <div className="panel-head">
              <h3>Edit user</h3>
              <button type="button" className="ghost-btn" onClick={closeEditModal}>
                X
              </button>
            </div>
            <div className="user-form-grid">
              <label>
                <span className="field-label">
                  Name <span className="required-indicator">*</span>
                </span>
                <input
                  value={editDraft.name}
                  placeholder="Enter full name"
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label>
                <span className="field-label">
                  Email <span className="required-indicator">*</span>
                </span>
                <input
                  value={editDraft.email}
                  placeholder="Enter email"
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, email: e.target.value }))}
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  value={editDraft.password}
                  placeholder="Optional"
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, password: e.target.value }))}
                />
              </label>
              <label>
                Role
                <select
                  value={editDraft.role}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, role: e.target.value }))}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateUser(editingUserId, editDraft);
                    closeEditModal();
                  }}
                >
                  Save
                </button>
                <button type="button" className="ghost-btn" onClick={closeEditModal}>
                  Cancel
                </button>
              </div>
            </div>
        </Modal>
      ) : null}
      {canManage && showEditGroupModal && editingGroupId ? (
        <Modal
          open={showEditGroupModal}
          onOpenChange={(open) => {
            if (!open) closeEditGroupModal();
          }}
        >
            <div className="panel-head">
              <h3>Edit group</h3>
              <button type="button" className="ghost-btn" onClick={closeEditGroupModal}>
                X
              </button>
            </div>
            <div className="project-form">
              <label>
                <span className="field-label">
                  Group name <span className="required-indicator">*</span>
                </span>
                <input
                  value={editGroupName}
                  placeholder="Enter group name"
                  onChange={(e) => setEditGroupName(e.target.value)}
                />
              </label>
              <div>
                <p className="muted">Members</p>
                <div className="member-grid">
                  {users.map((user) => (
                    <label key={user.id} className="member-item">
                      <input
                        type="checkbox"
                        checked={editGroupMemberIds.includes(user.id)}
                        onChange={() => toggleMember(setEditGroupMemberIds, user.id)}
                      />
                      <span>{user.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateUserGroup(editingGroupId, {
                      name: editGroupName.trim(),
                      memberIds: editGroupMemberIds,
                    });
                    closeEditGroupModal();
                  }}
                >
                  Save
                </button>
                <button type="button" className="ghost-btn" onClick={closeEditGroupModal}>
                  Cancel
                </button>
              </div>
            </div>
        </Modal>
      ) : null}
    </section>
  );
}
