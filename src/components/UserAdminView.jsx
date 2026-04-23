import { useState } from "react";
import Modal from "./ui/Modal";
import {
  REQUIRED_FIELD_MESSAGE,
  invalidFieldClassName,
} from "../utils/formValidation.js";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";

export default function UserAdminView({
  users,
  userGroups = [],
  canManage,
  currentUserId,
  onCreateUser,
  onUpdateUser,
  onDisableUser,
  onEnableUser,
  onCreateUserGroup,
  onUpdateUserGroup,
  onDeleteUserGroup,
}) {
  const {
    userAdminEmail: email,
    setUserAdminEmail: setEmail,
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
      userAdminEmail: state.userAdminEmail,
      setUserAdminEmail: state.setUserAdminEmail,
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
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createUserErrors, setCreateUserErrors] = useState({});
  const [createGroupErrors, setCreateGroupErrors] = useState({});
  const [editUserErrors, setEditUserErrors] = useState({});
  const [editGroupErrors, setEditGroupErrors] = useState({});
  const [showDisabledUsers, setShowDisabledUsers] = useState(false);

  const closeEditModal = () => {
    setEditUserErrors({});
    setShowEditModal(false);
    setEditingUserId(null);
  };

  const startEdit = (user) => {
    setEditUserErrors({});
    setEditingUserId(user.id);
    setEditDraft({
      name: user.name,
      email: user.email,
      role: user.role,
    });
    setShowEditModal(true);
  };

  const toggleMember = (setMemberIds, userId) => {
    setMemberIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const startEditGroup = (group) => {
    setEditGroupErrors({});
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupMemberIds((group.members || []).map((m) => m.id));
    setShowEditGroupModal(true);
  };

  const closeEditGroupModal = () => {
    setEditGroupErrors({});
    setShowEditGroupModal(false);
    setEditingGroupId(null);
  };
  const activeUsers = users.filter((user) => user.isActive !== false);
  const disabledUsers = users.filter((user) => user.isActive === false);
  const visibleUsers = showDisabledUsers ? disabledUsers : activeUsers;

  return (
    <section className="grid gap-[1.1rem]">
      <div className="grid gap-[0.5rem] rounded-[10px] border border-[#dfe1e6] bg-white p-[0.85rem] shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">Users</h2>
          <div className="flex items-center gap-3">
            {canManage ? (
              <>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[0.85rem] text-[#42526e]">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={showDisabledUsers}
                    onChange={(event) =>
                      setShowDisabledUsers(event.target.checked)
                    }
                  />
                  <span className="relative h-6 w-11 rounded-full bg-[#d0d7e2] shadow-[inset_0_1px_2px_rgba(9,30,66,0.12)] transition-colors duration-200 peer-checked:bg-[#2d64d9] peer-focus-visible:ring-2 peer-focus-visible:ring-[#8ec1ff] peer-focus-visible:ring-offset-1">
                    <span className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(9,30,66,0.25)] transition-transform duration-200 peer-checked:translate-x-5" />
                  </span>
                  <span className="font-medium text-[#253858]">
                    View Disabled users
                  </span>
                </label>

                <button type="button" onClick={() => setShowCreateModal(true)}>
                  Add User
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="grid gap-[0.6rem]">
          {!visibleUsers.length ? (
            <p className="text-[#5e6c84]">
              {showDisabledUsers
                ? "No disabled users found."
                : "No active users found."}
            </p>
          ) : null}
          {visibleUsers.map((user) => (
            <article
              key={user.id}
              className="rounded-lg border border-[#dfe1e6] bg-white p-[0.7rem]"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <strong>{user.name}</strong>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[#5e6c84]">
                    {user.email} · {user.role}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-2 self-center">
                    <button type="button" onClick={() => startEdit(user)}>
                      Edit
                    </button>
                    {user.isActive === false ? (
                      <button
                        type="button"
                        onClick={() => onEnableUser(user.id)}
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                        onClick={() => onDisableUser(user.id)}
                        disabled={String(currentUserId) === String(user.id)}
                      >
                        Disable
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="grid gap-[0.5rem] rounded-[10px] border border-[#dfe1e6] bg-white p-[0.85rem] shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">User groups</h2>
          {canManage ? (
            <button type="button" onClick={() => setShowCreateGroupModal(true)}>
              Add Group
            </button>
          ) : null}
        </div>
        <div className="grid gap-[0.7rem]">
          {!userGroups.length ? (
            <p className="text-[#5e6c84]">No user groups yet.</p>
          ) : null}
          {userGroups.map((group) => (
            <article
              key={group.id}
              className="rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong>{group.name}</strong>
                  <div className="mt-1 flex flex-wrap gap-[0.35rem]">
                    {(group.members || []).map((member) => (
                      <span
                        key={member.id}
                        className="rounded-full border border-[#c1d3ff] bg-[#edf3ff] px-[0.45rem] py-[0.2rem] text-[0.75rem] text-[#1f3f7f]"
                      >
                        {member.name}
                      </span>
                    ))}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-2 self-center">
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
        <Modal
          open={showCreateModal}
          onOpenChange={(open) => {
            setShowCreateModal(open);
            if (!open) setCreateUserErrors({});
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Add user</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => {
                setCreateUserErrors({});
                setShowCreateModal(false);
              }}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.5rem]">
            <label>
              <span className="inline-flex items-center">
                Email <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                value={email}
                placeholder="Enter email"
                className={invalidFieldClassName(
                  Boolean(createUserErrors.email),
                )}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (createUserErrors.email)
                    setCreateUserErrors((prev) => {
                      const n = { ...prev };
                      delete n.email;
                      return n;
                    });
                }}
              />
            </label>
            {createUserErrors.email ? (
              <p className="text-[0.78rem] text-red-600">
                {createUserErrors.email}
              </p>
            ) : null}
            <label>
              <span className="inline-flex items-center">
                Role <span className="ml-1 text-red-600">*</span>
              </span>
              <select
                value={role}
                className={invalidFieldClassName(
                  Boolean(createUserErrors.role),
                )}
                onChange={(e) => {
                  setRole(e.target.value);
                  if (createUserErrors.role)
                    setCreateUserErrors((prev) => {
                      const n = { ...prev };
                      delete n.role;
                      return n;
                    });
                }}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            {createUserErrors.role ? (
              <p className="text-[0.78rem] text-red-600">
                {createUserErrors.role}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => {
                  setCreateUserErrors({});
                  setShowCreateModal(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCreatingUser}
                onClick={async () => {
                  const err = {};
                  if (!email.trim()) err.email = REQUIRED_FIELD_MESSAGE;
                  if (!role) err.role = REQUIRED_FIELD_MESSAGE;
                  if (Object.keys(err).length) {
                    setCreateUserErrors(err);
                    return;
                  }
                  setCreateUserErrors({});
                  try {
                    setIsCreatingUser(true);
                    await onCreateUser({ email: email.trim(), role });
                    setEmail("");
                    setRole("member");
                    setShowCreateModal(false);
                  } finally {
                    setIsCreatingUser(false);
                  }
                }}
              >
                {isCreatingUser ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {canManage && showCreateGroupModal ? (
        <Modal
          open={showCreateGroupModal}
          onOpenChange={(open) => {
            setShowCreateGroupModal(open);
            if (!open) setCreateGroupErrors({});
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Add group</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => {
                setCreateGroupErrors({});
                setShowCreateGroupModal(false);
              }}
            >
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
                className={invalidFieldClassName(
                  Boolean(createGroupErrors.name),
                )}
                onChange={(e) => {
                  setGroupName(e.target.value);
                  if (createGroupErrors.name)
                    setCreateGroupErrors((prev) => {
                      const n = { ...prev };
                      delete n.name;
                      return n;
                    });
                }}
              />
            </label>
            {createGroupErrors.name ? (
              <p className="text-[0.78rem] text-red-600">
                {createGroupErrors.name}
              </p>
            ) : null}
            <div>
              <p className="text-[#5e6c84]">Members</p>
              <div className="grid grid-cols-3 gap-[0.4rem]">
                {activeUsers.map((user) => (
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
                onClick={() => {
                  setCreateGroupErrors({});
                  setShowCreateGroupModal(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!groupName.trim()) {
                    setCreateGroupErrors({ name: REQUIRED_FIELD_MESSAGE });
                    return;
                  }
                  setCreateGroupErrors({});
                  onCreateUserGroup({
                    name: groupName.trim(),
                    memberIds: groupMemberIds,
                  });
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
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={closeEditModal}
            >
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
                className={invalidFieldClassName(Boolean(editUserErrors.name))}
                onChange={(e) => {
                  setEditDraft((prev) => ({ ...prev, name: e.target.value }));
                  if (editUserErrors.name)
                    setEditUserErrors((prev) => {
                      const n = { ...prev };
                      delete n.name;
                      return n;
                    });
                }}
              />
            </label>
            {editUserErrors.name ? (
              <p className="text-[0.78rem] text-red-600">
                {editUserErrors.name}
              </p>
            ) : null}
            <label>
              <span className="inline-flex items-center">
                Email <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                value={editDraft.email}
                placeholder="Enter email"
                className={invalidFieldClassName(Boolean(editUserErrors.email))}
                onChange={(e) => {
                  setEditDraft((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }));
                  if (editUserErrors.email)
                    setEditUserErrors((prev) => {
                      const n = { ...prev };
                      delete n.email;
                      return n;
                    });
                }}
              />
            </label>
            {editUserErrors.email ? (
              <p className="text-[0.78rem] text-red-600">
                {editUserErrors.email}
              </p>
            ) : null}
            <label>
              Role
              <select
                value={editDraft.role}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, role: e.target.value }))
                }
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={closeEditModal}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const err = {};
                  if (!String(editDraft.name || "").trim())
                    err.name = REQUIRED_FIELD_MESSAGE;
                  if (!String(editDraft.email || "").trim())
                    err.email = REQUIRED_FIELD_MESSAGE;
                  if (Object.keys(err).length) {
                    setEditUserErrors(err);
                    return;
                  }
                  setEditUserErrors({});
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
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={closeEditGroupModal}
            >
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
                className={invalidFieldClassName(Boolean(editGroupErrors.name))}
                onChange={(e) => {
                  setEditGroupName(e.target.value);
                  if (editGroupErrors.name)
                    setEditGroupErrors((prev) => {
                      const n = { ...prev };
                      delete n.name;
                      return n;
                    });
                }}
              />
            </label>
            {editGroupErrors.name ? (
              <p className="text-[0.78rem] text-red-600">
                {editGroupErrors.name}
              </p>
            ) : null}
            <div>
              <p className="text-[#5e6c84]">Members</p>
              <div className="grid grid-cols-3 gap-[0.4rem]">
                {activeUsers.map((user) => (
                  <label
                    key={user.id}
                    className="!flex !grid-cols-none items-center gap-[0.35rem] text-[0.85rem] leading-[1.2]"
                  >
                    <input
                      type="checkbox"
                      className="!h-4 !w-4 shrink-0 cursor-pointer rounded-[4px] border border-[#b8c1d1] accent-[#2d64d9]"
                      checked={editGroupMemberIds.includes(user.id)}
                      onChange={() =>
                        toggleMember(setEditGroupMemberIds, user.id)
                      }
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
                onClick={closeEditGroupModal}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editGroupName.trim()) {
                    setEditGroupErrors({ name: REQUIRED_FIELD_MESSAGE });
                    return;
                  }
                  setEditGroupErrors({});
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
