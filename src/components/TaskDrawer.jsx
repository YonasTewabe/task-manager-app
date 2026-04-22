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
  autoFocus = false,
}) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  useEffect(() => {
    if (!autoFocus || !editorRef.current) return;
    editorRef.current.focus();
  }, [autoFocus]);

  const runCommand = (command, commandValue = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || "");
  };

  const handleEditorClick = (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    const href = String(link.getAttribute("href") || "").trim();
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[#dfe1e6] bg-white">
      <div
        className="flex flex-wrap gap-[0.35rem] border-b border-[#dfe1e6] bg-[#f7f8fa] p-[0.4rem]"
        onMouseDown={(event) => {
          if (event.target?.closest?.("button")) {
            event.preventDefault();
          }
        }}
      >
        <button
          type="button"
          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
          onClick={() => runCommand("bold")}
        >
          B
        </button>
        <button
          type="button"
          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
          onClick={() => runCommand("italic")}
        >
          I
        </button>
        <button
          type="button"
          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
          onClick={() => runCommand("underline")}
        >
          U
        </button>
        <button
          type="button"
          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
          onClick={() => runCommand("insertUnorderedList")}
        >
          • List
        </button>
        <button
          type="button"
          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
          onClick={() => runCommand("insertOrderedList")}
        >
          1. List
        </button>
        <button
          type="button"
          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
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
          className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
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
        className="min-h-[120px] whitespace-pre-wrap p-[0.6rem] leading-[1.45] outline-none [&_a]:break-words [&_a]:text-[#0c66e4] [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-2 [&_a:hover]:text-[#0052cc] [&_ul]:my-[0.3rem] [&_ul]:ml-[1.1rem] [&_ul]:list-disc [&_ol]:my-[0.3rem] [&_ol]:ml-[1.1rem] [&_ol]:list-decimal"
        role="textbox"
        aria-multiline="true"
        contentEditable
        data-placeholder={placeholder}
        onClick={handleEditorClick}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
      />
    </div>
  );
}

