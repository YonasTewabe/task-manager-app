import {
  createUserApi,
  createUserGroupApi,
  deleteUserGroupApi,
  disableUserApi,
  enableUserApi,
  updateUserApi,
  updateUserGroupApi,
} from "../../taskManagement/api.js";
import { refetchAll, type Notify, type RefetchAfterCrud } from "./shared.js";

export async function createUserController(
  payload: AnyRecord,
  deps: { notify: Notify; refetchAfterCrud: RefetchAfterCrud },
) {
  try {
    await createUserApi({ email: payload.email, role: payload.role });
    deps.notify("User created.");
    refetchAll(deps.refetchAfterCrud, deps.notify, "creating user");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to create user.", "error");
    throw error;
  }
}

export async function updateUserController(
  userId: string,
  draft: AnyRecord,
  deps: { notify: Notify; refetchAfterCrud: RefetchAfterCrud },
) {
  try {
    await updateUserApi(userId, { name: draft.name, email: draft.email, role: draft.role });
    deps.notify("User updated.");
    refetchAll(deps.refetchAfterCrud, deps.notify, "updating user");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to update user.", "error");
    throw error;
  }
}

export async function disableUserController(
  userId: string,
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    requestConfirmation: (payload: {
      title: string;
      message: string;
      confirmLabel?: string;
    }) => Promise<boolean>;
  },
) {
  const confirmed = await deps.requestConfirmation({
    title: "Delete user",
    message:
      "Disable this user? Their account will remain for history and they will be removed from groups.",
    confirmLabel: "Disable user",
  });
  if (!confirmed) return;
  try {
    await disableUserApi(userId);
    deps.notify("User disabled.");
    refetchAll(deps.refetchAfterCrud, deps.notify, "disabling user");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to disable user.", "error");
    throw error;
  }
}

export async function enableUserController(
  userId: string,
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    requestConfirmation: (payload: {
      title: string;
      message: string;
      confirmLabel?: string;
    }) => Promise<boolean>;
  },
) {
  const confirmed = await deps.requestConfirmation({
    title: "Reactivate user",
    message: "Reactivate this user and restore account access?",
    confirmLabel: "Reactivate user",
  });
  if (!confirmed) return;
  try {
    await enableUserApi(userId);
    deps.notify("User reactivated.");
    refetchAll(deps.refetchAfterCrud, deps.notify, "reactivating user");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to reactivate user.", "error");
    throw error;
  }
}

export async function createUserGroupController(
  payload: AnyRecord,
  deps: { notify: Notify; refetchAfterCrud: RefetchAfterCrud },
) {
  try {
    await createUserGroupApi(payload);
    deps.notify("User group created.");
    refetchAll(deps.refetchAfterCrud, deps.notify, "creating user group");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to create user group.", "error");
    throw error;
  }
}

export async function updateUserGroupController(
  groupId: string,
  payload: AnyRecord,
  deps: { notify: Notify; refetchAfterCrud: RefetchAfterCrud },
) {
  try {
    await updateUserGroupApi(groupId, payload);
    deps.notify("User group updated.");
    refetchAll(deps.refetchAfterCrud, deps.notify, "updating user group");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to update user group.", "error");
    throw error;
  }
}

export async function deleteUserGroupController(
  groupId: string,
  deps: {
    notify: Notify;
    refetchAfterCrud: RefetchAfterCrud;
    requestConfirmation: (payload: {
      title: string;
      message: string;
      confirmLabel?: string;
    }) => Promise<boolean>;
  },
) {
  const confirmed = await deps.requestConfirmation({
    title: "Delete user group",
    message: "Delete this user group? ",
    confirmLabel: "Delete group",
  });
  if (!confirmed) return;
  try {
    await deleteUserGroupApi(groupId);
    deps.notify("User group deleted.");
    refetchAll(deps.refetchAfterCrud, deps.notify, "deleting user group");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to delete user group.", "error");
    throw error;
  }
}
