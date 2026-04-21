import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WORKFLOW_STAGES } from "../workflowDefaults.js";
import { displayTaskRef } from "../utils/taskDisplay.js";
import {
  isRichTextEmpty,
  toDisplayRichText,
  toEditorRichText,
} from "../utils/richText.js";

function RichTextEditor({
  value,
  placeholder,
  uploading,
  onChange,
  onUploadImage,
}) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const runCommand = (command, commandValue = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || "");
  };

  return (
    <div className="rich-editor">
      <div className="rich-editor-toolbar">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => runCommand("bold")}
        >
          B
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => runCommand("italic")}
        >
          I
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => runCommand("underline")}
        >
          U
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => runCommand("insertUnorderedList")}
        >
          • List
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => runCommand("insertOrderedList")}
        >
          1. List
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            const url = window.prompt("Enter URL");
            if (!url) return;
            runCommand("createLink", url.trim());
          }}
        >
          Link
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Uploading..." : "Image"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const imageUrl = await onUploadImage(file);
            if (imageUrl) runCommand("insertImage", imageUrl);
            event.target.value = "";
          }}
        />
      </div>
      <div
        ref={editorRef}
        className="rich-editor-content"
        role="textbox"
        aria-multiline="true"
        contentEditable
        data-placeholder={placeholder}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
      />
    </div>
  );
}

