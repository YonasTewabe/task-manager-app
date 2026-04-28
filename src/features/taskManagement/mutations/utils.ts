export function buildTaskQueryParams(
  sprintId: string | null | undefined,
  projectId: string | null | undefined,
  activeFilters: AnyRecord = {},
) {
  const params = new URLSearchParams();
  params.set("sprintId", sprintId ? String(sprintId) : "backlog");
  if (projectId) params.set("projectId", String(projectId));

  const selectedAssignees = Array.isArray(activeFilters.assigneeIds)
    ? activeFilters.assigneeIds
    : [];
  if (selectedAssignees.length) {
    params.set("assigneeIds", selectedAssignees.join(","));
  }
  if (activeFilters.priority) params.set("priority", activeFilters.priority);
  if (String(activeFilters.label || "").trim()) {
    params.set("label", String(activeFilters.label).trim());
  }
  if (activeFilters.status) params.set("status", activeFilters.status);
  if (activeFilters.type) params.set("type", activeFilters.type);
  if (String(activeFilters.search || "").trim()) {
    params.set("search", String(activeFilters.search).trim());
  }
  return params;
}

export function mergeBoardColumns(
  prevColumns: AnyRecord[] = [],
  incomingColumns: AnyRecord[] = [],
) {
  const byStatus = new Map<string, AnyRecord>(
    prevColumns.map((column) => [String(column.status), column]),
  );
  incomingColumns.forEach((column) => {
    const existing = byStatus.get(String(column.status));
    if (!existing) {
      byStatus.set(String(column.status), column);
      return;
    }
    byStatus.set(String(column.status), {
      ...existing,
      ...column,
      tasks: [...(existing.tasks || []), ...(column.tasks || [])],
    });
  });
  return Array.from(byStatus.values());
}

export function buildBoardTotalsFromColumns(columns: AnyRecord[] = []) {
  const nextTotals: AnyRecord = {};
  columns.forEach((column) => {
    nextTotals[String(column.status || "")] = (column.tasks || []).length;
  });
  return nextTotals;
}
