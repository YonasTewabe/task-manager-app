import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";

export default function AuthView({
  onLogin,
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

  const submit = (event) => {
    event.preventDefault();
    setLocalError("");
    if (mustChangePassword || mode === "force-change-password") {
      onChangePassword({
        name: forcePasswordForm.name,
        currentPassword: forcePasswordForm.currentPassword,
        newPassword: forcePasswordForm.newPassword,
      });
      return;
    }
    if (mode === "forgot-password") {
      onForgotPassword({ email: forgotPasswordEmail });
      return;
    }
    if (mode === "reset-password") {
      if (!resetPasswordForm.token) {
        setLocalError("Reset link is invalid or missing token.");
        return;
      }
      if (String(resetPasswordForm.password || "") !== String(resetRepeatPassword || "")) {
        setLocalError("Passwords do not match.");
        return;
      }
      onResetPassword(resetPasswordForm);
      return;
    }
    onLogin({ email: form.email, password: form.password });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f5f7] p-4">
      <form
        className="grid w-full max-w-[430px] gap-4 rounded-2xl border border-[#dfe1e6] bg-white p-6 shadow-[0_12px_34px_rgba(9,30,66,0.12)]"
        onSubmit={submit}
      >
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
          <p className="text-[0.92rem] text-[#5e6c84]">
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
                className="w-full rounded-[10px] border border-[#c1c7d0] px-3 py-2"
                placeholder="Enter your full name"
                value={forcePasswordForm.name}
                onChange={(event) =>
                  setForcePasswordForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">
                Current password (optional for first login)
              </span>
              <div className="relative">
                <input
                  type={showForceCurrentPassword ? "text" : "password"}
                  className="w-full rounded-[10px] border border-[#c1c7d0] px-3 py-2 pr-10"
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
                  className="w-full rounded-[10px] border border-[#c1c7d0] px-3 py-2 pr-10"
                  placeholder="Enter new password"
                  value={forcePasswordForm.newPassword}
                  onChange={(event) =>
                    setForcePasswordForm((prev) => ({
                      ...prev,
                      newPassword: event.target.value,
                    }))
                  }
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
          </>
        ) : mode === "forgot-password" ? (
          <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
            <span className="font-medium">Email</span>
            <input
              className="rounded-[10px] border border-[#c1c7d0] px-3 py-2"
              placeholder="name@company.com"
              value={forgotPasswordEmail}
              onChange={(event) => setForgotPasswordEmail(event.target.value)}
            />
          </label>
        ) : mode === "reset-password" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">New password</span>
              <div className="relative">
                <input
                  type={showResetNewPassword ? "text" : "password"}
                  className="w-full rounded-[10px] border border-[#c1c7d0] px-3 py-2 pr-10"
                  placeholder="Enter new password"
                  value={resetPasswordForm.password}
                  onChange={(event) =>
                    setResetPasswordForm((prev) => ({ ...prev, password: event.target.value }))
                  }
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
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Repeat password</span>
              <div className="relative">
                <input
                  type={showResetRepeatPassword ? "text" : "password"}
                  className="w-full rounded-[10px] border border-[#c1c7d0] px-3 py-2 pr-10"
                  placeholder="Repeat new password"
                  value={resetRepeatPassword}
                  onChange={(event) => setResetRepeatPassword(event.target.value)}
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
            </label>
          </div>
        ) : (
          <div className="grid gap-3">
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Email</span>
              <input
                className="rounded-[10px] border border-[#c1c7d0] px-3 py-2"
                placeholder="name@company.com"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Password</span>
              <div className="relative">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  className="w-full rounded-[10px] border border-[#c1c7d0] px-3 py-2 pr-10"
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, password: event.target.value }))
                  }
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
            </label>
          </div>
        )}
        <button
          type="submit"
          className="mt-1 rounded-[10px] bg-[#2d64d9] py-2.5 font-semibold text-white hover:bg-[#2454b8]"
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
