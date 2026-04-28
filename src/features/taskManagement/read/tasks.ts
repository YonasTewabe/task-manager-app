import {
  fetchBacklogPageApi,
  fetchBacklogRowsApi,
  fetchBoardPageApi,
  fetchProjectSettingsApi,
  fetchSprintsApi,
  fetchSprintTasksApi,
  fetchTasksApi,
} from "../api.js";
import {
  buildBoardTotalsFromColumns,
  buildTaskQueryParams,
  mergeBoardColumns,
} from "../controller.js";

export async function fetchProjectSettingsController(
  projectId: string,
  deps: {
    latestSettingsProjectIdRef: { current: string };
    setProjectSettings: (value: AnyRecord | null) => void;
  },
) {
  if (!projectId) {
    deps.setProjectSettings(null);
    return;
  }
  const settings = await fetchProjectSettingsApi(projectId);
  if (deps.latestSettingsProjectIdRef.current === String(projectId)) {
    deps.setProjectSettings(settings);
  }
}

export async function fetchBoardController(
  sprintId: string,
  projectId: string,
  activeFilters: any,
  options: AnyRecord = {},
  deps: {
    boardRequestSeqRef: { current: number };
    latestProjectIdRef: { current: string };
    setColumns: (updater: AnyRecord[] | ((prev: AnyRecord[]) => AnyRecord[])) => void;
    setBoardTotalsByStatus: (value: AnyRecord) => void;
    setBoardNextCursor: (value: string) => void;
    setBoardHasMore: (value: boolean) => void;
    setActiveSprintNameHintByProjectId: (
      updater: (prev: AnyRecord) => AnyRecord,
    ) => void;
  },
) {
  if (!projectId) {
    deps.setColumns([]);
    return;
  }
  const requestSeq = ++deps.boardRequestSeqRef.current;
  const { append = false, cursor = "", fast = false } = options;
  const params = buildTaskQueryParams(sprintId, projectId, activeFilters);
  // Keep board cards aligned with backlog totals for typical sprint sizes.
  params.set("limit", "200");
  if (cursor) params.set("cursor", cursor);
  if (fast) params.set("fast", "1");
  const data = await fetchBoardPageApi(params);
  if (requestSeq !== deps.boardRequestSeqRef.current) return;
  if (String(projectId) !== String(deps.latestProjectIdRef.current)) return;

  const incomingColumns: AnyRecord[] = Array.isArray(data?.columns)
    ? (data.columns as AnyRecord[])
    : [];
  deps.setColumns((prev: AnyRecord[]) => {
    if (!append) return incomingColumns;
    return mergeBoardColumns(prev, incomingColumns);
  });
  if (data?.totalsByStatus && typeof data.totalsByStatus === "object") {
    deps.setBoardTotalsByStatus(data.totalsByStatus);
  } else if (!append) {
    deps.setBoardTotalsByStatus(buildBoardTotalsFromColumns(incomingColumns));
  }
  deps.setBoardNextCursor(String(data?.nextCursor || ""));
  deps.setBoardHasMore(Boolean(data?.hasMore));
  if (data?.activeSprintName) {
    deps.setActiveSprintNameHintByProjectId((prev: AnyRecord) => ({
      ...prev,
      [String(projectId)]: String(data.activeSprintName),
    }));
  }
  return data;
}

