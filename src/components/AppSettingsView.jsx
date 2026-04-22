import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";

export default function AppSettingsView({ canManage = false, onNotify }) {
  const [form, setForm] = useState({
    githubOrg: "",
    githubToken: "",
    githubWebhookSecret: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [showGithubWebhookSecret, setShowGithubWebhookSecret] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const settings = await apiRequest("/task-management/app-settings/github");
        if (cancelled) return;
        setForm({
          githubOrg: settings.githubOrg || "",
          githubToken: settings.githubToken || "",
          githubWebhookSecret: settings.githubWebhookSecret || "",
        });
      } catch (error) {
        if (!cancelled) {
          onNotify?.(error.message || "Failed to load app settings.", "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (canManage) load();
    else setLoading(false);
    return () => {
      cancelled = true;
    };
  }, [canManage, onNotify]);

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("/task-management/app-settings/github", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      onNotify?.("GitHub app settings saved.", "success");
    } catch (error) {
      onNotify?.(error.message || "Failed to save app settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-[0.9rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]">
      <div className="flex items-center justify-between gap-3">
        <h2>Application settings</h2>
      </div>
      {!canManage ? (
        <p className="text-[#5e6c84]">
          Only administrators can configure app-level GitHub credentials.
        </p>
      ) : loading ? (
        <p className="text-[#5e6c84]">Loading settings...</p>
      ) : (
        <div className="grid max-w-[780px] gap-[0.8rem] rounded-lg border border-[#dfe3ea] bg-[#fbfcfe] p-[0.85rem]">
          <div className="grid gap-1">
            <h3 className="text-[1rem] font-bold text-[#172b4d]">
              GitHub integration credentials
            </h3>
            <p className="text-[0.82rem] leading-[1.35] text-[#6b778c]">
              These values are used globally by repository mapping, webhook
              verification, and sync operations.
            </p>
          </div>
          <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
            GitHub owner / org
            <input
              className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
              placeholder="Enter GitHub organization or owner"
              value={form.githubOrg}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, githubOrg: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
            GitHub token
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
                type={showGithubToken ? "text" : "password"}
                placeholder="Enter GitHub token"
                value={form.githubToken}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, githubToken: event.target.value }))
                }
              />
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setShowGithubToken((prev) => !prev)}
                aria-label={showGithubToken ? "Hide GitHub token" : "Show GitHub token"}
                title={showGithubToken ? "Hide token" : "Show token"}
              >
                {showGithubToken ? "🙈" : "👁"}
              </button>
            </div>
          </label>
          <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
            GitHub webhook secret
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
                type={showGithubWebhookSecret ? "text" : "password"}
                placeholder="Enter webhook secret"
                value={form.githubWebhookSecret}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    githubWebhookSecret: event.target.value,
                  }))
                }
              />
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setShowGithubWebhookSecret((prev) => !prev)}
                aria-label={
                  showGithubWebhookSecret
                    ? "Hide GitHub webhook secret"
                    : "Show GitHub webhook secret"
                }
                title={showGithubWebhookSecret ? "Hide secret" : "Show secret"}
              >
                {showGithubWebhookSecret ? "🙈" : "👁"}
              </button>
            </div>
          </label>
          <div className="flex justify-end pt-1">
            <button type="button" disabled={saving} onClick={save}>
              {saving ? "Saving..." : "Save settings"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
