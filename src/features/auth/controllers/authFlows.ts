import {
  changePasswordApi,
  forgotPasswordApi,
  loginApi,
  registerApi,
  resetPasswordApi,
} from "../api.js";

type Notify = (message: string, kind?: string) => void;

export async function handleLogin(
  payload: { email: string; password: string },
  deps: {
    setAuthLoading: (v: boolean) => void;
    setError: (v: string) => void;
    setToken: (v: string) => void;
    setCurrentUser: (v: any) => void;
    setMustChangePassword: (v: boolean) => void;
    setActiveView: (v: string) => void;
    navigate: (to: string, opts?: AnyRecord) => void;
    setStoredToken: (v: string) => void;
  },
) {
  deps.setAuthLoading(true);
  deps.setError("");
  try {
    const data = await loginApi(payload);
    deps.setStoredToken(data.token);
    deps.setToken(data.token);
    deps.setCurrentUser(data.user);
    const requiresChange = data.mustChangePassword === true;
    deps.setMustChangePassword(requiresChange);
    if (!requiresChange) {
      deps.setActiveView("dashboard");
      deps.navigate("/dashboard", { replace: true });
    }
  } catch (err: any) {
    deps.setError(err?.message || "Login failed");
  } finally {
    deps.setAuthLoading(false);
  }
}

export async function handleRegister(
  payload: { name: string; email: string; password: string },
  deps: {
    setAuthLoading: (v: boolean) => void;
    setError: (v: string) => void;
    setToken: (v: string) => void;
    setCurrentUser: (v: any) => void;
    setMustChangePassword: (v: boolean) => void;
    setActiveView: (v: string) => void;
    navigate: (to: string, opts?: AnyRecord) => void;
    setStoredToken: (v: string) => void;
  },
) {
  deps.setAuthLoading(true);
  deps.setError("");
  try {
    const data = await registerApi(payload);
    deps.setStoredToken(data.token);
    deps.setToken(data.token);
    deps.setCurrentUser(data.user);
    deps.setMustChangePassword(false);
    deps.setActiveView("dashboard");
    deps.navigate("/dashboard", { replace: true });
  } catch (err: any) {
    deps.setError(err?.message || "Registration failed");
  } finally {
    deps.setAuthLoading(false);
  }
}

export async function handleForgotPassword(
  payload: { email: string },
  deps: { setAuthLoading: (v: boolean) => void; setError: (v: string) => void; notify: Notify },
) {
  deps.setAuthLoading(true);
  deps.setError("");
  try {
    const data = await forgotPasswordApi(payload);
    deps.notify(data.message || "If the account exists, a reset email has been sent.");
  } catch (err: any) {
    deps.setError(err?.message || "Failed to request password reset");
  } finally {
    deps.setAuthLoading(false);
  }
}

export async function handleResetPassword(
  payload: { token: string; password: string },
  deps: { setAuthLoading: (v: boolean) => void; setError: (v: string) => void; notify: Notify },
) {
  deps.setAuthLoading(true);
  deps.setError("");
  try {
    const data = await resetPasswordApi(payload);
    deps.notify(data.message || "Password reset successful.");
  } catch (err: any) {
    deps.setError(err?.message || "Failed to reset password");
  } finally {
    deps.setAuthLoading(false);
  }
}

export async function handleChangePassword(
  payload: { name?: string; currentPassword?: string; newPassword: string },
  deps: {
    setAuthLoading: (v: boolean) => void;
    setError: (v: string) => void;
    setMustChangePassword: (v: boolean) => void;
    setActiveView: (v: string) => void;
    navigate: (to: string, opts?: AnyRecord) => void;
    notify: Notify;
  },
) {
  deps.setAuthLoading(true);
  deps.setError("");
  try {
    const data = await changePasswordApi(payload);
    deps.notify(data.message || "Password updated.");
    deps.setMustChangePassword(false);
    deps.setActiveView("dashboard");
    deps.navigate("/dashboard", { replace: true });
  } catch (err: any) {
    deps.setError(err?.message || "Failed to change password");
  } finally {
    deps.setAuthLoading(false);
  }
}
