import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WORKFLOW_STAGES } from "../workflowDefaults.js";
import { displayTaskRef } from "../utils/taskDisplay.js";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";
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
  mentionUsers = [],
  autoFocus = false,
}) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

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

  const filteredMentionUsers = useMemo(() => {
    const query = String(mentionQuery || "")
      .trim()
      .toLowerCase();
    const list = Array.isArray(mentionUsers) ? mentionUsers : [];
    return list
      .filter((entry) => {
        const name = String(entry?.name || "")
          .trim()
          .toLowerCase();
        const emailLocal = String(entry?.email || "")
          .split("@")[0]
          .trim()
          .toLowerCase();
        const mentionToken = String(entry?.mentionToken || "")
          .split("@")[0]
          .trim()
          .toLowerCase();
        if (!name) return false;
        if (!query) return true;
        return (
          name.includes(query) ||
          emailLocal.includes(query) ||
          mentionToken.includes(query)
        );
      })
      .slice(0, 8);
  }, [mentionQuery, mentionUsers]);

  const updateMentionState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setMentionOpen(false);
      setMentionQuery("");
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer)) {
      setMentionOpen(false);
      setMentionQuery("");
      return;
    }
    const textRange = range.cloneRange();
    textRange.selectNodeContents(editor);
    textRange.setEnd(range.startContainer, range.startOffset);
    const beforeText = textRange.toString();
    const atMatch = beforeText.match(/(?:^|\s)@([a-zA-Z0-9._-]{0,64})$/);
    if (!atMatch) {
      setMentionOpen(false);
      setMentionQuery("");
      return;
    }
    const nextQuery = String(atMatch[1] || "");
    setMentionQuery((prev) => {
      if (prev !== nextQuery) {
        setMentionIndex(0);
      }
      return nextQuery;
    });
    setMentionOpen((prev) => {
      if (!prev) setMentionIndex(0);
      return true;
    });
  }, []);

  const insertMention = useCallback(
    (entry) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.startContainer)) return;
      const mentionToken = String(
        entry?.mentionToken || entry?.name || "",
      ).trim();
      if (!mentionToken) return;
      const mentionText = `@${mentionToken}`;
      const tokenLength = mentionQuery.length + 1;
      const startOffset = Math.max(0, range.startOffset - tokenLength);
      try {
        if (
          range.startContainer.nodeType === Node.TEXT_NODE &&
          range.startOffset >= tokenLength
        ) {
          const replaceRange = document.createRange();
          replaceRange.setStart(range.startContainer, startOffset);
          replaceRange.setEnd(range.startContainer, range.startOffset);
          replaceRange.deleteContents();
          const node = document.createTextNode(`${mentionText} `);
          replaceRange.insertNode(node);
          const after = document.createRange();
          after.setStartAfter(node);
          after.collapse(true);
          selection.removeAllRanges();
          selection.addRange(after);
        } else {
          document.execCommand("insertText", false, `${mentionText} `);
        }
      } catch {
        document.execCommand("insertText", false, `${mentionText} `);
      }
      setMentionOpen(false);
      setMentionQuery("");
      onChange(editor.innerHTML || "");
    },
    [mentionQuery, onChange],
  );

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
        onInput={(event) => {
          onChange(event.currentTarget.innerHTML);
          updateMentionState();
        }}
        onKeyUp={() => updateMentionState()}
        onKeyDown={(event) => {
          if (!mentionOpen || !filteredMentionUsers.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setMentionIndex((prev) =>
              prev + 1 >= filteredMentionUsers.length ? 0 : prev + 1,
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setMentionIndex((prev) =>
              prev - 1 < 0 ? filteredMentionUsers.length - 1 : prev - 1,
            );
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            const selected =
              filteredMentionUsers[mentionIndex] || filteredMentionUsers[0];
            if (selected) insertMention(selected);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setMentionOpen(false);
            setMentionQuery("");
          }
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setMentionOpen(false);
            setMentionQuery("");
          }, 80);
        }}
      />
      {mentionOpen && filteredMentionUsers.length ? (
        <div className="max-h-[180px] overflow-auto border-t border-[#dfe1e6] bg-white p-1">
          {filteredMentionUsers.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className={`w-full rounded-[8px] px-2 py-1.5 text-left text-[0.86rem] ${index === mentionIndex ? "bg-[#edf3ff] text-[#0c66e4]" : "text-[#253858] hover:bg-[#f4f6fa]"}`}
              onMouseDown={(event) => {
                event.preventDefault();
                insertMention(entry);
              }}
            >
              <div className="font-medium">
                {entry.type === "group" ? `Group: ${entry.name}` : entry.name}
              </div>
              <div className="text-[0.76rem] text-[#6b778c]">
                {entry.type === "group"
                  ? `@${entry.mentionToken}`
                  : entry.email}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MemoRichTextEditor = memo(RichTextEditor);

function normalizeDateForInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const isoLike = raw.includes("T") ? raw.split("T")[0] : raw;
  const match = isoLike.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export default function TaskDrawer({
  taskBundle,
  currentUserId,
  users,
  assigneeUsers = [],
  mentionUsers = [],
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
  const linkedDev = taskBundle?.linkedDev || {
    branches: [],
    commits: [],
    pullRequests: [],
  };
  const {
    drawerDraft: draft,
    setDrawerDraft: setDraft,
    drawerCommentBody: commentBody,
    setDrawerCommentBody: setCommentBody,
    drawerActivityTab: activityTab,
    setDrawerActivityTab: setActivityTab,
    drawerCommentComposerOpen: commentComposerOpen,
    setDrawerCommentComposerOpen: setCommentComposerOpen,
    drawerDevPanel: devPanel,
    setDrawerDevPanel: setDevPanel,
    drawerIsUploadingDescription: isUploadingDescription,
    setDrawerIsUploadingDescription: setIsUploadingDescription,
    drawerIsUploadingComment: isUploadingComment,
    setDrawerIsUploadingComment: setIsUploadingComment,
    drawerIsEditingTitle: isEditingTitle,
    setDrawerIsEditingTitle: setIsEditingTitle,
    drawerDescriptionDirty: descriptionDirty,
    setDrawerDescriptionDirty: setDescriptionDirty,
    drawerIsAutoSaving: isAutoSaving,
    setDrawerIsAutoSaving: setIsAutoSaving,
    drawerEditingCommentId: editingCommentId,
    setDrawerEditingCommentId: setEditingCommentId,
    drawerEditingCommentBody: editingCommentBody,
    setDrawerEditingCommentBody: setEditingCommentBody,
  } = useAppStore(
    useShallow((state) => ({
      drawerDraft: state.drawerDraft,
      setDrawerDraft: state.setDrawerDraft,
      drawerCommentBody: state.drawerCommentBody,
      setDrawerCommentBody: state.setDrawerCommentBody,
      drawerActivityTab: state.drawerActivityTab,
      setDrawerActivityTab: state.setDrawerActivityTab,
      drawerCommentComposerOpen: state.drawerCommentComposerOpen,
      setDrawerCommentComposerOpen: state.setDrawerCommentComposerOpen,
      drawerDevPanel: state.drawerDevPanel,
      setDrawerDevPanel: state.setDrawerDevPanel,
      drawerIsUploadingDescription: state.drawerIsUploadingDescription,
      setDrawerIsUploadingDescription: state.setDrawerIsUploadingDescription,
      drawerIsUploadingComment: state.drawerIsUploadingComment,
      setDrawerIsUploadingComment: state.setDrawerIsUploadingComment,
      drawerIsEditingTitle: state.drawerIsEditingTitle,
      setDrawerIsEditingTitle: state.setDrawerIsEditingTitle,
      drawerDescriptionDirty: state.drawerDescriptionDirty,
      setDrawerDescriptionDirty: state.setDrawerDescriptionDirty,
      drawerIsAutoSaving: state.drawerIsAutoSaving,
      setDrawerIsAutoSaving: state.setDrawerIsAutoSaving,
      drawerEditingCommentId: state.drawerEditingCommentId,
      setDrawerEditingCommentId: state.setDrawerEditingCommentId,
      drawerEditingCommentBody: state.drawerEditingCommentBody,
      setDrawerEditingCommentBody: state.setDrawerEditingCommentBody,
    })),
  );
  const titleEditorRef = useRef(null);
  const devPanelContainerRef = useRef(null);
  const lastSavedPatchRef = useRef("");
  const previousTaskIdRef = useRef(null);
  const [isDevLinksModalOpen, setIsDevLinksModalOpen] = useState(false);
  const [devLinksActiveTab, setDevLinksActiveTab] = useState("branches");

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
            dueDate: normalizeDateForInput(task.dueDate),
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

  useEffect(() => {
    if (!devPanel) return undefined;
    const handleOutsideClick = (event) => {
      if (!devPanelContainerRef.current) return;
      if (!devPanelContainerRef.current.contains(event.target)) {
        setDevPanel(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [devPanel, setDevPanel]);

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
  const formatActivityActor = (item) => {
    if (item?.meta?.performedBy) return String(item.meta.performedBy);
    if (item?.meta?.source === "github_automation") return "Automation rule";
    return item.userName || userMap.get(item.userId) || "Unknown";
  };
  const getActivityDetailHtml = (item) => {
    const action = String(item?.action || "").toLowerCase();
    const detail = String(item?.meta?.detail || "").trim();
    if (!action.startsWith("comment_") || !detail) {
      return "";
    }
    return toDisplayRichText(detail);
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
      dueDate: source.dueDate || null,
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
      dueDate: "Due date",
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
  const branchLinks = Array.isArray(linkedDev.branches) ? linkedDev.branches : [];
  const commitLinks = Array.isArray(linkedDev.commits) ? linkedDev.commits : [];
  const prLinks = Array.isArray(linkedDev.pullRequests)
    ? linkedDev.pullRequests
    : [];
  const repoBuckets = (() => {
    const buckets = new Map();
    const touch = (owner, repo) => {
      const key = `${owner}/${repo}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          owner,
          repo,
          branches: [],
          commits: [],
          pullRequests: [],
        });
      }
      return buckets.get(key);
    };
    branchLinks.forEach((item) => {
      const owner = item.owner || "unknown";
      const repo = item.repo || "unknown";
      touch(owner, repo).branches.push(item);
    });
    commitLinks.forEach((item) => {
      const owner = item.owner || "unknown";
      const repo = item.repo || "unknown";
      touch(owner, repo).commits.push(item);
    });
    prLinks.forEach((item) => {
      const owner = item.owner || "unknown";
      const repo = item.repo || "unknown";
      touch(owner, repo).pullRequests.push(item);
    });
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  })();
  const openDevLinksModal = (tab) => {
    setDevLinksActiveTab(tab);
    setIsDevLinksModalOpen(true);
  };
  const selectedRepoBuckets = repoBuckets.filter((repoBucket) => {
    if (devLinksActiveTab === "branches") return repoBucket.branches.length > 0;
    if (devLinksActiveTab === "commits") return repoBucket.commits.length > 0;
    return repoBucket.pullRequests.length > 0;
  });
  const openCreatePullRequest = (branchItem) => {
    const owner = String(branchItem?.owner || "").trim();
    const repo = String(branchItem?.repo || "").trim();
    const externalId = String(branchItem?.id || "").trim();
    const titleBranch = String(branchItem?.title || "").trim();
    const externalBranch = externalId.includes(":")
      ? externalId.split(":").slice(1).join(":").trim()
      : externalId;
    const branchName = String(titleBranch || externalBranch)
      .trim()
      .replace(/^refs\/heads\//i, "");
    if (!owner || !repo || !branchName) return;
    const defaultBranch = String(branchItem?.defaultBranch || "develop").trim();
    const compareUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branchName)}?expand=1`;
    window.open(compareUrl, "_blank", "noopener,noreferrer");
  };
  const normalizePrStatus = (value) => {
    const status = String(value || "open").trim().toLowerCase();
    if (status === "merged") return "merged";
    if (status === "closed") return "closed";
    return "open";
  };
  const prStatusBadgeClass = (value) => {
    const status = normalizePrStatus(value);
    if (status === "merged") {
      return "border-[#1f845a] bg-[#e3fcef] text-[#216e4e]";
    }
    if (status === "closed") {
      return "border-[#c9372c] bg-[#ffeceb] text-[#ae2e24]";
    }
    return "border-[#0c66e4] bg-[#e9f2ff] text-[#0c66e4]";
  };

  return (
    <div
      className="fixed inset-0 z-[35] grid place-items-center bg-[rgba(9,30,66,0.34)] p-4"
      role="presentation"
      onClick={() => {
        if (isDevLinksModalOpen) return;
        handleClose();
      }}
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
            {!isDevLinksModalOpen ? (
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={handleClose}
              >
                X
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid min-h-0 gap-[0.65rem] overflow-hidden px-4 py-[0.9rem]">
          <div className="grid min-h-0 grid-cols-[minmax(0,1.8fr)_minmax(290px,1fr)] gap-[0.95rem] max-[1100px]:grid-cols-1">
            <section className="grid max-h-full min-h-0 content-start gap-[0.7rem] overflow-auto pr-1">
              <div className="grid gap-[0.55rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.75rem]">
                <div className="flex items-center justify-between">
                  <h4>Description</h4>
                </div>
                <MemoRichTextEditor
                  value={draft.description || ""}
                  placeholder="Add task details, context, and expected outcome."
                  uploading={isUploadingDescription}
                  mentionUsers={mentionUsers}
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
                        <MemoRichTextEditor
                          value={commentBody}
                          placeholder="Add a comment..."
                          uploading={isUploadingComment}
                          mentionUsers={mentionUsers}
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
                            <MemoRichTextEditor
                              value={editingCommentBody}
                              placeholder="Edit comment..."
                              uploading={isUploadingComment}
                              mentionUsers={mentionUsers}
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
                      <div
                        key={item.id}
                        className="grid gap-1 rounded-md border border-[#e5e9f0] bg-[#f9fafc] px-[0.55rem] py-[0.5rem] text-[0.84rem]"
                      >
                        <div className="font-medium text-[#1f3657]">
                          {formatActivityAction(item.action)}
                        </div>
                        <div className="text-[#5e6c84]">
                          {formatActivityActor(item)}{" "}
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
                        {getActivityDetailHtml(item) ? (
                          <div
                            className="mt-1 rounded-md border border-[#dfe1e6] bg-[#fafbfc] p-2 whitespace-pre-wrap [&_a]:break-words [&_a]:text-[#0c66e4] [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-2 [&_a:hover]:text-[#0052cc] [&_ul]:my-[0.3rem] [&_ul]:ml-[1.1rem] [&_ul]:list-disc [&_ol]:my-[0.3rem] [&_ol]:ml-[1.1rem] [&_ol]:list-decimal"
                            dangerouslySetInnerHTML={{
                              __html: getActivityDetailHtml(item),
                            }}
                          />
                        ) : null}
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
                <label className="grid gap-[0.35rem] text-[0.9rem] text-[#253858]">
                  Due date
                  <input
                    className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
                    type="date"
                    value={draft.dueDate || ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        dueDate: event.target.value || null,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="grid gap-[0.6rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.75rem]">
                <h4>Development</h4>
                <div ref={devPanelContainerRef} className="relative grid gap-1">
                  {devPanel === "branch" ? (
                    <div className="absolute bottom-[calc(100%+0.45rem)] left-0 right-0 z-[5]">
                      <div className="grid gap-[0.55rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.65rem] shadow-[0_8px_22px_rgba(9,30,66,0.16)]">
                        <div className="text-[0.74rem] font-bold uppercase tracking-[0.02em] text-[#42526e]">
                          Git create & checkout a new branch
                        </div>
                        <div className="grid grid-cols-[1fr_auto] items-center gap-[0.4rem]">
                          <input
                            className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
                            readOnly
                            value={branchCommand}
                          />
                          <button
                            type="button"
                            className="h-[38px] min-w-[54px] border border-[#d0d7e2] bg-[#f7f8fa] text-[0.8rem] font-semibold text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55]"
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
                      <div className="grid gap-[0.55rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.65rem] shadow-[0_8px_22px_rgba(9,30,66,0.16)]">
                        <div className="grid gap-[0.2rem]">
                          <div className="text-[0.95rem] font-semibold text-[#253858]">
                            Link commits to task work items
                          </div>
                          <div className="text-[0.8rem] text-[#5e6c84]">
                            Include task key in your commit message to link it.
                          </div>
                        </div>
                        <div className="grid gap-[0.25rem]">
                          <div className="text-[0.8rem] font-semibold text-[#42526e]">
                            Copy key
                          </div>
                          <div className="grid grid-cols-[1fr_auto] items-center gap-[0.4rem]">
                            <input
                              className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
                              readOnly
                              value={taskRef}
                            />
                            <button
                              type="button"
                              className="h-[38px] min-w-[54px] border border-[#d0d7e2] bg-[#f7f8fa] text-[0.8rem] font-semibold text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55]"
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
                        </div>
                        <div className="grid gap-[0.25rem]">
                          <div className="text-[0.8rem] font-semibold text-[#42526e]">
                            Copy sample Git commit
                          </div>
                          <div className="grid grid-cols-[1fr_auto] items-center gap-[0.4rem]">
                            <input
                              className="w-full rounded-[8px] border border-[#c9d2e3] bg-white px-[0.55rem] py-[0.45rem] text-[0.9rem] text-[#172b4d]"
                              readOnly
                              value={commitCommand}
                            />
                            <button
                              type="button"
                              className="h-[38px] min-w-[54px] border border-[#d0d7e2] bg-[#f7f8fa] text-[0.8rem] font-semibold text-[#42526e] hover:border-[#a8b3c5] hover:bg-white/65 hover:text-[#2f3d55]"
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
                <div className="grid gap-[0.25rem] border-t border-[#dfe1e6] pt-[0.55rem] text-[0.88rem]">
                  {branchLinks.length ? (
                    <button
                      type="button"
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-left text-[#0c66e4] hover:bg-[#f4f5f7]"
                      onClick={() => openDevLinksModal("branches")}
                    >
                      {branchLinks.length} branches
                    </button>
                  ) : null}
                  {commitLinks.length ? (
                    <button
                      type="button"
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-left text-[#0c66e4] hover:bg-[#f4f5f7]"
                      onClick={() => openDevLinksModal("commits")}
                    >
                      {commitLinks.length} commits
                    </button>
                  ) : null}
                  {prLinks.length ? (
                    <button
                      type="button"
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-left text-[#0c66e4] hover:bg-[#f4f5f7]"
                      onClick={() => openDevLinksModal("pullRequests")}
                    >
                      {prLinks.length} pull requests
                    </button>
                  ) : null}
                  {!branchLinks.length && !commitLinks.length && !prLinks.length ? (
                    <span className="px-2 py-1 text-[#5e6c84]">
                      No linked branches, commits, or pull requests yet.
                    </span>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </aside>
      {isDevLinksModalOpen ? (
        <div
          className="fixed inset-0 z-[45] grid place-items-center bg-[rgba(9,30,66,0.4)] p-4"
          role="presentation"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsDevLinksModalOpen(false);
            }
          }}
        >
          <div
            className="grid max-h-[84vh] w-[min(940px,100%)] gap-[0.7rem] overflow-hidden rounded-xl border border-[#dfe1e6] bg-white p-[0.9rem]"
            role="dialog"
            aria-modal="true"
            aria-label={`Development ${taskRef}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[1.08rem] font-semibold text-[#172b4d]">
                Development {taskRef}
              </h3>
              <button
                type="button"
                className="rounded-md border bg-transparent px-2 py-1 text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => setIsDevLinksModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#dfe1e6] pb-[0.45rem] text-[0.85rem]">
              {[
                { key: "branches", label: "Branches", count: branchLinks.length },
                { key: "commits", label: "Commits", count: commitLinks.length },
                { key: "pullRequests", label: "Pull requests", count: prLinks.length },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`rounded-[6px] px-[0.55rem] py-[0.35rem] ${
                    devLinksActiveTab === tab.key
                      ? "bg-[#e9f2ff] text-[#0c66e4]"
                      : "text-[#42526e] hover:bg-[#f4f5f7]"
                  }`}
                  onClick={() => setDevLinksActiveTab(tab.key)}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
            <div className="grid max-h-[58vh] gap-[0.6rem] overflow-auto pr-1">
              {selectedRepoBuckets.length ? (
                selectedRepoBuckets.map((repoBucket) => (
                  <div
                    key={`modal-${devLinksActiveTab}-${repoBucket.key}`}
                    className="grid gap-[0.45rem] rounded-lg border border-[#e3e8f1] p-[0.6rem]"
                  >
                    <div className="text-[0.9rem] font-semibold text-[#1f3657]">
                      {repoBucket.owner}/{repoBucket.repo}
                    </div>
                    {devLinksActiveTab === "branches" ? (
                      repoBucket.branches.map((item) => (
                        <div
                          key={`modal-branch-${item.id}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[#e5e9f0] bg-[#fbfcff] px-[0.55rem] py-[0.4rem]"
                        >
                          <a
                            href={item.url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-[0.84rem] text-[#0c66e4] underline"
                            title={item.title || item.id}
                          >
                            {item.title || item.id}
                          </a>
                          <button
                            type="button"
                            className="rounded border border-[#d0d7e2] bg-white px-[0.45rem] py-[0.2rem] text-[0.75rem] font-semibold text-[#0c66e4] hover:border-[#b3bfd3] hover:bg-[#f7f8fa]"
                            onClick={() => openCreatePullRequest(item)}
                          >
                            Create pull request
                          </button>
                        </div>
                      ))
                    ) : null}
                    {devLinksActiveTab === "commits" ? (
                      repoBucket.commits.map((item) => (
                        <a
                          key={`modal-commit-${item.id}`}
                          href={item.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate rounded-md border border-[#e5e9f0] bg-[#fbfcff] px-[0.55rem] py-[0.4rem] text-[0.84rem] text-[#0c66e4] underline"
                        >
                          {(item.title || item.id || "").slice(0, 110)}
                        </a>
                      ))
                    ) : null}
                    {devLinksActiveTab === "pullRequests" ? (
                      repoBucket.pullRequests.map((item) => (
                        <div
                          key={`modal-pr-${item.id}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[#e5e9f0] bg-[#fbfcff] px-[0.55rem] py-[0.4rem]"
                        >
                          <a
                            href={item.url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-[0.84rem] text-[#0c66e4] underline"
                            title={item.title || item.id}
                          >
                            {item.title || item.id}
                          </a>
                          <span
                            className={`rounded border px-[0.35rem] py-[0.08rem] text-[0.68rem] font-semibold uppercase tracking-[0.02em] ${prStatusBadgeClass(
                              item.status,
                            )}`}
                          >
                            {normalizePrStatus(item.status)}
                          </span>
                        </div>
                      ))
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-[0.84rem] text-[#5e6c84]">
                  No linked items for this tab.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
