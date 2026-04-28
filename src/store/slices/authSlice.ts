import { withUpdater } from "../utils";
import type { AppState, SliceSetter } from "../types";

export const createAuthSlice = (set: SliceSetter): Partial<AppState> => ({
  authMode: "login",
  authForm: { name: "", email: "", password: "" },
  forgotPasswordEmail: "",
  resetPasswordForm: { token: "", password: "" },
  forcePasswordForm: { name: "", currentPassword: "", newPassword: "" },
  setAuthMode: withUpdater(set, "authMode"),
  setAuthForm: withUpdater(set, "authForm"),
  setForgotPasswordEmail: withUpdater(set, "forgotPasswordEmail"),
  setResetPasswordForm: withUpdater(set, "resetPasswordForm"),
  setForcePasswordForm: withUpdater(set, "forcePasswordForm"),
});
