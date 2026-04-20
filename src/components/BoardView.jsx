const STATUS_TITLES = {
  blocked: "Blocked",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

function TaskCard({ task, userName, onMove, onOpen }) {
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
        <span>TM-{task.id}</span>
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
          <option value="blocked">Blocked</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <span className="avatar-bubble" title={userName || "Unassigned"}>
          {initials}
        </span>
      </div>
    </div>
  );
}

export default function BoardView({ columns, usersById, onMove, onOpenTask }) {
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
            <h3>{STATUS_TITLES[column.status] || column.status.replace("_", " ").toUpperCase()}</h3>
            <span>{column.tasks.length}</span>
          </header>
          <div className="board-cards">
            {column.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
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
