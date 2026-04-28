export async function refreshViewsController(
  sprintId: string,
  projectId: string,
  activeFilters: any,
  deps: {
    activeView: string;
    sprints: AnyRecord[];
    fetchSprints: (projectId?: string) => Promise<AnyRecord[]>;
    fetchBoard: (
      sprintId?: string,
      projectId?: string,
      activeFilters?: any,
      options?: AnyRecord,
    ) => Promise<AnyRecord | void>;
    fetchBacklog: (
      projectId?: string,
      activeFilters?: any,
      sprintId?: string,
      options?: AnyRecord,
    ) => Promise<void>;
    fetchBacklogRows: (
      projectId?: string,
      activeFilters?: any,
      sprintId?: string,
    ) => Promise<AnyRecord[]>;
    setColumns: (value: AnyRecord[]) => void;
    setBoardTotalsByStatus: (value: AnyRecord) => void;
    setBacklogTasks: (value: AnyRecord[]) => void;
    setBacklogRowsData: (value: AnyRecord[]) => void;
    setSprints: (value: AnyRecord[]) => void;
    setSprintTasks: (value: AnyRecord[]) => void;
    setSelectedSprintId: (value: string) => void;
  },
) {
  if (!projectId) {
    deps.setColumns([]);
    deps.setBoardTotalsByStatus({});
    deps.setBacklogTasks([]);
    deps.setBacklogRowsData([]);
    deps.setSprints([]);
    deps.setSprintTasks([]);
    return;
  }
  const currentActiveSprintId =
    String(
      (Array.isArray(deps.sprints)
        ? deps.sprints.find((s) => s.status === "active")?.id
        : "") || "",
    ) || "";
  const shouldFetchBoard = deps.activeView === "board";
  const shouldFetchBacklog = deps.activeView === "backlog";
  const shouldResolveSprintsNow = !shouldFetchBoard;
  const optimisticBoardSprintId = shouldFetchBoard
    ? "__active__"
    : String(sprintId || "");

  const sprintsPromise = shouldResolveSprintsNow
    ? deps.fetchSprints(projectId)
    : Promise.resolve([]);
  const boardPromise =
    shouldFetchBoard && optimisticBoardSprintId
      ? deps.fetchBoard(optimisticBoardSprintId, projectId, activeFilters, {
          fast: true,
        })
      : Promise.resolve(deps.setColumns([]));

  await Promise.all([
    boardPromise,
    shouldFetchBacklog
      ? deps.fetchBacklog(projectId, activeFilters, sprintId)
      : Promise.resolve(deps.setBacklogTasks([])),
    shouldFetchBacklog
      ? deps.fetchBacklogRows(projectId, activeFilters, sprintId)
      : Promise.resolve(deps.setBacklogRowsData([])),
  ]);

  const latestSprints = await sprintsPromise;
  let nextSprintId = sprintId;
  if (
    shouldResolveSprintsNow &&
    sprintId &&
    !latestSprints.some((s) => String(s.id) === String(sprintId))
  ) {
    deps.setSelectedSprintId("");
    nextSprintId = "";
  }

  const latestActiveSprint = shouldResolveSprintsNow
    ? latestSprints.find((s) => s.status === "active")
    : null;
  const boardSprintId = shouldResolveSprintsNow
    ? deps.activeView === "board"
      ? String(latestActiveSprint?.id || "")
      : nextSprintId
    : "";
  if (!shouldFetchBoard) {
    deps.setBoardTotalsByStatus({});
    return;
  }
  if (
    boardSprintId &&
    optimisticBoardSprintId !== "__active__" &&
    String(boardSprintId) !== String(optimisticBoardSprintId)
  ) {
    await deps.fetchBoard(boardSprintId, projectId, activeFilters);
  }
}

export async function loadMoreBoardController(
  deps: {
    boardHasMore: boolean;
    boardLoadingMore: boolean;
    boardNextCursor: string;
    currentProjectId: string;
    debouncedFilters: any;
    setBoardLoadingMore: (value: boolean) => void;
    fetchBoard: (
      sprintId?: string,
      projectId?: string,
      activeFilters?: any,
      options?: AnyRecord,
    ) => Promise<AnyRecord | void>;
  },
) {
  if (!deps.boardHasMore || deps.boardLoadingMore || !deps.boardNextCursor) return;
  deps.setBoardLoadingMore(true);
  try {
    await deps.fetchBoard("__active__", deps.currentProjectId, deps.debouncedFilters, {
      append: true,
      cursor: deps.boardNextCursor,
    });
  } finally {
    deps.setBoardLoadingMore(false);
  }
}

export async function loadMoreBacklogController(
  deps: {
    backlogHasMore: boolean;
    backlogLoadingMore: boolean;
    backlogNextCursor: string;
    currentProjectId: string;
    debouncedFilters: any;
    selectedSprintId: string;
    setBacklogLoadingMore: (value: boolean) => void;
    fetchBacklog: (
      projectId?: string,
      activeFilters?: any,
      sprintId?: string,
      options?: AnyRecord,
    ) => Promise<void>;
  },
) {
  if (!deps.backlogHasMore || deps.backlogLoadingMore || !deps.backlogNextCursor) return;
  deps.setBacklogLoadingMore(true);
  try {
    await deps.fetchBacklog(
      deps.currentProjectId,
      deps.debouncedFilters,
      deps.selectedSprintId,
      {
        append: true,
        cursor: deps.backlogNextCursor,
      },
    );
  } finally {
    deps.setBacklogLoadingMore(false);
  }
}
