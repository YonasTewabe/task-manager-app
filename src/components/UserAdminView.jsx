import Modal from "./ui/Modal";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";

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
  const {
    userAdminName: name,
    setUserAdminName: setName,
    userAdminEmail: email,
    setUserAdminEmail: setEmail,
    userAdminPassword: password,
    setUserAdminPassword: setPassword,
    userAdminRole: role,
    setUserAdminRole: setRole,
    userAdminShowCreateModal: showCreateModal,
    setUserAdminShowCreateModal: setShowCreateModal,
    userAdminShowEditModal: showEditModal,
    setUserAdminShowEditModal: setShowEditModal,
    userAdminShowCreateGroupModal: showCreateGroupModal,
    setUserAdminShowCreateGroupModal: setShowCreateGroupModal,
    userAdminShowEditGroupModal: showEditGroupModal,
    setUserAdminShowEditGroupModal: setShowEditGroupModal,
    userAdminEditingUserId: editingUserId,
    setUserAdminEditingUserId: setEditingUserId,
    userAdminEditingGroupId: editingGroupId,
    setUserAdminEditingGroupId: setEditingGroupId,
    userAdminEditDraft: editDraft,
    setUserAdminEditDraft: setEditDraft,
    userAdminGroupName: groupName,
    setUserAdminGroupName: setGroupName,
    userAdminGroupMemberIds: groupMemberIds,
    setUserAdminGroupMemberIds: setGroupMemberIds,
    userAdminEditGroupName: editGroupName,
    setUserAdminEditGroupName: setEditGroupName,
    userAdminEditGroupMemberIds: editGroupMemberIds,
    setUserAdminEditGroupMemberIds: setEditGroupMemberIds,
  } = useAppStore(
    useShallow((state) => ({
      userAdminName: state.userAdminName,
      setUserAdminName: state.setUserAdminName,
      userAdminEmail: state.userAdminEmail,
      setUserAdminEmail: state.setUserAdminEmail,
      userAdminPassword: state.userAdminPassword,
      setUserAdminPassword: state.setUserAdminPassword,
      userAdminRole: state.userAdminRole,
      setUserAdminRole: state.setUserAdminRole,
      userAdminShowCreateModal: state.userAdminShowCreateModal,
      setUserAdminShowCreateModal: state.setUserAdminShowCreateModal,
      userAdminShowEditModal: state.userAdminShowEditModal,
      setUserAdminShowEditModal: state.setUserAdminShowEditModal,
      userAdminShowCreateGroupModal: state.userAdminShowCreateGroupModal,
      setUserAdminShowCreateGroupModal: state.setUserAdminShowCreateGroupModal,
      userAdminShowEditGroupModal: state.userAdminShowEditGroupModal,
      setUserAdminShowEditGroupModal: state.setUserAdminShowEditGroupModal,
      userAdminEditingUserId: state.userAdminEditingUserId,
      setUserAdminEditingUserId: state.setUserAdminEditingUserId,
      userAdminEditingGroupId: state.userAdminEditingGroupId,
      setUserAdminEditingGroupId: state.setUserAdminEditingGroupId,
      userAdminEditDraft: state.userAdminEditDraft,
      setUserAdminEditDraft: state.setUserAdminEditDraft,
      userAdminGroupName: state.userAdminGroupName,
      setUserAdminGroupName: state.setUserAdminGroupName,
      userAdminGroupMemberIds: state.userAdminGroupMemberIds,
      setUserAdminGroupMemberIds: state.setUserAdminGroupMemberIds,
      userAdminEditGroupName: state.userAdminEditGroupName,
      setUserAdminEditGroupName: state.setUserAdminEditGroupName,
      userAdminEditGroupMemberIds: state.userAdminEditGroupMemberIds,
      setUserAdminEditGroupMemberIds: state.setUserAdminEditGroupMemberIds,
    })),
  );

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
    <section className="grid gap-[1.1rem]">
      <div className="grid gap-[0.5rem] rounded-[10px] border border-[#dfe1e6] bg-white p-[0.85rem] shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <h2>Users</h2>
          {canManage ? (
            <button type="button" onClick={() => setShowCreateModal(true)}>
              Add User
            </button>
          ) : null}
        </div>
        <div className="grid gap-[0.6rem]">
          {users.map((user) => (
            <article key={user.id} className="rounded-lg border border-[#dfe1e6] bg-white p-[0.7rem]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <strong>{user.name}</strong>
                  <div className="text-[#5e6c84]">
                    {user.email} · {user.role}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEdit(user)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
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
      <div className="grid gap-[0.5rem] rounded-[10px] border border-[#dfe1e6] bg-white p-[0.85rem] shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <h2>User groups</h2>
          {canManage ? (
            <button type="button" onClick={() => setShowCreateGroupModal(true)}>
              Add Group
            </button>
          ) : null}
        </div>
        <div className="grid gap-[0.7rem]">
          {!userGroups.length ? <p className="text-[#5e6c84]">No user groups yet.</p> : null}
          {userGroups.map((group) => (
            <article key={group.id} className="rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong>{group.name}</strong>
                  <div className="mt-1 flex flex-wrap gap-[0.35rem]">
                    {(group.members || []).map((member) => (
                      <span key={member.id} className="rounded-full border border-[#c1d3ff] bg-[#edf3ff] px-[0.45rem] py-[0.2rem] text-[0.75rem] text-[#1f3f7f]">{member.name}</span>
                    ))}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEditGroup(group)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                      onClick={() => onDeleteUserGroup(group.id)}
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
      {canManage && showCreateModal ? (
        <Modal open={showCreateModal} onOpenChange={setShowCreateModal}>
            <div className="flex items-center justify-between gap-3">
              <h3>Add user</h3>
              <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={() => setShowCreateModal(false)}>
                X
              </button>
            </div>
            <div className="grid gap-[0.5rem]">
              <label>
                <span className="inline-flex items-center">
                  Name <span className="ml-1 text-red-600">*</span>
                </span>
                <input
                  value={name}
                  placeholder="Enter full name"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                <span className="inline-flex items-center">
                  Email <span className="ml-1 text-red-600">*</span>
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
                <span className="inline-flex items-center">
                  Role <span className="ml-1 text-red-600">*</span>
                </span>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
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
            <div className="flex items-center justify-between gap-3">
              <h3>Add group</h3>
              <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={() => setShowCreateGroupModal(false)}>
                X
              </button>
            </div>
            <div className="grid gap-[0.6rem]">
              <label>
                <span className="inline-flex items-center">
                  Group name <span className="ml-1 text-red-600">*</span>
                </span>
                <input
                  value={groupName}
                  placeholder="Enter group name"
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </label>
              <div>
                <p className="text-[#5e6c84]">Members</p>
                <div className="grid grid-cols-3 gap-[0.4rem]">
                  {users.map((user) => (
                    <label
                      key={user.id}
                      className="!flex !grid-cols-none items-center gap-[0.35rem] text-[0.85rem] leading-[1.2]"
                    >
                      <input
                        type="checkbox"
                        className="!h-4 !w-4 shrink-0 cursor-pointer rounded-[4px] border border-[#b8c1d1] accent-[#2d64d9]"
                        checked={groupMemberIds.includes(user.id)}
                        onChange={() => toggleMember(setGroupMemberIds, user.id)}
                      />
                      <span>{user.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
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
            <div className="flex items-center justify-between gap-3">
              <h3>Edit user</h3>
              <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={closeEditModal}>
                X
              </button>
            </div>
            <div className="grid gap-[0.5rem]">
              <label>
                <span className="inline-flex items-center">
                  Name <span className="ml-1 text-red-600">*</span>
                </span>
                <input
                  value={editDraft.name}
                  placeholder="Enter full name"
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label>
                <span className="inline-flex items-center">
                  Email <span className="ml-1 text-red-600">*</span>
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
              <div className="flex justify-end gap-2">
                <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={closeEditModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateUser(editingUserId, editDraft);
                    closeEditModal();
                  }}
                >
                  Save
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
            <div className="flex items-center justify-between gap-3">
              <h3>Edit group</h3>
              <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={closeEditGroupModal}>
                X
              </button>
            </div>
            <div className="grid gap-[0.6rem]">
              <label>
                <span className="inline-flex items-center">
                  Group name <span className="ml-1 text-red-600">*</span>
                </span>
                <input
                  value={editGroupName}
                  placeholder="Enter group name"
                  onChange={(e) => setEditGroupName(e.target.value)}
                />
              </label>
              <div>
                <p className="text-[#5e6c84]">Members</p>
                <div className="grid grid-cols-3 gap-[0.4rem]">
                  {users.map((user) => (
                    <label
                      key={user.id}
                      className="!flex !grid-cols-none items-center gap-[0.35rem] text-[0.85rem] leading-[1.2]"
                    >
                      <input
                        type="checkbox"
                        className="!h-4 !w-4 shrink-0 cursor-pointer rounded-[4px] border border-[#b8c1d1] accent-[#2d64d9]"
                        checked={editGroupMemberIds.includes(user.id)}
                        onChange={() => toggleMember(setEditGroupMemberIds, user.id)}
                      />
                      <span>{user.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={closeEditGroupModal}>
                  Cancel
                </button>
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
              </div>
            </div>
        </Modal>
      ) : null}
    </section>
  );
}