export async function fetchBacklogController(
  projectId: string,
  activeFilters: any,
  sprintId: string,
  options: AnyRecord = {},
  deps: {
    backlogRequestSeqRef: { current: number };
    latestProjectIdRef: { current: string };
    setBacklogTasks: (updater: AnyRecord[] | ((prev: AnyRecord[]) => AnyRecord[])) => void;
    setBacklogNextCursor: (value: string) => void;
    setBacklogHasMore: (value: boolean) => void;
  },
) {
  if (!projectId || sprintId) {
    deps.setBacklogTasks([]);
    return;
  }
  const requestSeq = ++deps.backlogRequestSeqRef.current;
  const params = buildTaskQueryParams("backlog", projectId, activeFilters);
  params.delete("sprintId");
  const { append = false, cursor = "" } = options;
  params.set("limit", "40");
  if (cursor) params.set("cursor", cursor);
  const data = await fetchBacklogPageApi(params);
  if (requestSeq !== deps.backlogRequestSeqRef.current) return;
  if (String(projectId) !== String(deps.latestProjectIdRef.current)) return;
  const incoming = Array.isArray(data?.items) ? data.items : [];
  deps.setBacklogTasks((prev: AnyRecord[]) => (append ? [...prev, ...incoming] : incoming));
  deps.setBacklogNextCursor(String(data?.nextCursor || ""));
  deps.setBacklogHasMore(Boolean(data?.hasMore));
}

export async function fetchBacklogRowsController(
  projectId: string,
  activeFilters: any,
  sprintId: string,
  deps: {
    backlogRowsRequestSeqRef: { current: number };
    latestProjectIdRef: { current: string };
    setBacklogRowsData: (value: AnyRecord[]) => void;
  },
) {
  if (!projectId) {
    deps.setBacklogRowsData([]);
    return [];
  }
  const requestSeq = ++deps.backlogRowsRequestSeqRef.current;
  const params = buildTaskQueryParams("backlog", projectId, activeFilters);
  params.delete("sprintId");
  if (sprintId) params.set("selectedSprintId", String(sprintId));
  const data = await fetchBacklogRowsApi(params);
  if (requestSeq !== deps.backlogRowsRequestSeqRef.current) return [];
  if (String(projectId) !== String(deps.latestProjectIdRef.current)) return [];
  const rows = Array.isArray(data?.rows)
    ? data.rows
    : Array.isArray(data)
      ? data
      : [];
  deps.setBacklogRowsData(rows);
  return rows;
}

export async function fetchAllTasksController(
  projectId: string,
  activeFilters: any,
  sprintId: string,
  options: AnyRecord = {},
  deps: {
    allTasksRequestSeqRef: { current: number };
    latestProjectIdRef: { current: string };
    setAllTasks: (value: AnyRecord[]) => void;
  },
) {
  if (!projectId) {
    deps.setAllTasks([]);
    return;
  }
  const requestSeq = ++deps.allTasksRequestSeqRef.current;
  const params = buildTaskQueryParams(sprintId || "backlog", projectId, activeFilters);
  const { backlogScope = false } = options;
  if (!sprintId && backlogScope) params.set("backlogScope", "true");
  if (backlogScope && sprintId) params.set("includeSprintId", String(sprintId));
  const data = await fetchTasksApi(params);
  if (requestSeq !== deps.allTasksRequestSeqRef.current) return;
  if (String(projectId) !== String(deps.latestProjectIdRef.current)) return;
  deps.setAllTasks(data || []);
}

export async function fetchSprintsController(
  projectId: string,
  deps: {
    sprintsRequestSeqRef: { current: number };
    latestProjectIdRef: { current: string };
    setSprints: (value: AnyRecord[]) => void;
  },
) {
  if (!projectId) {
    deps.setSprints([]);
    return [];
  }
  const requestSeq = ++deps.sprintsRequestSeqRef.current;
  const data = await fetchSprintsApi(projectId);
  if (requestSeq !== deps.sprintsRequestSeqRef.current) return [];
  if (String(projectId) !== String(deps.latestProjectIdRef.current)) return [];
  deps.setSprints(data || []);
  return data || [];
}

export async function fetchSprintTasksController(
  sprintId: string,
  projectId: string,
  deps: { setSprintTasks: (value: AnyRecord[]) => void },
) {
  if (!sprintId || !projectId) {
    deps.setSprintTasks([]);
    return;
  }
  const data = await fetchSprintTasksApi(sprintId, projectId);
  deps.setSprintTasks(data || []);
}
