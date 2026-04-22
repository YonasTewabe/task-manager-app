export default function SprintPanel({
  sprints,
  selectedSprintId,
  onSelectSprint,
  onStartSprint,
  onCompleteSprint,
  canManage,
}) {
  const selectedSprint = sprints.find((s) => String(s.id) === String(selectedSprintId));

  return (
    <section className="grid gap-2 rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]">
      <h2>Sprints</h2>
      <label>
        Active sprint
        <select value={selectedSprintId || ""} onChange={(event) => onSelectSprint(event.target.value)}>
          <option value="">Backlog</option>
          {sprints.map((sprint) => (
            <option key={sprint.id} value={sprint.id}>
              {sprint.name} ({sprint.status})
            </option>
          ))}
        </select>
      </label>

      {canManage ? (
        <>
          {selectedSprint ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onStartSprint(selectedSprint.id)}>
                Start sprint
              </button>
              <button type="button" onClick={() => onCompleteSprint(selectedSprint.id)}>
                Complete sprint
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
