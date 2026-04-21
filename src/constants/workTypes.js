export const DEFAULT_WORK_TYPES = [
  { value: "story", label: "Story" },
  { value: "task", label: "Task" },
  { value: "bug", label: "Bug" },
  { value: "hot-fix", label: "Hot Fix" },
];

export const DEFAULT_WORK_TYPE_VALUES = DEFAULT_WORK_TYPES.map(
  (item) => item.value,
);

export function getWorkTypeMeta(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const match = DEFAULT_WORK_TYPES.find((item) => item.value === normalized);
  if (match) return match;
  return { value: normalized, label: normalized };
}