export default function TaskDrawer({
  taskBundle,
  currentUserId,
  users,
  assigneeUsers = [],
  workflowStages,
  workflowTransitions = [],
  labels = [],
  versions = [],
  onClose,
  onSaveTask,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
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
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [devPanel, setDevPanel] = useState(null);
  const [isUploadingDescription, setIsUploadingDescription] = useState(false);
  const [isUploadingComment, setIsUploadingComment] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const titleEditorRef = useRef(null);
  const lastSavedPatchRef = useRef("");
  const previousTaskIdRef = useRef(null);

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
  const stageNameByKey = useMemo(
    () =>
      new Map(stages.map((stage) => [String(stage.key), String(stage.name)])),
    [stages],
  );

  useEffect(() => {
    const nextTaskId = task?.id == null ? null : String(task.id);
    const isTaskSwitch = previousTaskIdRef.current !== nextTaskId;
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
    if (isTaskSwitch) {
      setCommentBody("");
      setActivityTab("comments");
      setCommentComposerOpen(false);
      setDevPanel(null);
      setIsEditingTitle(false);
      setDescriptionDirty(false);
      setEditingCommentId(null);
      setEditingCommentBody("");
    }
    previousTaskIdRef.current = nextTaskId;
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
      case "comment_updated":
        return "Updated comment";
      case "comment_deleted":
        return "Deleted comment";
      default:
        return String(action || "Activity");
    }
  };

  const buildPatch = useCallback((source) => {
    return {
      title: source.title,
      description: toEditorRichText(source.description),
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

  const submitDescription = async () => {
    const patch = buildPatch(draft);
    await onSaveTask(task.id, patch);
    lastSavedPatchRef.current = JSON.stringify(patch);
    setDescriptionDirty(false);
  };

  useEffect(() => {
    if (!task || !draft) return;
    if (descriptionDirty) return;
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
  }, [buildPatch, descriptionDirty, draft, onNotify, onSaveTask, task]);
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
      setCommentComposerOpen(false);
      setDevPanel(null);
      setDraft(task || null);
      setDescriptionDirty(false);
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
    if (field === "status") {
      const key = String(value);
      const fromStage = stageNameByKey.get(key);
      if (fromStage) return fromStage;
      return key
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
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
      className="fixed inset-0 z-[35] grid place-items-center bg-[rgba(9,30,66,0.34)] p-4"
      role="presentation"
      onClick={handleClose}
    >
      <aside
        className="grid h-[min(88vh,900px)] w-[min(1160px,calc(100vw-2rem))] grid-rows-[auto_1fr] overflow-hidden rounded-[10px] border border-[#dfe1e6] bg-white shadow-[0_18px_40px_rgba(9,30,66,0.25)] max-[1100px]:h-[calc(100vh-1rem)] max-[1100px]:w-[min(100vw-1rem,980px)]"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-[0.9rem]">
          <div>
            <p className="mb-1 text-[0.78rem] tracking-[0.02em] text-[#5e6c84]">{displayTaskRef(task)}</p>
            <h3
              ref={titleEditorRef}
              className={`m-[-0.1rem_-0.2rem_0] cursor-text rounded-md px-[0.2rem] py-[0.1rem] text-[1.55rem] leading-[1.3] outline-none hover:bg-[#f4f5f7] ${isEditingTitle ? "bg-white shadow-[inset_0_0_0_1px_#b3bac5]" : ""}`}
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
          <div className="flex items-center gap-2">
            {isAutoSaving ? <span className="text-[#5e6c84]">Saving...</span> : null}
            <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={handleClose}>
              X
            </button>
          </div>
        </div>

        <div className="grid min-h-0 gap-[0.65rem] overflow-hidden px-4 py-[0.9rem]">
          <div className="grid min-h-0 grid-cols-[minmax(0,1.8fr)_minmax(290px,1fr)] gap-[0.95rem] max-[1100px]:grid-cols-1">
            <section className="grid max-h-full min-h-0 content-start gap-[0.7rem] overflow-auto pr-1">
              <div className="grid gap-[0.55rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.75rem]">
                <div className="flex items-center justify-between">
                  <h4>Description</h4>
                </div>
                <RichTextEditor
                  value={draft.description || ""}
                  placeholder="Add task details, context, and expected outcome."
                  uploading={isUploadingDescription}
                  onChange={(nextValue) =>
                    setDraft((prev) => {
                      if (prev.description === nextValue) return prev;
                      setDescriptionDirty(true);
                      return { ...prev, description: nextValue };
                    })
                  }
                  onUploadImage={(file) => uploadImage(file, "description")}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!descriptionDirty || isUploadingDescription || isAutoSaving}
                    onClick={async () => {
                      try {
                        await submitDescription();
                        onNotify?.("Description saved.");
                      } catch (error) {
                        onNotify?.(error?.message || "Failed to save description.", "error");
                      }
                    }}
                  >
                    Save description
                  </button>
                </div>
              </div>

              <div className="grid gap-[0.55rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.75rem]">
                <h4>Acceptance criteria</h4>
                <div className="grid gap-[0.4rem]">
                  {(draft.acceptanceCriteria || []).length ? (
                    (draft.acceptanceCriteria || []).map((criterion) => (
                      <label
                        key={criterion.id}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-[0.45rem] rounded-md border border-[#e4e8f0] bg-[#fbfcfe] px-[0.45rem] py-[0.4rem]"
                      >
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
                          className={`${criterion.done ? "text-[#6b778c] line-through" : ""}`}
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
                          className="border border-[#d0d7e2] bg-[#f7f8fa] text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55]"
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
                    <p className="text-[#5e6c84]">No acceptance criteria added.</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="border border-[#d0d7e2] bg-[#f7f8fa] text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55]"
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

              <div className="grid gap-[0.55rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.75rem]">
                <h4>Activity</h4>
                <div className="flex gap-2 border-b border-[#dfe1e6] pb-2">
                  <button
                    type="button"
                    className={`border border-[#d0d7e2] bg-[#f7f8fa] text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55] ${activityTab === "comments" ? "border-[#8bb1ff] bg-[#edf3ff] font-semibold text-[#0c66e4] shadow-[inset_0_0_0_1px_rgba(12,102,228,0.18)]" : ""}`}
                    onClick={() => setActivityTab("comments")}
                    aria-pressed={activityTab === "comments"}
                  >
                    Comments
                  </button>
                  <button
                    type="button"
                    className={`border border-[#d0d7e2] bg-[#f7f8fa] text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55] ${activityTab === "history" ? "border-[#8bb1ff] bg-[#edf3ff] font-semibold text-[#0c66e4] shadow-[inset_0_0_0_1px_rgba(12,102,228,0.18)]" : ""}`}
                    onClick={() => setActivityTab("history")}
                    aria-pressed={activityTab === "history"}
                  >
                    History
                  </button>
                </div>
                <div className="grid gap-[0.45rem] pr-1">
                  {activityTab === "comments" ? (
                    commentComposerOpen ? (
                      <div className="grid gap-[0.45rem] rounded-md border border-[#dfe1e6] bg-white p-[0.45rem]">
                        <RichTextEditor
                          value={commentBody}
                          placeholder="Add a comment..."
                          uploading={isUploadingComment}
                          onChange={setCommentBody}
                          onUploadImage={(file) => uploadImage(file, "comment")}
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="border border-[#d0d7e2] bg-[#f7f8fa] text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55]"
                            onClick={() => {
                              setCommentBody("");
                              setCommentComposerOpen(false);
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isRichTextEmpty(commentBody)}
                            onClick={() => {
                              if (isRichTextEmpty(commentBody)) return;
                              onAddComment(task.id, commentBody);
                              setCommentBody("");
                              setCommentComposerOpen(false);
                            }}
                          >
                            Add comment
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="w-full rounded-md border border-[#d0d7e2] bg-white px-3 py-[0.6rem] text-left text-[#6b778c] hover:bg-[#f8fafd]"
                        onClick={() => setCommentComposerOpen(true)}
                      >
                        Add a comment...
                      </button>
                    )
                  ) : null}
                  {activityTab === "comments" ? (
                    visibleActivity.map((comment) => (
                      <article
                        key={comment.id}
                        className="mb-2 grid gap-[0.35rem] rounded-md border border-[#dfe1e6] bg-[#fbfcfe] p-[0.55rem]"
                      >
                        <div className="mb-1 text-[0.78rem] font-medium text-[#5e6c84]">
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              {comment.userName ||
                                userMap.get(comment.userId) ||
                                "Unknown"}{" "}
                              - {formatDateTime(comment.createdAt)}
                            </span>
                            {String(comment.userId || "") ===
                            String(currentUserId || "") ? (
                              <span className="inline-flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center border border-[#0b63c5] bg-[#0b6bcb] p-1 text-white hover:border-[#0957a3] hover:bg-[#095db2]"
                                  title="Edit comment"
                                  aria-label="Edit comment"
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingCommentBody(
                                      toEditorRichText(comment.body || ""),
                                    );
                                  }}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-[0.85rem] w-[0.85rem]"
                                    aria-hidden="true"
                                  >
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center border border-[#dc2626] bg-[#dc2626] p-1 text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                                  title="Delete comment"
                                  aria-label="Delete comment"
                                  onClick={async () => {
                                    if (!onDeleteComment) return;
                                    await onDeleteComment(task.id, comment.id);
                                  }}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-[0.85rem] w-[0.85rem]"
                                    aria-hidden="true"
                                  >
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                                    <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
                                    <line x1="10" y1="11" x2="10" y2="17" />
                                    <line x1="14" y1="11" x2="14" y2="17" />
                                  </svg>
                                </button>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {editingCommentId === comment.id ? (
                          <div className="grid gap-2">
                            <RichTextEditor
                              value={editingCommentBody}
                              placeholder="Edit comment..."
                              uploading={isUploadingComment}
                              onChange={setEditingCommentBody}
                              onUploadImage={(file) =>
                                uploadImage(file, "comment")
                              }
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="border border-[#d0d7e2] bg-[#f7f8fa] text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55]"
                                onClick={() => {
                                  setEditingCommentId(null);
                                  setEditingCommentBody("");
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={isRichTextEmpty(editingCommentBody)}
                                onClick={async () => {
                                  if (
                                    !onUpdateComment ||
                                    isRichTextEmpty(editingCommentBody)
                                  )
                                    return;
                                  await onUpdateComment(
                                    task.id,
                                    comment.id,
                                    editingCommentBody,
                                  );
                                  setEditingCommentId(null);
                                  setEditingCommentBody("");
                                }}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="rounded-md border border-[#dfe1e6] bg-[#fafbfc] p-2 whitespace-pre-wrap [&_a]:break-words [&_a]:text-[#0c66e4] [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-2 [&_a:hover]:text-[#0052cc] [&_ul]:my-[0.3rem] [&_ul]:ml-[1.1rem] [&_ul]:list-disc [&_ol]:my-[0.3rem] [&_ol]:ml-[1.1rem] [&_ol]:list-decimal"
                            dangerouslySetInnerHTML={{
                              __html: toDisplayRichText(comment.body),
                            }}
                          />
                        )}
                      </article>
                    ))
                  ) : visibleActivity.length ? (
                    visibleActivity.map((item) => (
                      <div key={item.id} className="grid gap-1 rounded-md border border-[#e5e9f0] bg-[#f9fafc] px-[0.55rem] py-[0.5rem] text-[0.84rem]">
                        <div className="font-medium text-[#1f3657]">
                          {formatActivityAction(item.action)}
                        </div>
                        <div className="text-[#5e6c84]">
                          {item.userName ||
                            userMap.get(item.userId) ||
                            "Unknown"}{" "}
                          - {formatDateTime(item.createdAt)}
                        </div>
                        {item.meta?.from !== undefined ||
                        item.meta?.to !== undefined ? (
                          <div className="text-[#5e6c84]">
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
                                className="text-[#5e6c84]"
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
                    <p className="text-[#5e6c84]">No recent activity.</p>
                  )}
                </div>
              </div>
            </section>

            <aside className="grid max-h-full min-h-0 content-start gap-[0.7rem] overflow-auto pr-1">
              <div className="grid gap-[0.55rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.75rem]">
                <h4>Details</h4>
                <div className="grid gap-[0.3rem] rounded-md border border-[#e5e9f0] bg-[#fbfcfe] p-[0.55rem]">
                  <div className="flex items-baseline justify-between gap-3 text-[0.85rem]">
                    <span className="text-[#5e6c84]">Reporter</span>
                    <span className="font-medium">{reporterName}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-[0.85rem]">
                    <span className="text-[#5e6c84]">Created</span>
                    <span className="font-medium">{formatDateTime(task.createdAt)}</span>
                  </div>
                </div>
                <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
                  Status
                  <select
                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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
                <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
                  Assignee
                  <select
                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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
                <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
                  Priority
                  <select
                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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
                <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
                  Label
                  <select
                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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
                <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
                  Version
                  <select
                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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
                <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
                  Story points
                  <input
                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
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

              <div className="grid gap-[0.55rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.75rem]">
                <h4>Development</h4>
                <div className="relative grid gap-1">
                  {devPanel === "branch" ? (
                    <div className="absolute bottom-[calc(100%+0.45rem)] left-0 right-0 z-[5]">
                      <div className="grid gap-2 rounded-lg border border-[#dfe1e6] bg-white p-[0.55rem] shadow-[0_8px_22px_rgba(9,30,66,0.16)]">
                        <div className="text-[0.74rem] font-bold uppercase tracking-[0.02em] text-[#42526e]">
                          Git create & checkout a new branch
                        </div>
                        <div className="grid grid-cols-[1fr_auto] items-center gap-[0.35rem]">
                          <input readOnly value={branchCommand} />
                          <button
                            type="button"
                            className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
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
                    <div className="absolute bottom-[calc(100%+0.45rem)] left-0 right-0 z-[5]">
                      <div className="grid gap-2 rounded-lg border border-[#dfe1e6] bg-white p-[0.55rem] shadow-[0_8px_22px_rgba(9,30,66,0.16)]">
                        <div className="text-[0.74rem] font-bold uppercase tracking-[0.02em] text-[#42526e]">
                          Link commits to task
                        </div>
                        <div className="grid grid-cols-[1fr_auto] items-center gap-[0.35rem]">
                          <input readOnly value={taskRef} />
                          <button
                            type="button"
                            className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
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
                        <div className="grid grid-cols-[1fr_auto] items-center gap-[0.35rem]">
                          <input readOnly value={commitCommand} />
                          <button
                            type="button"
                            className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
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
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-left text-[#0c66e4] hover:bg-[#f4f5f7]"
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
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-left text-[#0c66e4] hover:bg-[#f4f5f7]"
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
