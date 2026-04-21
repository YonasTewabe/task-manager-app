import { displayTaskRef } from "../utils/taskDisplay.js";

function TaskCard({ task, userName, workflowStages, onMove, onOpen }) {
  const dragStart = (event) => {
    event.dataTransfer.setData("text/task-id", String(task.id));
  };

  const initials = (userName || "U")
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div draggable className="board-card" onDragStart={dragStart} onClick={() => onOpen(task.id)}>
      <div className="board-card-topline">
        {task.label ? <span className="board-tag">{task.label}</span> : <span className="board-tag muted">Task</span>}
        <span className={`priority-dot priority-${task.priority || "medium"}`} />
      </div>
      <div className="card-title">{task.title}</div>
      <div className="board-card-meta">
        <span>{displayTaskRef(task)}</span>
        <span>SP {task.storyPoints}</span>
      </div>
      <div className="board-card-footer">
        <select
          value={task.status}
          className="mini-select"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            onMove(task.id, event.target.value);
          }}
        >
          {(workflowStages || []).map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="avatar-bubble" title={userName || "Unassigned"}>
          {initials}
        </span>
      </div>
    </div>
  );
}

export default function BoardView({ columns, workflowStages, usersById, onMove, onOpenTask }) {
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
              {column.badge ? <span className="board-stage-badge">{column.badge}</span> : null}
              <span className="board-column-count">{column.tasks.length}</span>
            </div>
          </header>
          <div className="board-cards">
            {column.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                workflowStages={workflowStages}
                userName={usersById.get(task.assigneeId)}
                onMove={onMove}
                onOpen={onOpenTask}
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
