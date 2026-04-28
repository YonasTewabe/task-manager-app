import {
  addTaskActivity,
  addTaskComment,
  canUserMoveTask,
  createTask,
  deleteTask,
  deleteTaskComment,
  getProjectSettings,
  getTaskActivity,
  getTaskById,
  getTaskComments,
  getTaskLinkedDev,
  isValidWorkflowStatus,
  updateTask,
  updateTaskComment,
} from "../services/taskService.js";
import type { Request, Response } from "express";
import { resolveMentionedUserIds } from "../utils/mentionParser.js";
import { createAndDispatchNotifications } from "../services/notificationService.js";
import { isNonEmptyString } from "../utils/validation.js";
import { asObjectRecord, asString } from "../utils/guards.js";

const TRACKED_TASK_FIELDS = [
  "title",
  "description",
  "status",
  "storyPoints",
  "dueDate",
  "priority",
  "type",
  "version",
  "assigneeId",
  "label",
];

function normalizeAcceptanceCriteria(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const text = String(item?.text || "").trim();
      if (!text) return null;
      const id = String(item?.id || "").trim() || `ac-${index}-${text}`;
      return { id, text, done: item?.done === true };
    })
    .filter(Boolean);
}

function buildAcceptanceCriteriaChanges(beforeTask, afterTask) {
  const before = normalizeAcceptanceCriteria(beforeTask?.acceptanceCriteria);
  const after = normalizeAcceptanceCriteria(afterTask?.acceptanceCriteria);
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  const changes = [];
  after.forEach((item) => {
    const prev = beforeById.get(item.id);
    if (!prev) {
      changes.push({
        field: "acceptanceCriteria",
        from: "None",
        to: `Added: ${item.text}`,
      });
      return;
    }
    if (prev.done !== item.done) {
      changes.push({
        field: "acceptanceCriteria",
        from: `${prev.done ? "[x]" : "[ ]"} ${prev.text}`,
        to: `${item.done ? "[x]" : "[ ]"} ${item.text}`,
      });
    }
  });
  before.forEach((item) => {
    if (!afterById.has(item.id)) {
      changes.push({
        field: "acceptanceCriteria",
        from: `Removed: ${item.text}`,
        to: "None",
      });
    }
  });
  return changes;
}

function normalizeFieldValue(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

function buildTaskChanges(beforeTask, afterTask) {
  const changes = TRACKED_TASK_FIELDS.reduce((acc, field) => {
    const from = normalizeFieldValue(beforeTask?.[field]);
    const to = normalizeFieldValue(afterTask?.[field]);
    if (from === to) return acc;
    acc.push({ field, from, to });
    return acc;
  }, []);
  return [...changes, ...buildAcceptanceCriteriaChanges(beforeTask, afterTask)];
}

function taskNotificationMeta(task: any, extra: Record<string, any> = {}) {
  return {
    project_id: task?.projectId || null,
    task_id: task?.id || null,
    entity_type: "task",
    target_view: "board",
    ...extra,
  };
}

function resolveCreateTaskStatus(rawStatus, settings) {
  const requested = String(rawStatus || "").trim();
  const candidates = requested ? [requested] : ["to_do", "todo"];
  if (requested === "to_do") candidates.push("todo");
  if (requested === "todo") candidates.push("to_do");
  for (const candidate of [...new Set(candidates)]) {
    if (isValidWorkflowStatus(candidate, settings)) return candidate;
  }
  return "";
}

export async function createTaskHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  const title = asString(body.title);
  const projectId = asString(body.projectId);
  if (!title || !projectId) {
    return res.status(400).json({ error: "title and projectId are required" });
  }
  const settings = await getProjectSettings(projectId);
  const nextStatus = resolveCreateTaskStatus(body.status, settings);
  if (!nextStatus) return res.status(400).json({ error: "Invalid status" });
  body.status = nextStatus;
  const created = await createTask(body || {}, req.user.id);
  await addTaskActivity(created.id, req.user.id, "task_created", { title: created.title });
  if (created.assigneeId) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: [created.assigneeId],
      type: "task_assigned",
      title: `Assigned: ${created.title}`,
      body: `${req.user.name} assigned you a task.`,
      entityType: "task",
      entityId: created.id,
      metadata: taskNotificationMeta(created),
    });
  }
  return res.status(201).json(created);
}

