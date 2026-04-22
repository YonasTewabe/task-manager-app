import { useMemo, useState } from "react";
import { displayTaskRef } from "../utils/taskDisplay.js";
import Modal from "./ui/Modal";

export default function SprintManagementView({
  sprints,
  selectedSprintId,
  usersById,
  sprintTasks,
  backlogTasks,
  onSelectSprint,
  onCreateSprint,
  onUpdateSprint,
  onStartSprint,
  onCompleteSprint,
  onAddTasksToSprint,
  onRemoveTaskFromSprint,
}) {
  const [createDraft, setCreateDraft] = useState({
    name: "",
    startDate: "",
    endDate: "",
  });
  const [editDraft, setEditDraft] = useState({
    name: "",
    startDate: "",
    endDate: "",
    status: "planned",
  });
  const [editingSprintId, setEditingSprintId] = useState(null);
  const [selectedBacklogTaskIds, setSelectedBacklogTaskIds] = useState([]);
  const [isDropActive, setIsDropActive] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const selectedSprint = useMemo(
    () => sprints.find((s) => String(s.id) === String(selectedSprintId)) || null,
    [sprints, selectedSprintId],
  );

  const toggleBacklogTask = (taskId) => {
    setSelectedBacklogTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  };

  const handleBacklogTaskDragStart = (event, taskId) => {
    event.dataTransfer.setData("text/task-id", String(taskId));
    event.dataTransfer.effectAllowed = "move";
  };

  const handleSprintDrop = (event) => {
    event.preventDefault();
    setIsDropActive(false);
    if (!selectedSprint) return;

    const taskId = String(event.dataTransfer.getData("text/task-id") || "").trim();
    if (!taskId) return;
    onAddTasksToSprint(selectedSprint.id, [taskId]);
  };

  return (
    <section className="grid gap-[0.9rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]">
      <div className="flex items-center justify-between gap-3">
        <h2>Sprint Management</h2>
        <button type="button" onClick={() => setShowCreateModal(true)}>
          Add Sprint
        </button>
      </div>

      <label>
        Select target sprint (for planning)
        <select value={selectedSprintId || ""} onChange={(e) => onSelectSprint(e.target.value)}>
          <option value="">Backlog (default)</option>
          {sprints.map((sprint) => (
            <option key={sprint.id} value={sprint.id}>
              {sprint.name} ({sprint.status})
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-[0.6rem]">
        <h3>Backlog</h3>
        <div className="grid max-h-[230px] gap-[0.45rem] overflow-auto rounded-lg border border-[#dfe1e6] p-[0.55rem]">
          {backlogTasks.map((task) => (
            <label key={task.id} className="flex items-center gap-[0.35rem] text-[0.85rem]">
              <input
                type="checkbox"
                checked={selectedBacklogTaskIds.includes(task.id)}
                onChange={() => toggleBacklogTask(task.id)}
              />
              <span
                draggable
                onDragStart={(event) => handleBacklogTaskDragStart(event, task.id)}
              >
                {task.title} · SP{" "}
                {task.storyPoints == null || task.storyPoints === ""
                  ? "-"
                  : task.storyPoints}{" "}
                · {usersById.get(task.assigneeId) || "Unassigned"}
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedSprint || !selectedBacklogTaskIds.length}
          onClick={() => {
            if (!selectedSprint || !selectedBacklogTaskIds.length) return;
            onAddTasksToSprint(selectedSprint.id, selectedBacklogTaskIds);
            setSelectedBacklogTaskIds([]);
          }}
        >
          {selectedSprint ? "Add Selected Tasks to Selected Sprint" : "Select a sprint to add tasks"}
        </button>
      </div>

      {selectedSprint ? (
        <div className="grid gap-[0.6rem]">
          <h3>Selected Sprint ({selectedSprint.status})</h3>
          {selectedSprint.status === "planned" ? (
            <p className="text-[#5e6c84]">This is a future sprint. You can assign tasks now and start it later.</p>
          ) : null}
          {editingSprintId === selectedSprint.id ? (
            <>
              <input
                value={editDraft.name}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  value={editDraft.startDate || ""}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, startDate: e.target.value }))}
                />
                <input
                  type="date"
                  value={editDraft.endDate || ""}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <select
                value={editDraft.status}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="planned">planned</option>
                <option value="active">active</option>
                <option value="completed">completed</option>
              </select>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSprint(selectedSprint.id, editDraft);
                    setEditingSprintId(null);
                  }}
                >
                  Save
                </button>
                <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={() => setEditingSprintId(null)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[#5e6c84]">
                {selectedSprint.startDate || "No start"} - {selectedSprint.endDate || "No end"}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSprintId(selectedSprint.id);
                    setEditDraft({
                      name: selectedSprint.name,
                      startDate: selectedSprint.startDate || "",
                      endDate: selectedSprint.endDate || "",
                      status: selectedSprint.status || "planned",
                    });
                  }}
                >
                  Edit Sprint
                </button>
                <button type="button" onClick={() => onStartSprint(selectedSprint.id)}>
                  Start Sprint
                </button>
                <button type="button" onClick={() => onCompleteSprint(selectedSprint.id)}>
                  Complete Sprint
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {selectedSprint ? (
        <div className="grid gap-[0.6rem]">
          <h3>Sprint Tasks</h3>
          <div
            className={`grid max-h-[230px] gap-[0.45rem] overflow-auto rounded-lg border border-[#dfe1e6] p-[0.55rem] transition-[border-color,background-color] duration-100 ${isDropActive ? "border-[#2f6feb] bg-[#eef4ff]" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDropActive(true);
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDropActive(true);
            }}
            onDragLeave={(event) => {
              const next = event.relatedTarget;
              if (next && event.currentTarget.contains(next)) return;
              setIsDropActive(false);
            }}
            onDrop={handleSprintDrop}
          >
            <div className="mb-[0.35rem] text-[0.8rem] text-[#5e6c84]">Drag a backlog task here to add it to this sprint</div>
            {sprintTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-[0.7rem] rounded-md border border-[#e6e9ee] bg-white px-[0.5rem] py-[0.45rem]">
                <span>
                  {displayTaskRef(task)} · {task.title} · SP{" "}
                  {task.storyPoints == null || task.storyPoints === ""
                    ? "-"
                    : task.storyPoints}{" "}
                  ·{" "}
                  {usersById.get(task.assigneeId) || "Unassigned"}
                </span>
                <button type="button" onClick={() => onRemoveTaskFromSprint(selectedSprint.id, task.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {showCreateModal ? (
        <Modal open={showCreateModal} onOpenChange={setShowCreateModal}>
            <div className="flex items-center justify-between gap-3">
              <h3>Create Sprint</h3>
              <button type="button" className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]" onClick={() => setShowCreateModal(false)}>
                X
              </button>
            </div>
            <div className="grid gap-[0.6rem]">
              <label>
                <span className="inline-flex items-center">
                  Sprint Name <span className="ml-1 text-red-600">*</span>
                </span>
                <input
                  placeholder="Enter sprint name"
                  value={createDraft.name}
                  onChange={(e) => setCreateDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <label>
                  Start date
                  <input
                    type="date"
                    value={createDraft.startDate}
                    onChange={(e) => setCreateDraft((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={createDraft.endDate}
                    onChange={(e) => setCreateDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!createDraft.name.trim()) return;
                    onCreateSprint(createDraft);
                    setCreateDraft({ name: "", startDate: "", endDate: "" });
                    setShowCreateModal(false);
                  }}
                >
                  Create Sprint
                </button>
              </div>
            </div>
        </Modal>
      ) : null}
    </section>
  );
}
