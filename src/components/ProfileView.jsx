import { useEffect, useMemo, useState } from "react";
import {
  REQUIRED_FIELD_MESSAGE,
  invalidFieldClassName,
} from "../utils/formValidation.js";

export default function ProfileView({ currentUser, onUpdateProfile, onChangePassword }) {
  const [activeTab, setActiveTab] = useState("info");
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [error, setError] = useState("");
  const [infoFieldErrors, setInfoFieldErrors] = useState({});
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});

  useEffect(() => {
    setInfoFieldErrors({});
    setPasswordFieldErrors({});
  }, [activeTab]);

  const isInfoChanged = useMemo(() => {
    return (
      String(name).trim() !== String(currentUser?.name || "").trim() ||
      String(email).trim().toLowerCase() !==
        String(currentUser?.email || "").trim().toLowerCase()
    );
  }, [name, email, currentUser?.name, currentUser?.email]);

  const submitInfo = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");
    setPasswordMessage("");
    const err = {};
    if (!String(name || "").trim()) err.name = REQUIRED_FIELD_MESSAGE;
    if (!String(email || "").trim()) err.email = REQUIRED_FIELD_MESSAGE;
    if (Object.keys(err).length) {
      setInfoFieldErrors(err);
      return;
    }
    setInfoFieldErrors({});
    setSavingInfo(true);
    try {
      await onUpdateProfile({ name, email });
      setInfoMessage("Profile updated.");
    } catch (err) {
      setError(err?.message || "Failed to update profile.");
    } finally {
      setSavingInfo(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setError("");
    setPasswordMessage("");
    setInfoMessage("");
    const err = {};
    if (!String(currentPassword || "").trim())
      err.currentPassword = REQUIRED_FIELD_MESSAGE;
    if (!String(newPassword || "").trim())
      err.newPassword = REQUIRED_FIELD_MESSAGE;
    if (!String(confirmPassword || "").trim())
      err.confirmPassword = REQUIRED_FIELD_MESSAGE;
    if (Object.keys(err).length) {
      setPasswordFieldErrors(err);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFieldErrors({
        confirmPassword: "Passwords do not match.",
      });
      return;
    }
    setPasswordFieldErrors({});
    setSavingPassword(true);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated.");
    } catch (err) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="grid gap-[1rem]">
      <div className="grid max-w-[760px] gap-4 rounded-[12px] border border-[#dfe1e6] bg-white p-5 shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
        <div className="border-b border-[#ebecf0] pb-3">
          <h2 className="text-[1.1rem] font-semibold text-[#172b4d]">Profile</h2>
          <p className="mt-1 text-[0.9rem] text-[#5e6c84]">
            Manage your personal information and password.
          </p>
        </div>

        <div className="flex items-center gap-2 border-b border-[#d0d6e0]">
          <button
            type="button"
            className={`rounded-t-[10px] px-4 py-2 text-[1rem] ${activeTab === "info" ? "border-b-[3px] border-[#2d64d9] bg-[#dfe8fb] font-semibold text-[#2d64d9]" : "text-[#5e6c84]"}`}
            onClick={() => setActiveTab("info")}
          >
            Info
          </button>
          <button
            type="button"
            className={`rounded-t-[10px] px-4 py-2 text-[1rem] ${activeTab === "password" ? "border-b-[3px] border-[#2d64d9] bg-[#dfe8fb] font-semibold text-[#2d64d9]" : "text-[#5e6c84]"}`}
            onClick={() => setActiveTab("password")}
          >
            Password
          </button>
        </div>

        {error ? (
          <p className="rounded-[8px] border border-[#fecdca] bg-[#fff1f3] px-3 py-2 text-[0.9rem] text-[#b42318]">
            {error}
          </p>
        ) : null}
        {infoMessage && activeTab === "info" ? (
          <p className="rounded-[8px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2 text-[0.9rem] text-[#067647]">
            {infoMessage}
          </p>
        ) : null}
        {passwordMessage && activeTab === "password" ? (
          <p className="rounded-[8px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2 text-[0.9rem] text-[#067647]">
            {passwordMessage}
          </p>
        ) : null}

        {activeTab === "info" ? (
          <form className="grid gap-4" onSubmit={submitInfo}>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Full name</span>
              <input
                className={`rounded-[8px] border px-3 py-2 ${infoFieldErrors.name ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (infoFieldErrors.name)
                    setInfoFieldErrors((prev) => {
                      const n = { ...prev };
                      delete n.name;
                      return n;
                    });
                }}
              />
              {infoFieldErrors.name ? (
                <span className="text-[0.78rem] text-red-600">{infoFieldErrors.name}</span>
              ) : null}
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Email</span>
              <input
                className={`rounded-[8px] border px-3 py-2 ${infoFieldErrors.email ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (infoFieldErrors.email)
                    setInfoFieldErrors((prev) => {
                      const n = { ...prev };
                      delete n.email;
                      return n;
                    });
                }}
              />
              {infoFieldErrors.email ? (
                <span className="text-[0.78rem] text-red-600">{infoFieldErrors.email}</span>
              ) : null}
            </label>
            <div className="flex justify-end border-t border-[#ebecf0] pt-3">
              <button type="submit" disabled={savingInfo || !isInfoChanged}>
                {savingInfo ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <form className="grid gap-4" onSubmit={submitPassword}>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Current password</span>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  className={`w-full rounded-[8px] border px-3 py-2 pr-10 ${passwordFieldErrors.currentPassword ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value);
                    if (passwordFieldErrors.currentPassword)
                      setPasswordFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.currentPassword;
                        return n;
                      });
                  }}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent px-1 py-0 text-[#5e6c84] hover:text-[#253858]"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                >
                  {showCurrentPassword ? "🙈" : "👁"}
                </button>
              </div>
              {passwordFieldErrors.currentPassword ? (
                <span className="text-[0.78rem] text-red-600">
                  {passwordFieldErrors.currentPassword}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">New password</span>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  className={`w-full rounded-[8px] border px-3 py-2 pr-10 ${passwordFieldErrors.newPassword ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    if (passwordFieldErrors.newPassword)
                      setPasswordFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.newPassword;
                        return n;
                      });
                  }}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent px-1 py-0 text-[#5e6c84] hover:text-[#253858]"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showNewPassword ? "🙈" : "👁"}
                </button>
              </div>
              {passwordFieldErrors.newPassword ? (
                <span className="text-[0.78rem] text-red-600">
                  {passwordFieldErrors.newPassword}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1 text-[0.9rem] text-[#172b4d]">
              <span className="font-medium">Confirm new password</span>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  className={`w-full rounded-[8px] border px-3 py-2 pr-10 ${passwordFieldErrors.confirmPassword ? invalidFieldClassName(true) : "border-[#c1c7d0]"}`}
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    if (passwordFieldErrors.confirmPassword)
                      setPasswordFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.confirmPassword;
                        return n;
                      });
                  }}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent px-1 py-0 text-[#5e6c84] hover:text-[#253858]"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? "🙈" : "👁"}
                </button>
              </div>
              {passwordFieldErrors.confirmPassword ? (
                <span className="text-[0.78rem] text-red-600">
                  {passwordFieldErrors.confirmPassword}
                </span>
              ) : null}
            </label>
            <div className="flex justify-end border-t border-[#ebecf0] pt-3">
              <button type="submit" disabled={savingPassword}>
                {savingPassword ? "Saving..." : "Update password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
