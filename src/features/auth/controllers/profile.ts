import { changePasswordApi, updateProfileApi } from "../api.js";

type Notify = (message: string, kind?: string) => void;

export async function handleChangePasswordFromProfile(
  payload: { currentPassword: string; newPassword: string },
  deps: { notify: Notify },
) {
  try {
    const data = await changePasswordApi(payload);
    deps.notify(data.message || "Password updated.");
  } catch (error: any) {
    deps.notify(error?.message || "Failed to update password.", "error");
    throw error;
  }
}

export async function handleUpdateProfileInfo(
  payload: { name: string; email: string },
  deps: { notify: Notify; setCurrentUser: (user: AnyRecord | null) => void },
) {
  const data = await updateProfileApi(payload);
  if (data?.user) deps.setCurrentUser(data.user);
  deps.notify("Profile updated.");
}
