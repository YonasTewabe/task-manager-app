import { withUpdater } from "../utils";

export const createAuthSlice = (set) => ({
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
