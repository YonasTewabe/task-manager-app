import { useEffect, useMemo, useRef, useState } from "react";

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function formatPercent(value) {
  const number = Number(value || 0);
  return `${number.toFixed(1)}%`;
}

function getDefaultDateRange(sprints = []) {
  void sprints;
  return {
    from: "",
    to: "",
  };
}

function StatCard({ label, value, sublabel = "" }) {
  return (
    <div className="rounded-[12px] border border-[#d8e2ef] bg-white p-[0.9rem] shadow-[0_1px_3px_rgba(9,30,66,0.08)] transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-[#bfd0e8] hover:shadow-[0_6px_14px_rgba(9,30,66,0.1)]">
      <div className="text-[0.75rem] uppercase tracking-[0.08em] text-[#6b778c]">
        {label}
      </div>
      <div className="mt-[0.25rem] text-[1.2rem] font-semibold text-[#172b4d]">
        {value}
      </div>
      {sublabel ? (
        <div className="text-[0.78rem] text-[#6b778c]">{sublabel}</div>
      ) : null}
    </div>
  );
}

function BarChart({
  title,
  items,
  color = "#2d64d9",
  valueSuffix = "",
  multiColor = false,
}) {
  const maxValue = Math.max(...items.map((item) => Number(item.value || 0)), 1);
  const [hovered, setHovered] = useState(null);
  const containerRef = useRef(null);
  const palette = [
    "#7c3aed",
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#dc2626",
    "#0891b2",
    "#9333ea",
    "#0d9488",
  ];
  return (
    <section
      ref={containerRef}
      className="relative rounded-[12px] border border-[#d8e2ef] bg-white p-[0.9rem] shadow-[0_1px_3px_rgba(9,30,66,0.08)] transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-[#bfd0e8] hover:shadow-[0_8px_18px_rgba(9,30,66,0.12)]"
      onMouseLeave={() => setHovered(null)}
    >
      <h3 className="text-[0.95rem] font-semibold text-[#172b4d]">{title}</h3>
      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 rounded-[8px] border border-[#dfe1e6] bg-white px-[0.55rem] py-[0.4rem] text-[0.78rem] shadow-[0_8px_18px_rgba(9,30,66,0.16)]"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <div className="text-[#42526e]">{hovered.label}</div>
          <div className="flex items-center gap-[0.35rem] text-[#172b4d]">
            <span
              className="inline-block h-[9px] w-[9px] rounded-[2px]"
              style={{ backgroundColor: hovered.color }}
            />
            <span className="font-semibold">
              {formatNumber(hovered.value)}
              {valueSuffix}
            </span>
          </div>
        </div>
      ) : null}
      <div
        className={`mt-[0.6rem] grid gap-[0.45rem] ${
          items.length > 5 ? "max-h-[162px] overflow-y-auto pr-[0.25rem]" : ""
        }`}
      >
        {items.length ? (
          items.map((item, index) => {
            const value = Number(item.value || 0);
            const width = Math.max((value / maxValue) * 100, value > 0 ? 6 : 0);
            const itemColor = multiColor
              ? palette[index % palette.length]
              : color;
            return (
              <div
                key={item.label}
                className="grid gap-[0.18rem]"
                onMouseMove={(event) => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const x = Math.min(
                    Math.max(event.clientX - rect.left + 12, 10),
                    rect.width - 160,
                  );
                  const y = Math.min(
                    Math.max(event.clientY - rect.top - 28, 10),
                    rect.height - 56,
                  );
                  setHovered({
                    label: item.label,
                    value,
                    color: itemColor,
                    x,
                    y,
                  });
                }}
              >
                <div className="flex items-center justify-between text-[0.78rem] text-[#5e6c84]">
                  <span className="flex items-center gap-[0.4rem] truncate">
                    <span
                      className="inline-block h-[8px] w-[8px] rounded-full"
                      style={{ backgroundColor: itemColor }}
                    />
                    {item.label}
                  </span>
                  <span>
                    {formatNumber(value)}
                    {valueSuffix}
                  </span>
                </div>
                <div className="h-[8px] rounded-full bg-[#edf1f8]">
                  <div
                    className="h-[8px] rounded-full transition-all"
                    style={{ width: `${width}%`, backgroundColor: itemColor }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-[0.82rem] text-[#6b778c]">
            No data for this range.
          </p>
        )}
      </div>
    </section>
  );
}

function DonutChart({ title, items }) {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const [hovered, setHovered] = useState(null);
  const palette = [
    "#7c3aed",
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#dc2626",
    "#0891b2",
    "#9333ea",
  ];
  let offset = 0;
  const slices = items.map((item, index) => {
    const value = Number(item.value || 0);
    const ratio = total > 0 ? value / total : 0;
    const dash = ratio * 100;
    const midAngle = -90 + (Math.abs(offset) + dash / 2) * 3.6;
    const slice = {
      ...item,
      dash,
      offset,
      color: palette[index % palette.length],
      percent: ratio * 100,
      midAngle,
    };
    offset -= dash;
    return slice;
  });

  return (
    <section
      className="relative rounded-[12px] border border-[#d8e2ef] bg-white p-[0.9rem] shadow-[0_1px_3px_rgba(9,30,66,0.08)] transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-[#bfd0e8] hover:shadow-[0_8px_18px_rgba(9,30,66,0.12)]"
      onMouseLeave={() => setHovered(null)}
    >
      <h3 className="text-[0.95rem] font-semibold text-[#172b4d]">{title}</h3>
      {hovered ? (
        <div className="pointer-events-none absolute right-[0.8rem] top-[2.4rem] z-10 rounded-[8px] border border-[#dfe1e6] bg-white px-[0.55rem] py-[0.4rem] text-[0.78rem] shadow-[0_8px_18px_rgba(9,30,66,0.16)]">
          <div className="text-[#42526e]">{hovered.label}</div>
          <div className="flex items-center gap-[0.35rem] text-[#172b4d]">
            <span
              className="inline-block h-[9px] w-[9px] rounded-[2px]"
              style={{ backgroundColor: hovered.color }}
            />
            <span className="font-semibold">
              {formatNumber(hovered.value)} ({hovered.percent.toFixed(1)}%)
            </span>
          </div>
        </div>
      ) : null}
      {items.length ? (
        <div className="mt-[0.6rem] grid gap-[0.7rem] min-[900px]:grid-cols-[220px,1fr]">
          <div className="relative grid place-items-center">
            <svg viewBox="0 0 120 120" className="h-[148px] w-[148px] min-[480px]:h-[180px] min-[480px]:w-[180px]">
              <circle
                cx="60"
                cy="60"
                r="44"
                fill="none"
                stroke="#edf1f8"
                strokeWidth="14"
              />
              {slices.map((slice) => (
                <circle
                  key={slice.label}
                  cx="60"
                  cy="60"
                  r="44"
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="14"
                  strokeLinecap="butt"
                  strokeDasharray={`${slice.dash} ${100 - slice.dash}`}
                  strokeDashoffset={slice.offset}
                  pathLength="100"
                  transform="rotate(-90 60 60)"
                  opacity={hovered && hovered.label !== slice.label ? 0.22 : 1}
                  style={{
                    filter:
                      hovered && hovered.label !== slice.label
                        ? "blur(1px)"
                        : "none",
                    transition: "opacity 140ms ease, filter 140ms ease",
                  }}
                  onMouseEnter={() => setHovered(slice)}
                />
              ))}
            </svg>
            <div className="absolute text-center text-[0.8rem] text-[#5e6c84]">
              <div className="text-[1.1rem] font-semibold text-[#172b4d]">
                {formatNumber(total)}
              </div>
              <div>Total items</div>
            </div>
          </div>
          <div className="grid content-start gap-[0.35rem]">
            {slices.map((slice) => (
              <div
                key={`legend-${slice.label}`}
                className="flex items-center justify-between gap-2 text-[0.82rem]"
                onMouseEnter={() => setHovered(slice)}
                style={{
                  opacity: hovered && hovered.label !== slice.label ? 0.45 : 1,
                  transition: "opacity 140ms ease",
                }}
              >
                <span className="flex items-center gap-[0.45rem] text-[#253858]">
                  <span
                    className="inline-block h-[10px] w-[10px] rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  {slice.label}
                </span>
                <span className="text-[#5e6c84]">
                  {formatNumber(slice.value)} ({slice.percent.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-[0.5rem] text-[0.82rem] text-[#6b778c]">
          No data for this range.
        </p>
      )}
    </section>
  );
}

function VelocityBarChart({ title, points }) {
  const maxValue = Math.max(...points.map((point) => Number(point.value || 0)), 1);
  return (
    <section className="relative rounded-[12px] border border-[#d8e2ef] bg-white p-[0.9rem] shadow-[0_1px_3px_rgba(9,30,66,0.08)] transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-[#bfd0e8] hover:shadow-[0_8px_18px_rgba(9,30,66,0.12)]">
      <h3 className="text-[0.95rem] font-semibold text-[#172b4d]">{title}</h3>
      {points.length ? (
        <div className="mt-[0.65rem] overflow-x-auto pb-1">
          <div
            className="grid min-w-max items-end gap-2"
            style={{
              gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(72px, 1fr))`,
            }}
          >
            {points.map((point) => {
              const value = Number(point.value || 0);
              const height = Math.max((value / maxValue) * 160, value > 0 ? 10 : 2);
              return (
                <div key={point.label} className="grid gap-1 text-center">
                  <div className="text-[0.7rem] font-semibold text-[#42526e]">
                    {formatNumber(value)}
                  </div>
                  <div className="relative h-[170px] rounded-[8px] bg-[#f3f7fd] p-1">
                    <div
                      className="absolute bottom-1 left-1 right-1 rounded-[6px] bg-[linear-gradient(180deg,#4c8df0_0%,#0c66e4_100%)]"
                      style={{ height: `${height}px` }}
                      title={`${point.label}: ${formatNumber(value)}`}
                    />
                  </div>
                  <div
                    className="truncate text-[0.72rem] text-[#6b778c]"
                    title={point.label}
                  >
                    {point.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-[0.5rem] text-[0.82rem] text-[#6b778c]">
          No data for this range.
        </p>
      )}
    </section>
  );
}

export default function SummaryView({
  projectId,
  sprints,
  onFetchOverview,
  onFetchSprint,
  onFetchFlow,
  onFetchWorkload,
  onExportReport,
}) {
  const [fromDate, setFromDate] = useState(
    () => getDefaultDateRange(sprints).from,
  );
  const [toDate, setToDate] = useState(() => getDefaultDateRange(sprints).to);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [sprintSummary, setSprintSummary] = useState(null);
  const [flow, setFlow] = useState(null);
  const [workload, setWorkload] = useState(null);

  useEffect(() => {
    const defaults = getDefaultDateRange(sprints);
    setFromDate(defaults.from);
    setToDate(defaults.to);
  }, [projectId, sprints]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      onFetchOverview(projectId, fromDate, toDate),
      onFetchSprint(projectId, fromDate, toDate),
      onFetchFlow(projectId, fromDate, toDate),
      onFetchWorkload(projectId, fromDate, toDate),
    ])
      .then(([overviewData, sprintData, flowData, workloadData]) => {
        if (cancelled) return;
        setOverview(overviewData);
        setSprintSummary(sprintData);
        setFlow(flowData);
        setWorkload(workloadData);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load summary analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    fromDate,
    toDate,
    onFetchOverview,
    onFetchSprint,
    onFetchFlow,
    onFetchWorkload,
  ]);

  const sprintVelocityPoints = useMemo(
    () =>
      Array.isArray(sprintSummary?.velocityTrend)
        ? sprintSummary.velocityTrend
        : [],
    [sprintSummary],
  );
  const sprintVelocityChartPoints = useMemo(
    () => sprintVelocityPoints.slice(-10),
    [sprintVelocityPoints],
  );

  const statusDistribution = Array.isArray(overview?.statusDistribution)
    ? overview.statusDistribution
    : [];
  const priorityDistribution = Array.isArray(overview?.priorityDistribution)
    ? overview.priorityDistribution
    : [];
  const typeDistribution = Array.isArray(overview?.typeDistribution)
    ? overview.typeDistribution
    : [];
  const assigneeLoad = Array.isArray(workload?.assigneeLoad)
    ? workload.assigneeLoad
    : [];

  if (loading) {
    return (
      <section className="grid gap-[0.85rem]">
        <div className="animate-pulse rounded-[12px] border border-[#d8e2ef] bg-white p-[0.95rem]">
          <div className="h-4 w-48 rounded bg-[#e9edf4]" />
          <div className="mt-3 flex gap-3">
            <div className="h-10 w-36 rounded bg-[#eef2f8]" />
            <div className="h-10 w-36 rounded bg-[#eef2f8]" />
            <div className="ml-auto h-10 w-36 rounded bg-[#e3ebf8]" />
          </div>
        </div>
        <div className="grid gap-[0.6rem] min-[760px]:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={`summary-kpi-skeleton-${idx}`}
              className="animate-pulse rounded-[12px] border border-[#d8e2ef] bg-white p-[0.9rem]"
            >
              <div className="h-3 w-24 rounded bg-[#e8ecf3]" />
              <div className="mt-2 h-6 w-20 rounded bg-[#e1e7f2]" />
              <div className="mt-2 h-3 w-32 rounded bg-[#eef2f8]" />
            </div>
          ))}
        </div>
        <div className="grid gap-[0.7rem] min-[900px]:grid-cols-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={`summary-chart-skeleton-${idx}`}
              className="animate-pulse rounded-[12px] border border-[#d8e2ef] bg-white p-[0.9rem]"
            >
              <div className="h-4 w-36 rounded bg-[#e8ecf3]" />
              <div className="mt-4 h-[170px] rounded bg-[#eef3fa]" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-[0.85rem]">
      <div className="rounded-[12px] border border-[#d8e2ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-[0.95rem] shadow-[0_1px_3px_rgba(9,30,66,0.08)] transition-[border-color,box-shadow] duration-150 ease-out hover:border-[#bfd0e8] hover:shadow-[0_6px_14px_rgba(9,30,66,0.1)]">
        <div className="flex flex-wrap items-end gap-[0.65rem]">
          <label className="grid gap-[0.3rem] text-[0.82rem] font-medium text-[#42526e]">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded-[10px] border border-[#c9d5ea] bg-white px-[0.62rem] py-[0.45rem]"
            />
          </label>
          <label className="grid gap-[0.3rem] text-[0.82rem] font-medium text-[#42526e]">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded-[10px] border border-[#c9d5ea] bg-white px-[0.62rem] py-[0.45rem]"
            />
          </label>
          <div className="ml-auto flex flex-wrap gap-[0.35rem]">
            <button
              type="button"
              className="border border-[#0c66e4] bg-[#0c66e4] text-white hover:border-[#0055cc] hover:bg-[#0055cc]"
              onClick={() =>
                onExportReport("overview", projectId, fromDate, toDate)
              }
            >
              Download Report
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-[10px] border border-[#fecaca] bg-[#fff1f1] p-[0.75rem] text-[#b42318]">
          {error}
        </p>
      ) : null}
      <div className="grid gap-[0.6rem] min-[760px]:grid-cols-3">
        <StatCard
          label="Total Tasks"
          value={formatNumber(overview?.kpis?.totalTasks)}
          sublabel={`Done ${formatNumber(overview?.kpis?.completedTasks)} / Overdue ${formatNumber(overview?.kpis?.overdueTasks)}`}
        />
        <StatCard
          label="Completion Rate"
          value={formatPercent(overview?.kpis?.completionRate)}
          sublabel={`Avg age ${formatNumber(overview?.kpis?.avgOpenAgeDays)} days`}
        />
        <StatCard
          label="Story Points"
          value={formatNumber(overview?.kpis?.totalStoryPoints)}
          sublabel={`Completed ${formatNumber(overview?.kpis?.completedStoryPoints)}`}
        />
      </div>

      <div className="grid gap-[0.7rem] min-[900px]:grid-cols-2">
        <DonutChart
          title="Status Distribution"
          items={statusDistribution}
        />
        <BarChart
          title="Workload by Assignee"
          items={assigneeLoad}
          multiColor
        />
        <BarChart
          title="Types of Work"
          items={typeDistribution}
          multiColor
        />
        <BarChart
          title="Priority Breakdown"
          items={priorityDistribution}
          multiColor
        />
        <div className="min-[900px]:col-span-2">
          <VelocityBarChart
            title="Sprint Velocity"
            points={sprintVelocityChartPoints}
          />
        </div>
      </div>
    </section>
  );
}