export async function getTaskBundleHandler(req: Request, res: Response) {
  const task = await getTaskById(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const [comments, activity, linkedDev] = await Promise.all([
    getTaskComments(req.params.taskId),
    getTaskActivity(req.params.taskId),
    getTaskLinkedDev(req.params.taskId),
  ]);
  return res.json({ task, comments, activity, linkedDev });
}

export async function patchTaskHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  const current = await getTaskById(req.params.taskId);
  if (!current) return res.status(404).json({ error: "Task not found" });
  if (body.status !== undefined) {
    const allowed = await canUserMoveTask(current, body.status, req.user);
    if (!allowed) {
      return res.status(403).json({ error: "You are not allowed to move tasks to that stage" });
    }
  }
  let updated;
  try {
    updated = await updateTask(req.params.taskId, body || {});
  } catch (error) {
    if (error?.code === "TASK_CONFLICT") {
      return res.status(409).json({ error: error.message });
    }
    throw error;
  }
  if (!updated) return res.status(400).json({ error: "No valid fields provided" });
  const changes = buildTaskChanges(current, updated);
  if (changes.length) {
    await addTaskActivity(updated.id, req.user.id, "task_updated", { changes });
    if (updated.assigneeId) {
      await createAndDispatchNotifications({
        actorUserId: req.user.id,
        recipientUserIds: [updated.assigneeId],
        type: "task_updated",
        title: `Task updated: ${updated.title}`,
        body: `${req.user.name} updated a task assigned to you.`,
        entityType: "task",
        entityId: updated.id,
        metadata: taskNotificationMeta(updated, { changes }),
        dedupeKey: `task-update:${updated.id}:${updated.updatedAt}`,
      });
    }
    const assigneeChange = changes.find((change) => change.field === "assigneeId");
    if (assigneeChange?.to) {
      await createAndDispatchNotifications({
        actorUserId: req.user.id,
        recipientUserIds: [assigneeChange.to],
        type: "task_assigned",
        title: `Assigned: ${updated.title}`,
        body: `${req.user.name} assigned you this task.`,
        entityType: "task",
        entityId: updated.id,
        metadata: taskNotificationMeta(updated),
        dedupeKey: `task-assigned:${updated.id}:${assigneeChange.to}:${updated.updatedAt}`,
      });
    }
    if (body.description !== undefined) {
      const mentionedUserIds = await resolveMentionedUserIds(
        asString(body.description),
        {
        excludeUserId: req.user.id,
        projectId: updated.projectId,
        },
      );
      if (mentionedUserIds.length) {
        await createAndDispatchNotifications({
          actorUserId: req.user.id,
          recipientUserIds: mentionedUserIds,
          type: "mention_description",
          title: `Mentioned in ${updated.title}`,
          body: `${req.user.name} mentioned you in a task description.`,
          entityType: "task",
          entityId: updated.id,
          metadata: taskNotificationMeta(updated, { source: "description" }),
          dedupeKey: `mention-description:${updated.id}:${updated.updatedAt}`,
        });
      }
    }
  }
  return res.json(updated);
}

export async function moveTaskHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  const nextStatus = asString(body.status);
  const current = await getTaskById(req.params.taskId);
  if (!current) return res.status(404).json({ error: "Task not found" });
  const settings = await getProjectSettings(current.projectId);
  if (!nextStatus || !isValidWorkflowStatus(nextStatus, settings)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const allowed = await canUserMoveTask(current, nextStatus, req.user);
  if (!allowed) {
    return res.status(403).json({ error: "You are not allowed to move tasks to that stage" });
  }
  const updated = await updateTask(req.params.taskId, { status: nextStatus });
  await addTaskActivity(updated.id, req.user.id, "task_moved", {
    from: current.status,
    to: updated.status,
  });
  if (updated.assigneeId) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: [updated.assigneeId],
      type: "task_updated",
      title: `Task updated: ${updated.title}`,
      body: `${req.user.name} updated task status (${current.status} -> ${updated.status}).`,
      entityType: "task",
      entityId: updated.id,
      metadata: taskNotificationMeta(updated, {
        changes: [{ field: "status", from: current.status, to: updated.status }],
      }),
      dedupeKey: `task-move:${updated.id}:${updated.updatedAt}`,
    });
  }
  return res.json(updated);
}

