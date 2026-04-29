import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";
import {
  REQUIRED_FIELD_MESSAGE,
  invalidFieldClassName,
} from "../utils/formValidation.js";

export default function AuthView({
  onLogin,
  onRegister,
  onForgotPassword,
  onResetPassword,
  onChangePassword,
  mustChangePassword = false,
  loading,
  error,
}) {
  const {
    authMode: mode,
    setAuthMode: setMode,
    authForm: form,
    setAuthForm: setForm,
    forgotPasswordEmail,
    setForgotPasswordEmail,
    resetPasswordForm,
    setResetPasswordForm,
    forcePasswordForm,
    setForcePasswordForm,
  } =
    useAppStore(
      useShallow((state) => ({
        authMode: state.authMode,
        setAuthMode: state.setAuthMode,
        authForm: state.authForm,
        setAuthForm: state.setAuthForm,
        forgotPasswordEmail: state.forgotPasswordEmail,
        setForgotPasswordEmail: state.setForgotPasswordEmail,
        resetPasswordForm: state.resetPasswordForm,
        setResetPasswordForm: state.setResetPasswordForm,
        forcePasswordForm: state.forcePasswordForm,
        setForcePasswordForm: state.setForcePasswordForm,
      })),
    );
  const [resetRepeatPassword, setResetRepeatPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showForceCurrentPassword, setShowForceCurrentPassword] = useState(false);
  const [showForceNewPassword, setShowForceNewPassword] = useState(false);
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetRepeatPassword, setShowResetRepeatPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<any>({});

  useEffect(() => {
    setFieldErrors({});
  }, [mode, mustChangePassword]);

  const submit = (event) => {
    event.preventDefault();
    setLocalError("");
    if (mustChangePassword || mode === "force-change-password") {
      const err: AnyRecord = {};
      if (!String(forcePasswordForm.name || "").trim())
        err.name = REQUIRED_FIELD_MESSAGE;
      if (!String(forcePasswordForm.newPassword || "").trim())
        err.newPassword = REQUIRED_FIELD_MESSAGE;
      if (Object.keys(err).length) {
        setFieldErrors(err);
        return;
      }
      onChangePassword({
        name: forcePasswordForm.name,
        currentPassword: forcePasswordForm.currentPassword,
        newPassword: forcePasswordForm.newPassword,
      });
      return;
    }
    if (mode === "forgot-password") {
      if (!forgotPasswordEmail.trim()) {
        setFieldErrors({ email: REQUIRED_FIELD_MESSAGE });
        return;
      }
      onForgotPassword({ email: forgotPasswordEmail });
      return;
    }
    if (mode === "reset-password") {
      if (!resetPasswordForm.token) {
        setLocalError("Reset link is invalid or missing token.");
        return;
      }
      const err: AnyRecord = {};
      if (!String(resetPasswordForm.password || "").trim())
        err.password = REQUIRED_FIELD_MESSAGE;
      if (!String(resetRepeatPassword || "").trim())
        err.repeatPassword = REQUIRED_FIELD_MESSAGE;
      if (Object.keys(err).length) {
        setFieldErrors(err);
        return;
      }
      if (String(resetPasswordForm.password || "") !== String(resetRepeatPassword || "")) {
        setFieldErrors({ repeatPassword: "Passwords do not match." });
        return;
      }
      onResetPassword(resetPasswordForm);
      return;
    }
    const err: AnyRecord = {};
    if (!form.email.trim()) err.email = REQUIRED_FIELD_MESSAGE;
    if (!form.password) err.password = REQUIRED_FIELD_MESSAGE;
    if (Object.keys(err).length) {
      setFieldErrors(err);
      return;
    }
    onLogin({ email: form.email, password: form.password });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,_#e8efff_0%,_#f6f8fc_45%,_#eef2f8_100%)] p-4">
      <form
        className="grid w-full max-w-[440px] gap-4 rounded-3xl border border-[#dbe4fb] bg-white p-7 shadow-[0_18px_48px_rgba(30,64,175,0.16)]"
        onSubmit={submit}
      >
        <span className="inline-flex w-fit items-center rounded-full bg-[#eef4ff] px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[#1d4ed8]">
          Task Manager
        </span>
        <div className="grid gap-1">
          <h1 className="text-[1.4rem] font-semibold text-[#172b4d]">
            {mustChangePassword || mode === "force-change-password"
              ? "Change Password"
              : mode === "forgot-password"
                ? "Forgot password"
                : mode === "reset-password"
                  ? "Reset password"
                : "Sign in"}
          </h1>
          <p className="text-[0.92rem] text-[#526079]">
            {mustChangePassword || mode === "force-change-password"
              ? "Set a new password to continue."
              : mode === "forgot-password"
                ? "Enter your email and we will send a password reset link."
                : mode === "reset-password"
                  ? "Choose a new password for your account."
                : "Welcome back. Sign in to continue."}
          </p>
        </div>
        {error || localError ? (
          <p className="rounded-[8px] border border-[#fecdca] bg-[#fff1f3] px-3 py-2 text-[0.9rem] text-[#b42318]">
            {localError || error}
          </p>
        ) : null}
        {mustChangePassword || mode === "force-change-password" ? (
          <>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Full name</span>
              <input
                type="text"
                className={`w-full rounded-[10px] border px-3 py-2 shadow-sm outline-none transition focus:border-[#2d64d9] focus:ring-2 focus:ring-[#dbe6ff] ${fieldErrors.name ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                placeholder="Enter your full name"
                value={forcePasswordForm.name}
                onChange={(event) => {
                  setForcePasswordForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }));
                  if (fieldErrors.name)
                    setFieldErrors((prev) => {
                      const n = { ...prev };
                      delete n.name;
                      return n;
                    });
                }}
              />
              {fieldErrors.name ? (
                <span className="text-[0.78rem] text-red-600">{fieldErrors.name}</span>
              ) : null}
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">
                Current password (optional for first login)
              </span>
              <div className="relative">
                <input
                  type={showForceCurrentPassword ? "text" : "password"}
                  className="w-full rounded-[10px] border border-[#c1c7d0] px-3 py-2 pr-10 shadow-sm outline-none transition focus:border-[#2d64d9] focus:ring-2 focus:ring-[#dbe6ff]"
                  placeholder="Enter current password"
                  value={forcePasswordForm.currentPassword}
                  onChange={(event) =>
                    setForcePasswordForm((prev) => ({
                      ...prev,
                      currentPassword: event.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent px-1 py-0 text-[#5e6c84] hover:text-[#253858]"
                  onClick={() => setShowForceCurrentPassword((prev) => !prev)}
                  aria-label={
                    showForceCurrentPassword
                      ? "Hide current password"
                      : "Show current password"
                  }
                >
                  {showForceCurrentPassword ? "🙈" : "👁"}
                </button>
              </div>
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">New password</span>
              <div className="relative">
                <input
                  type={showForceNewPassword ? "text" : "password"}
                  className={`w-full rounded-[10px] border px-3 py-2 pr-10 shadow-sm outline-none transition focus:border-[#2d64d9] focus:ring-2 focus:ring-[#dbe6ff] ${fieldErrors.newPassword ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                  placeholder="Enter new password"
                  value={forcePasswordForm.newPassword}
                  onChange={(event) => {
                    setForcePasswordForm((prev) => ({
                      ...prev,
                      newPassword: event.target.value,
                    }));
                    if (fieldErrors.newPassword)
                      setFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.newPassword;
                        return n;
                      });
                  }}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent px-1 py-0 text-[#5e6c84] hover:text-[#253858]"
                  onClick={() => setShowForceNewPassword((prev) => !prev)}
                  aria-label={showForceNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showForceNewPassword ? "🙈" : "👁"}
                </button>
              </div>
            </label>
            {fieldErrors.newPassword ? (
              <p className="text-[0.78rem] text-red-600">{fieldErrors.newPassword}</p>
            ) : null}
          </>
        ) : mode === "forgot-password" ? (
          <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
            <span className="font-medium">Email</span>
            <input
              className={`rounded-[10px] border px-3 py-2 shadow-sm outline-none transition focus:border-[#2d64d9] focus:ring-2 focus:ring-[#dbe6ff] ${fieldErrors.email ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
              placeholder="name@company.com"
              value={forgotPasswordEmail}
              onChange={(event) => {
                setForgotPasswordEmail(event.target.value);
                if (fieldErrors.email)
                  setFieldErrors((prev) => {
                    const n = { ...prev };
                    delete n.email;
                    return n;
                  });
              }}
            />
            {fieldErrors.email ? (
              <span className="text-[0.78rem] text-red-600">{fieldErrors.email}</span>
            ) : null}
          </label>
        ) : mode === "reset-password" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">New password</span>
              <div className="relative">
                <input
                  type={showResetNewPassword ? "text" : "password"}
                  className={`w-full rounded-[10px] border px-3 py-2 pr-10 shadow-sm outline-none transition focus:border-[#2d64d9] focus:ring-2 focus:ring-[#dbe6ff] ${fieldErrors.password ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                  placeholder="Enter new password"
                  value={resetPasswordForm.password}
                  onChange={(event) => {
                    setResetPasswordForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }));
                    if (fieldErrors.password)
                      setFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.password;
                        return n;
                      });
                  }}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent px-1 py-0 text-[#5e6c84] hover:text-[#253858]"
                  onClick={() => setShowResetNewPassword((prev) => !prev)}
                  aria-label={showResetNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showResetNewPassword ? "🙈" : "👁"}
                </button>
              </div>
              {fieldErrors.password ? (
                <span className="text-[0.78rem] text-red-600">{fieldErrors.password}</span>
              ) : null}
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Repeat password</span>
              <div className="relative">
                <input
                  type={showResetRepeatPassword ? "text" : "password"}
                  className={`w-full rounded-[10px] border px-3 py-2 pr-10 shadow-sm outline-none transition focus:border-[#2d64d9] focus:ring-2 focus:ring-[#dbe6ff] ${fieldErrors.repeatPassword ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                  placeholder="Repeat new password"
                  value={resetRepeatPassword}
                  onChange={(event) => {
                    setResetRepeatPassword(event.target.value);
                    if (fieldErrors.repeatPassword)
                      setFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.repeatPassword;
                        return n;
                      });
                  }}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent px-1 py-0 text-[#5e6c84] hover:text-[#253858]"
                  onClick={() => setShowResetRepeatPassword((prev) => !prev)}
                  aria-label={
                    showResetRepeatPassword ? "Hide repeat password" : "Show repeat password"
                  }
                >
                  {showResetRepeatPassword ? "🙈" : "👁"}
                </button>
              </div>
              {fieldErrors.repeatPassword ? (
                <span className="text-[0.78rem] text-red-600">
                  {fieldErrors.repeatPassword}
                </span>
              ) : null}
            </label>
          </div>
        ) : (
          <div className="grid gap-3">
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Email</span>
              <input
                className={`rounded-[10px] border px-3 py-2 shadow-sm outline-none transition focus:border-[#2d64d9] focus:ring-2 focus:ring-[#dbe6ff] ${fieldErrors.email ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                placeholder="name@company.com"
                value={form.email}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, email: event.target.value }));
                  if (fieldErrors.email)
                    setFieldErrors((prev) => {
                      const n = { ...prev };
                      delete n.email;
                      return n;
                    });
                }}
              />
              {fieldErrors.email ? (
                <span className="text-[0.78rem] text-red-600">{fieldErrors.email}</span>
              ) : null}
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Password</span>
              <div className="relative">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  className={`w-full rounded-[10px] border px-3 py-2 pr-10 shadow-sm outline-none transition focus:border-[#2d64d9] focus:ring-2 focus:ring-[#dbe6ff] ${fieldErrors.password ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, password: event.target.value }));
                    if (fieldErrors.password)
                      setFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.password;
                        return n;
                      });
                  }}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent px-1 py-0 text-[#5e6c84] hover:text-[#253858]"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? "🙈" : "👁"}
                </button>
              </div>
              {fieldErrors.password ? (
                <span className="text-[0.78rem] text-red-600">{fieldErrors.password}</span>
              ) : null}
            </label>
          </div>
        )}
        <button
          type="submit"
          className="mt-1 rounded-[10px] bg-[#2d64d9] py-2.5 font-semibold text-white shadow-[0_8px_20px_rgba(45,100,217,0.35)] transition hover:bg-[#2454b8] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading}
        >
          {loading
            ? "Loading..."
            : mustChangePassword || mode === "force-change-password"
              ? "Update password"
              : mode === "forgot-password"
                ? "Send reset link"
                : mode === "reset-password"
                  ? "Reset password"
                : "Sign in"}
        </button>
        {!mustChangePassword ? (
          <button
            type="button"
            className="text-[0.9rem] font-medium text-[#2d64d9] hover:underline"
            onClick={() =>
              setMode((prev) =>
                prev === "forgot-password" || prev === "reset-password"
                  ? "login"
                  : "forgot-password",
              )
            }
          >
            {mode === "forgot-password" || mode === "reset-password"
              ? "Back to sign in"
              : "Forgot password?"}
          </button>
        ) : null}
      </form>
    </main>
  );
}
