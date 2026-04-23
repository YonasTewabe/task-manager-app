import { useMemo } from "react";
import { DEFAULT_WORKFLOW_STAGES } from "../workflowDefaults.js";
import { displayTaskRef } from "../utils/taskDisplay.js";

function toInitials(name) {
  return String(name || "")
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatStatusLabel(status) {
  const text = String(status || "").trim();
  if (!text) return "Unknown";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function DashboardView({
  currentUser,
  projects,
  assignedTasks,
  projectById,
  workflowStages, // used to derive status buckets
  onOpenProject,
  onOpenTask,
}) {
  const stageMeta = useMemo(() => {
    const stages = workflowStages?.length
      ? workflowStages
      : DEFAULT_WORKFLOW_STAGES;
    const map = new Map();
    stages.forEach((s) =>
      map.set(s.key, {
        label: s.name,
        bucket:
          s.counterGroup === "active"
            ? "active"
            : s.counterGroup === "done"
              ? "done"
              : "upcoming",
      }),
    );
    return map;
  }, [workflowStages]);

  const sortedTasks = useMemo(() => {
    const list = [...(assignedTasks || [])];
    list.sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );
    return list;
  }, [assignedTasks]);

  const assignedByBucket = useMemo(() => {
    const counts = { upcoming: 0, active: 0, done: 0 };
    sortedTasks.forEach((task) => {
      const bucket = stageMeta.get(task.status)?.bucket || "upcoming";
      counts[bucket] += 1;
    });
    return counts;
  }, [sortedTasks, stageMeta]);
  const projectCards = useMemo(() => {
    const counts = new Map();
    sortedTasks.forEach((task) => {
      const key = String(task.projectId || "");
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return projects.map((project) => {
      const key = String(project.id || "");
      return {
        ...project,
        assignedCount: counts.get(key) || 0,
      };
    });
  }, [projects, sortedTasks]);
  const greetingName = useMemo(
    () => String(currentUser?.name || "there").split(" ")[0] || "there",
    [currentUser?.name],
  );
  const recentTasks = useMemo(() => sortedTasks.slice(0, 8), [sortedTasks]);

  return (
    <section className="grid gap-4 px-[0.2rem] pb-[0.9rem] pt-[0.2rem]">
      <header className="grid gap-[0.95rem] rounded-[14px] border border-[#dbe5f6] p-[1rem_1.05rem] shadow-[0_8px_24px_rgba(14,35,78,0.08)]">
        <div className="grid gap-[0.2rem]">
          <h3 className="m-0 text-[1.84rem] font-bold leading-[1.2] text-[#123b88]">
            Welcome back, {greetingName}.
          </h3>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-[0.9rem] max-[1100px]:grid-cols-1">
        <section className="grid gap-[0.7rem] overflow-hidden rounded-[12px] border border-[#e5eaf3] bg-white shadow-[0_5px_14px_rgba(9,30,66,0.07)]">
          <h3 className="m-0 border-b border-[#edf1f7] px-[0.95rem] py-[0.72rem] text-[1rem] font-bold text-[#184aa9]">My Projects</h3>
          {projectCards.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-[0.75rem] px-[0.95rem] pb-[0.95rem] pt-[0.75rem]">
              {projectCards.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="flex items-center gap-[0.65rem] rounded-[8px] border border-[#dfe1e6] !bg-white p-[0.65rem] text-left hover:!border-[#c1c7d0] hover:!bg-[#f4f6fa] focus-visible:!bg-[#f4f6fa] active:!bg-[#f4f6fa]"
                  onClick={() => onOpenProject(project.id)}
                >
                  <span className="inline-flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[8px] bg-[linear-gradient(135deg,#1d4ed8,#0ea5e9)] text-[0.72rem] font-bold text-white">
                    {toInitials(project.projectKey || project.name)}
                  </span>
                  <span className="grid min-w-0">
                    <strong className="truncate whitespace-nowrap text-[0.9rem] text-gray-800">
                      {project.name}
                    </strong>
                    <span className="text-[#5e6c84]">
                      {project.projectKey || "No code"} ·{" "}
                      {project.assignedCount} assigned
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-[0.9rem] pb-[0.9rem] pt-[0.7rem] text-[#5e6c84]">
              You are not assigned to any projects yet.
            </p>
          )}
        </section>

        <section className="grid gap-[0.7rem] overflow-hidden rounded-[12px] border border-[#e5eaf3] bg-white shadow-[0_5px_14px_rgba(9,30,66,0.07)]">
          <h3 className="m-0 border-b border-[#edf1f7] px-[0.95rem] py-[0.72rem] text-[1rem] font-bold text-[#184aa9]">
            My Work in a Snapshot
          </h3>
          <div className="grid gap-[0.5rem] px-[0.95rem] pb-[0.95rem] pt-[0.75rem]">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-[0.45rem] rounded-[8px] border border-[#dfe1e6] bg-transparent px-[0.6rem] py-[0.45rem]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#dc2626]" />
              <span className="text-[0.85rem] text-[#42526e]">Not started</span>
              <strong>{assignedByBucket.upcoming}</strong>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-[0.45rem] rounded-[8px] border border-[#dfe1e6] bg-transparent px-[0.6rem] py-[0.45rem]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#0b6bcb]" />
              <span className="text-[0.85rem] text-[#42526e]">In progress</span>
              <strong>{assignedByBucket.active}</strong>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-[0.45rem] rounded-[8px] border border-[#dfe1e6] bg-transparent px-[0.6rem] py-[0.45rem]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#15803d]" />
              <span className="text-[0.85rem] text-[#42526e]">Done</span>
              <strong>{assignedByBucket.done}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[12px] border border-[#e5eaf3] bg-white shadow-[0_5px_14px_rgba(9,30,66,0.07)]">
        <h3 className="m-0 border-b border-[#edf1f7] px-[0.95rem] py-[0.72rem] text-[1rem] font-bold text-[#184aa9]">Assigned to me</h3>
        {recentTasks.length ? (
          <div className="grid gap-[0.55rem] px-[0.95rem] pb-[0.95rem] pt-[0.75rem]">
            {recentTasks.map((task) => {
              const proj = task.projectId
                ? projectById.get(String(task.projectId))
                : null;
              const statusText =
                stageMeta.get(task.status)?.label || formatStatusLabel(task.status);
              const typeText =
                String(task.type).charAt(0).toUpperCase() + String(task.type).slice(1);
              return (
                <button
                  key={task.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-[0.65rem] rounded-[10px] border border-[#e9eef7] !bg-white px-[0.8rem] py-[0.66rem] text-left transition-[border-color,box-shadow,background-color,transform] duration-150 hover:-translate-y-px hover:!border-[#d5e3fb] hover:!bg-[#f4f6fa] focus-visible:!bg-[#f4f6fa] active:!bg-[#f4f6fa] hover:shadow-[0_5px_12px_rgba(24,74,169,0.1)]"
                  onClick={() => onOpenTask(task.id)}
                >
                  <div className="grid min-w-0 gap-[0.15rem]">
                    <span className="truncate whitespace-nowrap text-[0.98rem] font-bold leading-[1.3] text-gray-800">
                      {task.title}
                    </span>
                    <span className="truncate whitespace-nowrap text-[0.84rem] leading-[1.25] text-gray-500">
                      {typeText} · {displayTaskRef(task)} ·{" "}
                      {proj?.name}
                    </span>
                  </div>
                  <span className="whitespace-nowrap rounded-full border border-[#d4e3ff] bg-[#ecf3ff] px-[0.5rem] py-[0.18rem] text-[0.69rem] font-bold text-[#1e40af]">
                    {statusText.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-[0.95rem] pb-[0.95rem] pt-[0.75rem] text-[#5e6c84]">No tasks assigned to you yet</p>
        )}
      </section>
    </section>
  );
}
