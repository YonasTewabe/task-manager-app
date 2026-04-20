function buildStatusCount(tasks, status) {
  return tasks.filter((task) => task.status === status).length;
}

export default function BacklogView({
  tasks,
  sprints,
  allTasks,
  selectedSprintId,
  onSelectSprint,
  canManage,
  onStartSprint,
  onCompleteSprint,
  onGoToSprintManagement,
}) {
  const tasksBySprint = new Map();
  allTasks.forEach((task) => {
    const key = task.sprintId == null ? "backlog" : String(task.sprintId);
    const list = tasksBySprint.get(key) || [];
    list.push(task);
    tasksBySprint.set(key, list);
  });

  const sprintRows = sprints.map((sprint) => {
    const sprintTaskList = tasksBySprint.get(String(sprint.id)) || [];
    return {
      key: String(sprint.id),
      name: sprint.name,
      status: sprint.status,
      tasks: sprintTaskList,
    };
  });

  const backlogRow = {
    key: "backlog",
    name: "Backlog",
    status: "backlog",
    tasks,
  };

  const rows = [...sprintRows, backlogRow];

  return (
    <section className="panel backlog-page">
      <h2>Backlog</h2>
      <div className="backlog-rows">
        {rows.map((row) => {
          const blocked = buildStatusCount(row.tasks, "blocked");
          const todo = buildStatusCount(row.tasks, "todo");
          const inProgress = buildStatusCount(row.tasks, "in_progress");
          const done = buildStatusCount(row.tasks, "done");
          const isSelected =
            row.key === "backlog"
              ? !selectedSprintId
              : String(selectedSprintId) === row.key;
          return (
            <article
              key={row.key}
              className={`backlog-row-card ${isSelected ? "active" : ""}`}
              onClick={() => onSelectSprint(row.key === "backlog" ? "" : row.key)}
            >
              <div className="backlog-row-main">
                <strong>{row.name}</strong>
                <span className="muted">({row.tasks.length} work items)</span>
              </div>
              <div className="backlog-row-right">
                <div className="status-counters">
                  <span className="counter blocked">{blocked}</span>
                  <span className="counter todo">{todo + inProgress}</span>
                  <span className="counter done">{done}</span>
                </div>
                {row.status === "active" && canManage ? (
                  <button type="button" onClick={(event) => { event.stopPropagation(); onCompleteSprint(row.key); }}>
                    Complete sprint
                  </button>
                ) : null}
                {row.status === "planned" && canManage ? (
                  <button type="button" onClick={(event) => { event.stopPropagation(); onStartSprint(row.key); }}>
                    Start sprint
                  </button>
                ) : null}
                {row.status === "backlog" && canManage ? (
                  <button type="button" className="ghost-btn" onClick={(event) => { event.stopPropagation(); onGoToSprintManagement(); }}>
                    Create sprint
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
