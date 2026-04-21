import { displayTaskRef } from "../utils/taskDisplay.js";
import { UNASSIGNED_AVATAR_SRC } from "../constants/unassignedAvatar.js";
import { getPriorityMeta } from "../constants/priorities.js";
import { getWorkTypeMeta } from "../constants/workTypes.js";

function TaskCard({
  task,
  userName,
  userAvatarColor,
  onOpen,
}) {
  const dragStart = (event) => {
    event.dataTransfer.setData("text/task-id", String(task.id));
  };

  const isUnassigned = !task.assigneeId || !userName;
  const priorityMeta = getPriorityMeta(task.priority);
  const workTypeMeta = getWorkTypeMeta(task.type);
  const initials = (userName || "U")
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div draggable className="board-card" onDragStart={dragStart} onClick={() => onOpen(task.id)}>
      <div className="card-title">{task.title}</div>
      <div className="board-card-meta board-card-row">
        <span className="meta-left">
          <span className="meta-tag">{workTypeMeta.label}</span>
          <span>{displayTaskRef(task)}</span>
        </span>
        <span className="meta-right">
          <span className="sp-chip">
            {task.storyPoints == null || task.storyPoints === "" ? "-" : task.storyPoints}
          </span>
          <span
            className={`priority-sign priority-sign-${priorityMeta?.tone || "medium"}`}
            title={priorityMeta?.label || "Medium"}
          >
            {priorityMeta?.label || "Medium"}
          </span>
        </span>
        <span
          className="avatar-bubble"
          title={userName || "Unassigned"}
          style={
            isUnassigned ? undefined : { backgroundColor: userAvatarColor(task.assigneeId) }
          }
        >
          {isUnassigned ? (
            <img className="avatar-icon" src={UNASSIGNED_AVATAR_SRC} alt="" aria-hidden="true" />
          ) : (
            initials
          )}
        </span>
      </div>
    </div>
  );
}

export default function BoardView({
  columns,
  usersById,
  userAvatarColor,
  boardTotalsByStatus = {},
  assigneeFilterActive = false,
  onMove,
  onOpenTask,
}) {
  return (
    <section className="board-lanes">
      {columns.map((column) => (
        <article
          key={column.status}
          className="board-column"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const taskId = String(event.dataTransfer.getData("text/task-id") || "").trim();
            if (taskId) onMove(taskId, column.status);
          }}
        >
          <header className="board-column-head">
            <div className="board-column-title-row">
              <h3>{column.name || column.status}</h3>
              <span className="board-column-count">
                {assigneeFilterActive
                  ? `${column.tasks.length}/${boardTotalsByStatus[column.status] ?? column.tasks.length}`
                  : column.tasks.length}
              </span>
            </div>
          </header>
          <div className="board-cards">
            {column.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                userName={usersById.get(task.assigneeId)}
                userAvatarColor={userAvatarColor}
                onOpen={onOpenTask}
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
