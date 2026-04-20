import { useMemo, useState } from "react";

export default function TaskDrawer({
  taskBundle,
  users,
  onClose,
  onSaveTask,
  onAddComment,
}) {
  const task = taskBundle?.task;
  const [draft, setDraft] = useState(task || null);
  const [commentBody, setCommentBody] = useState("");

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((user) => map.set(user.id, user.name));
    return map;
  }, [users]);

  if (!task || !draft) return null;

  const submitPatch = () => {
    onSaveTask(task.id, {
      title: draft.title,
      description: draft.description,
      label: draft.label || "",
      status: draft.status,
      storyPoints: Number(draft.storyPoints),
      assigneeId: draft.assigneeId ? Number(draft.assigneeId) : null,
      priority: draft.priority,
      type: draft.type,
    });
  };

  return (
    <aside className="task-drawer">
      <div className="task-drawer-head">
        <h3>{task.title}</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="task-drawer-body">
        <label>
          Title
          <input
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={draft.description || ""}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </label>
        <label>
          Label
          <input
            value={draft.label || ""}
            onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
          />
        </label>
        <label>
          Status
          <select
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="blocked">blocked</option>
            <option value="todo">todo</option>
            <option value="in_progress">in_progress</option>
            <option value="done">done</option>
          </select>
        </label>
        <label>
          Story points
          <input
            type="number"
            min="1"
            max="21"
            value={draft.storyPoints}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, storyPoints: Number(event.target.value) }))
            }
          />
        </label>
        <label>
          Assignee
          <select
            value={draft.assigneeId || ""}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, assigneeId: event.target.value || null }))
            }
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={submitPatch}>
          Save changes
        </button>

        <section className="comments-section">
          <h4>Comments</h4>
          <div className="comments-list">
            {(taskBundle.comments || []).map((comment) => (
              <article key={comment.id} className="comment">
                <div className="comment-author">
                  {comment.userName || userMap.get(comment.userId) || "Unknown"}
                </div>
                <div>{comment.body}</div>
              </article>
            ))}
          </div>
          <textarea
            rows={3}
            value={commentBody}
            placeholder="Add a comment"
            onChange={(event) => setCommentBody(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              if (!commentBody.trim()) return;
              onAddComment(task.id, commentBody.trim());
              setCommentBody("");
            }}
          >
            Add comment
          </button>
        </section>
      </div>
    </aside>
  );
}
