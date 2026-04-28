export const PRIORITY_OPTIONS = [
  { value: "highest", label: "Highest", tone: "high" },
  { value: "high", label: "High", tone: "high" },
  { value: "medium", label: "Medium", tone: "medium" },
  { value: "low", label: "Low", tone: "low" },
  { value: "lowest", label: "Lowest", tone: "low" },
];

export function getPriorityMeta(priority) {
  return (
    PRIORITY_OPTIONS.find((item) => item.value === priority)
  );
}