export default function TaskDrawer({
  taskBundle,
  users,
  assigneeUsers = [],
  workflowStages,
  workflowTransitions = [],
  labels = [],
  versions = [],
  onClose,
  onSaveTask,
  onAddComment,
  onUploadAsset,
  onNotify,
}) {
  const normalizeAcceptanceCriteria = useCallback((value) => {
    const list = Array.isArray(value) ? value : [];
    return list
      .map((item, index) => {
        const text = String(item?.text || "").trim();
        if (!text) return null;
        return {
          id:
            String(item?.id || "").trim() ||
            `ac-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          done: item?.done === true,
        };
      })
      .filter(Boolean);
  }, []);
  const task = taskBundle?.task;
  const [draft, setDraft] = useState(
    task
      ? {
          ...task,
          acceptanceCriteria: normalizeAcceptanceCriteria(
            task.acceptanceCriteria,
          ),
        }
      : null,
  );
  const [commentBody, setCommentBody] = useState("");
  const [activityTab, setActivityTab] = useState("comments");
  const [devPanel, setDevPanel] = useState(null);
  const [isUploadingDescription, setIsUploadingDescription] = useState(false);
  const [isUploadingComment, setIsUploadingComment] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const titleEditorRef = useRef(null);
  const lastSavedPatchRef = useRef("");

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((user) => map.set(user.id, user.name));
    return map;
  }, [users]);

  const stages = workflowStages?.length
    ? workflowStages
    : DEFAULT_WORKFLOW_STAGES;
  const allowedStatusKeys = useMemo(() => {
    const currentStatus = String(task?.status || "").trim();
    if (!currentStatus) return stages.map((stage) => stage.key);
    const nextKeys = workflowTransitions
      .filter((transition) => String(transition?.from || "") === currentStatus)
      .map((transition) => String(transition?.to || "").trim())
      .filter(Boolean);
    const allowed = new Set([currentStatus, ...nextKeys]);
    return stages
      .map((stage) => String(stage?.key || "").trim())
      .filter((key) => allowed.has(key));
  }, [stages, task?.status, workflowTransitions]);
  const statusOptions = useMemo(() => {
    const byKey = new Map(
      stages.map((stage) => [String(stage.key), stage.name]),
    );
    return allowedStatusKeys.map((key) => ({
      key,
      name: byKey.get(key) || key,
    }));
  }, [allowedStatusKeys, stages]);

  useEffect(() => {
    setDraft(
      task
        ? {
            ...task,
            description: toEditorRichText(task.description),
            acceptanceCriteria: normalizeAcceptanceCriteria(
              task.acceptanceCriteria,
            ),
          }
        : null,
    );
    setCommentBody("");
    setActivityTab("comments");
    setDevPanel(null);
    setIsEditingTitle(false);
  }, [normalizeAcceptanceCriteria, task]);

  useEffect(() => {
    if (!isEditingTitle || !titleEditorRef.current) return;
    titleEditorRef.current.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(titleEditorRef.current);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditingTitle]);

  const formatDateTime = (value) => {
    if (!value) return "None";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "None";
    return date.toLocaleString();
  };

  const formatActivityAction = (action) => {
    switch (action) {
      case "task_created":
        return "Created task";
      case "task_updated":
        return "Updated task";
      case "task_moved":
        return "Moved task";
      case "comment_added":
        return "Added comment";
      default:
        return String(action || "Activity");
    }
  };

  const buildPatch = useCallback((source) => {
    return {
      title: source.title,
      description: source.description,
      label: source.label || "",
      status: source.status,
      storyPoints:
        source.storyPoints === "" || source.storyPoints == null
          ? null
          : Number(source.storyPoints),
      assigneeId: source.assigneeId ? String(source.assigneeId) : null,
      priority: source.priority,
      type: source.type,
      version: source.version || "",
      acceptanceCriteria: normalizeAcceptanceCriteria(source.acceptanceCriteria),
    };
  }, [normalizeAcceptanceCriteria]);

  useEffect(() => {
    if (!task) return;
    lastSavedPatchRef.current = JSON.stringify(buildPatch(task));
  }, [buildPatch, task]);

  const submitPatch = async () => {
    await onSaveTask(task.id, buildPatch(draft));
  };

  useEffect(() => {
    if (!task || !draft) return;
    const draftPatch = buildPatch(draft);
    const draftPatchJson = JSON.stringify(draftPatch);
    const taskPatchJson = JSON.stringify(buildPatch(task));
    if (
      draftPatchJson === taskPatchJson ||
      draftPatchJson === lastSavedPatchRef.current
    ) {
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setIsAutoSaving(true);
        await onSaveTask(task.id, draftPatch);
        lastSavedPatchRef.current = draftPatchJson;
      } catch (error) {
        onNotify?.(error?.message || "Failed to auto-save task updates.", "error");
      } finally {
        setIsAutoSaving(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [buildPatch, draft, onNotify, onSaveTask, task]);
  if (!task || !draft) return null;
  const uploadImage = async (file, target) => {
    if (!file || !onUploadAsset) return;
    const setLoading =
      target === "description"
        ? setIsUploadingDescription
        : setIsUploadingComment;
    setLoading(true);
    try {
      const uploaded = await onUploadAsset(file);
      onNotify?.("Image uploaded.");
      return uploaded.url;
    } catch (error) {
      onNotify?.(error?.message || "Failed to upload image.", "error");
      return null;
    } finally {
      setLoading(false);
    }
  };
  const hasUnsavedChanges =
    JSON.stringify(buildPatch(draft)) !== JSON.stringify(buildPatch(task));
  const handleClose = async () => {
    const resetLocalState = () => {
      setCommentBody("");
      setActivityTab("comments");
      setDevPanel(null);
      setDraft(task || null);
    };
    if (!hasUnsavedChanges) {
      resetLocalState();
      onClose();
      return;
    }
    try {
      await submitPatch();
      resetLocalState();
      onClose();
    } catch (error) {
      onNotify?.(error?.message || "Failed to save task updates.", "error");
    }
  };

  const sortByLatest = (items) =>
    [...items].sort(
      (a, b) =>
        new Date(b?.createdAt || 0).getTime() -
        new Date(a?.createdAt || 0).getTime(),
    );
  const visibleActivity =
    activityTab === "comments"
      ? sortByLatest(taskBundle.comments || [])
      : sortByLatest(taskBundle.activity || []);
  const reporterName = userMap.get(task.createdBy) || "Unknown";
  const formatFieldLabel = (field) => {
    const labelsByField = {
      title: "Title",
      description: "Description",
      status: "Status",
      storyPoints: "Story point",
      priority: "Priority",
      type: "Type",
      version: "Version",
      assigneeId: "Assignee",
      label: "Label",
      acceptanceCriteria: "Acceptance criteria",
    };
    return labelsByField[field] || field;
  };
  const formatChangeValue = (field, value) => {
    if (value == null || value === "") return "None";
    if (field === "assigneeId") return userMap.get(value) || "Unknown";
    return String(value);
  };
  const toBranchSlug = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  const taskRef = String(displayTaskRef(task) || task.taskKey || task.id || "")
    .trim()
    .toUpperCase();
  const branchName = `${taskRef}-${toBranchSlug(task.title)}`;
  const branchCommand = `git checkout -b ${branchName}`;
  const commitCommand = `git commit -m "${taskRef} ${String(task.title || "").trim()}"`;

  return (
    <div
      className="task-detail-overlay"
      role="presentation"
      onClick={handleClose}
    >
      <aside
        className="task-drawer"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="task-drawer-head">
          <div>
            <p className="muted task-drawer-ref">{displayTaskRef(task)}</p>
            <h3
              ref={titleEditorRef}
              className={`task-drawer-title-editable ${isEditingTitle ? "is-editing" : ""}`}
              role="button"
              tabIndex={0}
              contentEditable={isEditingTitle}
              suppressContentEditableWarning
              onClick={() => setIsEditingTitle(true)}
              onBlur={(event) => {
                const nextTitle = String(
                  event.currentTarget.textContent || "",
                ).trim();
                setDraft((prev) => ({
                  ...prev,
                  title: nextTitle || task.title,
                }));
                setIsEditingTitle(false);
              }}
              onInput={(event) => {
                const nextTitle = event.currentTarget?.textContent || "";
                setDraft((prev) => ({
                  ...prev,
                  title: nextTitle,
                }));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft((prev) => ({
                    ...prev,
                    title: task.title,
                  }));
                  event.currentTarget.textContent = task.title;
                  event.currentTarget.blur();
                }
              }}
              title="Click to edit title"
            >
              {draft.title}
            </h3>
          </div>
          <div className="task-drawer-head-actions">
            {isAutoSaving ? <span className="muted">Saving...</span> : null}
            <button type="button" className="ghost-btn" onClick={handleClose}>
              X
            </button>
          </div>
        </div>

        <div className="task-drawer-body">
          <div className="task-detail-layout">
            <section className="task-main-pane">
              <div className="task-detail-card">
                <h4>Description</h4>
                <RichTextEditor
                  value={draft.description || ""}
                  placeholder="Add task details, context, and expected outcome."
                  uploading={isUploadingDescription}
                  onChange={(nextValue) =>
                    setDraft((prev) => ({ ...prev, description: nextValue }))
                  }
                  onUploadImage={(file) => uploadImage(file, "description")}
                />
              </div>

              <div className="task-detail-card">
                <h4>Acceptance criteria</h4>
                <div className="acceptance-list">
                  {(draft.acceptanceCriteria || []).length ? (
                    (draft.acceptanceCriteria || []).map((criterion) => (
                      <label key={criterion.id} className="acceptance-item">
                        <input
                          type="checkbox"
                          checked={criterion.done === true}
                          onChange={(event) =>
                            setDraft((prev) => ({
                              ...prev,
                              acceptanceCriteria: (
                                prev.acceptanceCriteria || []
                              ).map((item) =>
                                item.id === criterion.id
                                  ? { ...item, done: event.target.checked }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <input
                          className={`acceptance-text-input ${criterion.done ? "is-done" : ""}`}
                          value={criterion.text}
                          onChange={(event) =>
                            setDraft((prev) => ({
                              ...prev,
                              acceptanceCriteria: (
                                prev.acceptanceCriteria || []
                              ).map((item) =>
                                item.id === criterion.id
                                  ? { ...item, text: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              acceptanceCriteria: (
                                prev.acceptanceCriteria || []
                              ).filter((item) => item.id !== criterion.id),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </label>
                    ))
                  ) : (
                    <p className="muted">No acceptance criteria added.</p>
                  )}
                </div>
                <div className="task-activity-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        acceptanceCriteria: [
                          ...(prev.acceptanceCriteria || []),
                          {
                            id: `ac-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            text: "",
                            done: false,
                          },
                        ],
                      }))
                    }
                  >
                    Add criterion
                  </button>
                </div>
              </div>

              <div className="task-detail-card">
                <h4>Activity</h4>
                <div className="task-activity-tabs">
                  <button
                    type="button"
                    className={`ghost-btn ${activityTab === "comments" ? "is-active" : ""}`}
                    onClick={() => setActivityTab("comments")}
                  >
                    Comments
                  </button>
                  <button
                    type="button"
                    className={`ghost-btn ${activityTab === "history" ? "is-active" : ""}`}
                    onClick={() => setActivityTab("history")}
                  >
                    History
                  </button>
                </div>
                <div className="comments-list">
                  {activityTab === "comments" ? (
                    visibleActivity.map((comment) => (
                      <article key={comment.id} className="comment">
                        <div className="comment-author">
                          {comment.userName ||
                            userMap.get(comment.userId) ||
                            "Unknown"}{" "}
                          - {formatDateTime(comment.createdAt)}
                        </div>
                        <div
                          className="rich-text-preview"
                          dangerouslySetInnerHTML={{
                            __html: toDisplayRichText(comment.body),
                          }}
                        />
                      </article>
                    ))
                  ) : visibleActivity.length ? (
                    visibleActivity.map((item) => (
                      <div key={item.id} className="task-activity-row">
                        <div>{formatActivityAction(item.action)}</div>
                        <div className="muted">
                          {item.userName ||
                            userMap.get(item.userId) ||
                            "Unknown"}{" "}
                          - {formatDateTime(item.createdAt)}
                        </div>
                        {item.meta?.from !== undefined ||
                        item.meta?.to !== undefined ? (
                          <div className="muted">
                            Status:{" "}
                            {formatChangeValue("status", item.meta?.from)}
                            {" -> "}
                            {formatChangeValue("status", item.meta?.to)}
                          </div>
                        ) : null}
                        {Array.isArray(item.meta?.changes)
                          ? item.meta.changes.map((change, index) => (
                              <div
                                key={`${item.id}-change-${index}`}
                                className="muted"
                              >
                                {formatFieldLabel(change.field)}:{" "}
                                {formatChangeValue(change.field, change.from)}
                                {" -> "}
                                {formatChangeValue(change.field, change.to)}
                              </div>
                            ))
                          : null}
                      </div>
                    ))
                  ) : (
                    <p className="muted">No recent activity.</p>
                  )}
                </div>
                {activityTab === "comments" ? (
                  <>
                    <RichTextEditor
                      value={commentBody}
                      placeholder="Add a comment..."
                      uploading={isUploadingComment}
                      onChange={setCommentBody}
                      onUploadImage={(file) => uploadImage(file, "comment")}
                    />
                    <div className="task-activity-actions">
                      <button
                        type="button"
                        onClick={() => {
                          if (isRichTextEmpty(commentBody)) return;
                          onAddComment(task.id, commentBody);
                          setCommentBody("");
                        }}
                      >
                        Add comment
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            <aside className="task-side-pane">
              <div className="task-detail-card">
                <h4>Details</h4>
                <div className="task-meta-list">
                  <div className="task-meta-row">
                    <span className="muted">Reporter</span>
                    <span>{reporterName}</span>
                  </div>
                  <div className="task-meta-row">
                    <span className="muted">Created</span>
                    <span>{formatDateTime(task.createdAt)}</span>
                  </div>
                </div>
                <label>
                  Status
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        status: event.target.value,
                      }))
                    }
                  >
                    {statusOptions.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Assignee
                  <select
                    value={draft.assigneeId || ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        assigneeId: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {assigneeUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={draft.priority || "medium"}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        priority: event.target.value,
                      }))
                    }
                  >
                    <option value="highest">Highest</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="lowest">Lowest</option>
                  </select>
                </label>
                <label>
                  Label
                  <select
                    value={draft.label || ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        label: event.target.value,
                      }))
                    }
                  >
                    <option value="">None</option>
                    {labels.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Version
                  <select
                    value={draft.version || ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        version: event.target.value,
                      }))
                    }
                  >
                    <option value="">None</option>
                    {versions.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Story points
                  <input
                    type="number"
                    min="1"
                    max="21"
                    value={draft.storyPoints ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        storyPoints: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="task-detail-card">
                <h4>Development</h4>
                <div className="task-side-link-list dev-actions">
                  {devPanel === "branch" ? (
                    <div className="dev-command-popover">
                      <div className="branch-command-card">
                        <div className="branch-command-title">
                          Git create & checkout a new branch
                        </div>
                        <div className="branch-command-row">
                          <input readOnly value={branchCommand} />
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  branchCommand,
                                );
                                onNotify?.("Branch command copied.");
                              } catch {
                                onNotify?.(
                                  "Failed to copy branch command.",
                                  "error",
                                );
                              }
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {devPanel === "commit" ? (
                    <div className="dev-command-popover">
                      <div className="branch-command-card">
                        <div className="branch-command-title">
                          Link commits to task
                        </div>
                        <div className="branch-command-row">
                          <input readOnly value={taskRef} />
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(taskRef);
                                onNotify?.("Task key copied.");
                              } catch {
                                onNotify?.("Failed to copy task key.", "error");
                              }
                            }}
                          >
                            Copy
                          </button>
                        </div>
                        <div className="branch-command-row">
                          <input readOnly value={commitCommand} />
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  commitCommand,
                                );
                                onNotify?.("Commit command copied.");
                              } catch {
                                onNotify?.(
                                  "Failed to copy commit command.",
                                  "error",
                                );
                              }
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="task-side-link"
                    onClick={() =>
                      setDevPanel((prev) =>
                        prev === "branch" ? null : "branch",
                      )
                    }
                  >
                    Create branch
                  </button>
                  <button
                    type="button"
                    className="task-side-link"
                    onClick={() =>
                      setDevPanel((prev) =>
                        prev === "commit" ? null : "commit",
                      )
                    }
                  >
                    Create commit
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </aside>
    </div>
  );
}