export async function deleteTaskHandler(req: Request, res: Response) {
  const deleted = await deleteTask(req.params.taskId);
  if (!deleted) return res.status(404).json({ error: "Task not found" });
  return res.status(204).send();
}

export async function addCommentHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  if (!isNonEmptyString(body.body)) {
    return res.status(400).json({ error: "Comment body is required" });
  }
  const task = await getTaskById(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const comment = await addTaskComment(
    req.params.taskId,
    req.user.id,
    asString(body.body).trim(),
  );
  await addTaskActivity(req.params.taskId, req.user.id, "comment_added", {
    detail: comment.body,
  });
  if (task.assigneeId) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: [task.assigneeId],
      type: "task_comment_added",
      title: `New comment on ${task.title}`,
      body: `${req.user.name} commented on an assigned task.`,
      entityType: "task",
      entityId: task.id,
      metadata: taskNotificationMeta(task, {
        source: "comment",
        target_comment_id: comment.id,
      }),
    });
  }
  const mentionedUserIds = await resolveMentionedUserIds(asString(body.body).trim(), {
    excludeUserId: req.user.id,
    projectId: task.projectId,
  });
  if (mentionedUserIds.length) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: mentionedUserIds,
      type: "mention_comment",
      title: `Mentioned in ${task.title}`,
      body: `${req.user.name} mentioned you in a comment.`,
      entityType: "task",
      entityId: task.id,
      metadata: taskNotificationMeta(task, {
        source: "comment",
        target_comment_id: comment.id,
      }),
      dedupeKey: `mention-comment:${comment.id}`,
    });
  }
  return res.status(201).json(comment);
}

export async function updateCommentHandler(req: Request, res: Response) {
  const body = asObjectRecord(req.body);
  if (!isNonEmptyString(body.body)) {
    return res.status(400).json({ error: "Comment body is required" });
  }
  const task = await getTaskById(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const updated = await updateTaskComment(
    req.params.taskId,
    req.params.commentId,
    req.user.id,
    asString(body.body).trim(),
  );
  if (!updated) {
    return res.status(404).json({ error: "Comment not found or not owned by user" });
  }
  await addTaskActivity(req.params.taskId, req.user.id, "comment_updated", {
    detail: updated.body,
  });
  const mentionedUserIds = await resolveMentionedUserIds(asString(body.body).trim(), {
    excludeUserId: req.user.id,
    projectId: task.projectId,
  });
  if (mentionedUserIds.length) {
    await createAndDispatchNotifications({
      actorUserId: req.user.id,
      recipientUserIds: mentionedUserIds,
      type: "mention_comment",
      title: `Mentioned in ${task.title}`,
      body: `${req.user.name} mentioned you in a comment.`,
      entityType: "task",
      entityId: task.id,
      metadata: taskNotificationMeta(task, {
        source: "comment",
        target_comment_id: updated.id,
      }),
      dedupeKey: `mention-comment:${updated.id}:updated`,
    });
  }
  return res.json(updated);
}

export async function deleteCommentHandler(req: Request, res: Response) {
  const task = await getTaskById(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const deleted = await deleteTaskComment(
    req.params.taskId,
    req.params.commentId,
    req.user.id,
  );
  if (!deleted) {
    return res.status(404).json({ error: "Comment not found or not owned by user" });
  }
  await addTaskActivity(req.params.taskId, req.user.id, "comment_deleted", {});
  return res.status(204).send();
}

