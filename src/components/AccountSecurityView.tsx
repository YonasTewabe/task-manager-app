import { useState } from "react";
import {
  REQUIRED_FIELD_MESSAGE,
  invalidFieldClassName,
} from "../utils/formValidation.js";

export default function AccountSecurityView({ onChangePassword }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<any>({});

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const err: AnyRecord = {};
    if (!String(currentPassword || "").trim())
      err.currentPassword = REQUIRED_FIELD_MESSAGE;
    if (!String(newPassword || "").trim())
      err.newPassword = REQUIRED_FIELD_MESSAGE;
    if (!String(confirmPassword || "").trim())
      err.confirmPassword = REQUIRED_FIELD_MESSAGE;
    if (Object.keys(err).length) {
      setFieldErrors(err);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated.");
    } catch (err) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grid gap-[1.1rem]">
      <div className="grid max-w-[640px] gap-4 rounded-[12px] border border-[#dfe1e6] bg-white p-5 shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
        <div className="border-b border-[#ebecf0] pb-3">
          <h2 className="text-[1.1rem] font-semibold text-[#172b4d]">
            Change Password
          </h2>
          <p className="mt-1 text-[0.9rem] text-[#5e6c84]">
            Update your sign-in password for this account.
          </p>
        </div>
        {error ? (
          <p className="rounded-[8px] border border-[#fecdca] bg-[#fff1f3] px-3 py-2 text-[0.9rem] text-[#b42318]">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-[8px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2 text-[0.9rem] text-[#067647]">
            {success}
          </p>
        ) : null}
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
            <span className="font-medium">Current password</span>
            <input
              type="password"
              className={`rounded-[8px] border px-3 py-2 ${fieldErrors.currentPassword ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                if (fieldErrors.currentPassword)
                  setFieldErrors((prev) => {
                    const n = { ...prev };
                    delete n.currentPassword;
                    return n;
                  });
              }}
            />
            {fieldErrors.currentPassword ? (
              <span className="text-[0.78rem] text-red-600">
                {fieldErrors.currentPassword}
              </span>
            ) : null}
          </label>
          <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
            <span className="font-medium">New password</span>
            <input
              type="password"
              className={`rounded-[8px] border px-3 py-2 ${fieldErrors.newPassword ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                if (fieldErrors.newPassword)
                  setFieldErrors((prev) => {
                    const n = { ...prev };
                    delete n.newPassword;
                    return n;
                  });
              }}
            />
            {fieldErrors.newPassword ? (
              <span className="text-[0.78rem] text-red-600">
                {fieldErrors.newPassword}
              </span>
            ) : null}
          </label>
          <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
            <span className="font-medium">Confirm new password</span>
            <input
              type="password"
              className={`rounded-[8px] border px-3 py-2 ${fieldErrors.confirmPassword ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (fieldErrors.confirmPassword)
                  setFieldErrors((prev) => {
                    const n = { ...prev };
                    delete n.confirmPassword;
                    return n;
                  });
              }}
            />
            {fieldErrors.confirmPassword ? (
              <span className="text-[0.78rem] text-red-600">
                {fieldErrors.confirmPassword}
              </span>
            ) : null}
          </label>
          <div className="flex justify-end border-t border-[#ebecf0] pt-3">
            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
