import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AuthView from "./components/AuthView";
import BacklogView from "./components/BacklogView";
import BoardView from "./components/BoardView";
import ProjectManagementView from "./components/ProjectManagementView";
import SprintManagementView from "./components/SprintManagementView";
import SystemSettingsView from "./components/SystemSettingsView";
import TaskDrawer from "./components/TaskDrawer";
import UserAdminView from "./components/UserAdminView";
import MainLayout from "./components/Layout/MainLayout";
import { apiRequest, getStoredToken, setStoredToken } from "./api/client";

const VIEW_KEYS = new Set(["board", "backlog", "projects", "sprints", "users", "settings"]);

function normalizeViewFromPath(pathname) {
  const rawPath = (pathname || "/").replace(/^\/+/, "");
  if (!rawPath) return "board";
  const firstSegment = rawPath.split("/")[0];
  return VIEW_KEYS.has(firstSegment) ? firstSegment : "board";
}

function pathFromView(view) {
  return view === "board" ? "/" : `/${view}`;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(getStoredToken());
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [projects, setProjects] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);
  const [columns, setColumns] = useState([]);
  const [backlogTasks, setBacklogTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [sprintTasks, setSprintTasks] = useState([]);
  const [selectedSprintId, setSelectedSprintId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [storyPoints, setStoryPoints] = useState(3);
  const [assigneeId, setAssigneeId] = useState("");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskLabel, setTaskLabel] = useState("");
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const filterPopoverRef = useRef(null);
  const [taskBundle, setTaskBundle] = useState(null);
  const [activeView, setActiveView] = useState(() => normalizeViewFromPath(location.pathname));
  const [filters, setFilters] = useState({
    assigneeId: "",
    status: "",
    priority: "",
    label: "",
    search: "",
  });
  const [filterDraft, setFilterDraft] = useState({
    sprintId: "",
    assigneeId: "",
    status: "",
    priority: "",
    label: "",
  });

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((user) => map.set(user.id, user.name));
    return map;
  }, [users]);
  const activeSprintId = useMemo(() => {
    const activeSprint = sprints.find((sprint) => sprint.status === "active");
    return activeSprint ? String(activeSprint.id) : "";
  }, [sprints]);
  const assigneeFilterItems = useMemo(() => {
    const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));
    const me = currentUser ? sortedUsers.find((user) => String(user.id) === String(currentUser.id)) : null;
    const others = currentUser
      ? sortedUsers.filter((user) => String(user.id) !== String(currentUser.id))
      : sortedUsers;

    const items = [{ id: "unassigned", label: "Unassigned", initials: "U", isUnassigned: true }];
    if (me) {
      const meInitials = me.name
        .split(" ")
        .map((part) => part[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
      items.push({ id: String(me.id), label: `${me.name} (You)`, initials: meInitials, isUnassigned: false });
    }
    others.forEach((user) => {
      const initials = user.name
        .split(" ")
        .map((part) => part[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
      items.push({ id: String(user.id), label: user.name, initials, isUnassigned: false });
    });
    return items;
  }, [users, currentUser]);

  const canManage = currentUser?.role === "admin";

  const fetchBootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/task-management/bootstrap");
      setCurrentUser(data.currentUser);
      setUsers(data.users || []);
      setSprints(data.sprints || []);
      setProjects(data.projects || []);
      if (!selectedSprintId && data.sprints?.length) {
        setSelectedSprintId(String(data.sprints[0].id));
      }
    } catch (err) {
      setError(err.message || "Failed to load bootstrap");
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemSettings = async () => {
    const settings = await apiRequest("/task-management/settings");
    setSystemSettings(settings);
  };

  const buildTaskQuery = (sprintId, activeFilters = filters) => {
    const params = new URLSearchParams();
    params.set("sprintId", sprintId ? String(sprintId) : "backlog");
    if (activeFilters.assigneeId) params.set("assigneeId", activeFilters.assigneeId);
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim()) params.set("label", activeFilters.label.trim());
    if (activeFilters.search.trim()) params.set("search", activeFilters.search.trim());
    return `?${params.toString()}`;
  };

  const fetchBoard = async (sprintId, activeFilters = filters) => {
    const data = await apiRequest(`/task-management/board${buildTaskQuery(sprintId, activeFilters)}`);
    setColumns(data.columns || []);
  };

  const fetchBacklog = async (activeFilters = filters) => {
    const params = new URLSearchParams();
    if (activeFilters.assigneeId) params.set("assigneeId", activeFilters.assigneeId);
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim()) params.set("label", activeFilters.label.trim());
    if (activeFilters.search.trim()) params.set("search", activeFilters.search.trim());
    const query = params.toString();
    const data = await apiRequest(`/task-management/backlog${query ? `?${query}` : ""}`);
    setBacklogTasks(data || []);
  };

  const fetchAllTasks = async (activeFilters = filters) => {
    const params = new URLSearchParams();
    if (activeFilters.assigneeId) params.set("assigneeId", activeFilters.assigneeId);
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.priority) params.set("priority", activeFilters.priority);
    if (activeFilters.label.trim()) params.set("label", activeFilters.label.trim());
    if (activeFilters.search.trim()) params.set("search", activeFilters.search.trim());
    const query = params.toString();
    const data = await apiRequest(`/task-management/tasks${query ? `?${query}` : ""}`);
    setAllTasks(data || []);
  };

  const fetchSprintTasks = async (sprintId) => {
    if (!sprintId) {
      setSprintTasks([]);
      return;
    }
    const data = await apiRequest(`/task-management/sprints/${sprintId}/tasks`);
    setSprintTasks(data || []);
  };

  const refreshViews = async (sprintId = selectedSprintId, activeFilters = filters) => {
    const boardSprintId = activeView === "board" ? activeSprintId : sprintId;
    await Promise.all([
      fetchBoard(boardSprintId, activeFilters),
      fetchBacklog(activeFilters),
      fetchAllTasks(activeFilters),
    ]);
  };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchBootstrap()
      .then(async () => {
        await Promise.all([refreshViews(selectedSprintId, filters), fetchSystemSettings()]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || loading) return;
    const boardSprintId = activeView === "board" ? activeSprintId : selectedSprintId;
    fetchBoard(boardSprintId, filters).catch(() => {});
    if (activeView === "sprints") {
      fetchSprintTasks(selectedSprintId).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSprintId, activeView, filters, activeSprintId]);

  useEffect(() => {
    if (!showFilterModal) return undefined;
    const handleClickOutside = (event) => {
      if (!filterPopoverRef.current) return;
      if (!filterPopoverRef.current.contains(event.target)) {
        setShowFilterModal(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFilterModal]);

  useEffect(() => {
    const resolved = normalizeViewFromPath(location.pathname);
    if (resolved !== activeView) {
      setActiveView(resolved);
    }
  }, [location.pathname, activeView]);

  useEffect(() => {
    const resolved = normalizeViewFromPath(location.pathname);
    const normalizedPath = pathFromView(resolved);
    if (location.pathname !== normalizedPath) {
      navigate(normalizedPath, { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleNavigate = (view) => {
    const safeView = VIEW_KEYS.has(view) ? view : "board";
    const nextPath = pathFromView(safeView);
    setActiveView(safeView);
    if (location.pathname !== nextPath) {
      navigate(nextPath);
    }
  };

  const login = async ({ email, password }) => {
    setAuthLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(data.token);
      setToken(data.token);
      setCurrentUser(data.user);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async ({ name, email, password }) => {
    setAuthLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setStoredToken(data.token);
      setToken(data.token);
      setCurrentUser(data.user);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    setStoredToken("");
    setToken("");
    setCurrentUser(null);
    setUsers([]);
    setSprints([]);
    setColumns([]);
    setBacklogTasks([]);
    setAllTasks([]);
    setTaskBundle(null);
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    await apiRequest("/task-management/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: taskTitle.trim(),
        storyPoints,
        status: taskStatus,
        priority: taskPriority,
        label: taskLabel.trim(),
        assigneeId: assigneeId || null,
        sprintId:
          activeView === "board"
            ? activeSprintId
              ? activeSprintId
              : null
            : selectedSprintId
              ? selectedSprintId
              : null,
      }),
    });
    setTaskTitle("");
    setStoryPoints(3);
    setAssigneeId("");
    setTaskStatus("todo");
    setTaskPriority("medium");
    setTaskLabel("");
    setShowCreateTaskModal(false);
    await refreshViews(selectedSprintId, filters);
  };

  const moveTask = async (taskId, status) => {
    await apiRequest(`/task-management/tasks/${taskId}/move`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await refreshViews(selectedSprintId, filters);
  };

  const openTask = async (taskId) => {
    const bundle = await apiRequest(`/task-management/tasks/${taskId}`);
    setTaskBundle(bundle);
  };

  const saveTask = async (taskId, patch) => {
    await apiRequest(`/task-management/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await openTask(taskId);
    await refreshViews(selectedSprintId, filters);
  };

  const addComment = async (taskId, body) => {
    await apiRequest(`/task-management/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    await openTask(taskId);
  };

  const createUser = async (payload) => {
    const created = await apiRequest("/task-management/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setUsers((prev) => [created, ...prev]);
  };

  const updateUser = async (userId, draft) => {
    const payload = {
      name: draft.name,
      email: draft.email,
      role: draft.role,
    };
    if (draft.password?.trim()) {
      payload.password = draft.password.trim();
    }

    const updated = await apiRequest(`/task-management/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  const deleteUser = async (userId) => {
    await apiRequest(`/task-management/users/${userId}`, { method: "DELETE" });
    setUsers((prev) => prev.filter((u) => String(u.id) !== String(userId)));
  };

  const createSprint = async (draft) => {
    const created = await apiRequest("/task-management/sprints", {
      method: "POST",
      body: JSON.stringify({
        name: draft.name,
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
        status: "planned",
      }),
    });
    setSprints((prev) => [created, ...prev]);
  };

  const updateSprint = async (sprintId, draft) => {
    const updated = await apiRequest(`/task-management/sprints/${sprintId}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    });
    setSprints((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const createProject = async (payload) => {
    const created = await apiRequest("/task-management/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setProjects((prev) => [created, ...prev]);
  };

  const updateProject = async (projectId, draft) => {
    const updated = await apiRequest(`/task-management/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    });
    setProjects((prev) => prev.map((project) => (project.id === updated.id ? updated : project)));
  };

  const deleteProject = async (projectId) => {
    await apiRequest(`/task-management/projects/${projectId}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((project) => String(project.id) !== String(projectId)));
  };

  const saveSystemSettings = async (nextSettings) => {
    const updated = await apiRequest("/task-management/settings", {
      method: "PATCH",
      body: JSON.stringify(nextSettings),
    });
    setSystemSettings(updated);
    return updated;
  };

  const startSprint = async (sprintId) => {
    await apiRequest(`/task-management/sprints/${sprintId}/start`, {
      method: "POST",
      body: "{}",
    });
    setSprints(await apiRequest("/task-management/sprints"));
    await fetchSprintTasks(sprintId);
  };

  const completeSprint = async (sprintId) => {
    await apiRequest(`/task-management/sprints/${sprintId}/complete`, {
      method: "POST",
      body: JSON.stringify({ moveIncompleteToBacklog: true }),
    });
    setSprints(await apiRequest("/task-management/sprints"));
    await refreshViews(selectedSprintId, filters);
    await fetchSprintTasks(selectedSprintId);
  };

  const addTasksToSprint = async (sprintId, taskIds) => {
    await apiRequest(`/task-management/sprints/${sprintId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ taskIds }),
    });
    await Promise.all([fetchBacklog(filters), fetchSprintTasks(sprintId), fetchBoard(sprintId, filters)]);
  };

  const removeTaskFromSprint = async (sprintId, taskId) => {
    await apiRequest(`/task-management/sprints/${sprintId}/tasks/${taskId}`, {
      method: "DELETE",
    });
    await Promise.all([fetchBacklog(filters), fetchSprintTasks(sprintId), fetchBoard(sprintId, filters)]);
  };

  if (!token) {
    return <AuthView onLogin={login} onRegister={register} loading={authLoading} error={error} />;
  }

  const safeColumns = columns.length
    ? columns
    : [
        { status: "blocked", tasks: [] },
        { status: "todo", tasks: [] },
        { status: "in_progress", tasks: [] },
        { status: "done", tasks: [] },
      ];

  return (
    <MainLayout
      currentUser={currentUser}
      onLogout={logout}
      activeView={activeView}
      onNavigate={handleNavigate}
    >
      <div className="jira-shell">
        {(activeView === "board" || activeView === "backlog") && (
          <section className={`panel top-task-controls ${activeView === "board" ? "board-toolbar" : ""}`}>
            <div className="board-toolbar-main">
              <div className="board-quickbar">
                <div className="search-chip">
                  <span className="search-icon">⌕</span>
                  <input
                    placeholder="Search board"
                    value={filters.search}
                    onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  />
                </div>
                <div className="assignee-strip" title="Team members">
                  {assigneeFilterItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`chip-avatar ${item.isUnassigned ? "chip-avatar-unassigned" : ""} ${filters.assigneeId === item.id ? "active" : ""}`}
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          assigneeId: prev.assigneeId === item.id ? "" : item.id,
                        }))
                      }
                      title={item.label}
                    >
                      {item.isUnassigned ? "◯" : item.initials}
                    </button>
                  ))}
                </div>
                <div className="board-toolbar-actions">
                  <div className="filter-popover-wrapper" ref={filterPopoverRef}>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setFilterDraft({
                          sprintId: activeView === "board" ? "" : selectedSprintId || "",
                          assigneeId: filters.assigneeId,
                          status: filters.status,
                          priority: filters.priority,
                          label: filters.label,
                        });
                        setShowFilterModal((prev) => !prev);
                      }}
                    >
                      Filter
                    </button>
                    {showFilterModal ? (
                      <div className="filter-popover" role="dialog" aria-modal="false">
                        <div className="filter-popover-head">
                          <div>
                            <h3>Filter</h3>
                            <p className="muted">Select all filters that apply</p>
                          </div>
                          <button type="button" className="ghost-btn" onClick={() => setShowFilterModal(false)}>
                            X
                          </button>
                        </div>
                        <div className="filter-popover-grid">
                          {activeView !== "board" ? (
                            <label>
                              Sprint
                              <select
                                value={filterDraft.sprintId}
                                onChange={(event) => setFilterDraft((prev) => ({ ...prev, sprintId: event.target.value }))}
                              >
                                <option value="">Backlog</option>
                                {sprints.map((sprint) => (
                                  <option key={sprint.id} value={sprint.id}>
                                    {sprint.name} ({sprint.status})
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <label>
                            Assignee
                            <select
                              value={filterDraft.assigneeId}
                              onChange={(event) => setFilterDraft((prev) => ({ ...prev, assigneeId: event.target.value }))}
                            >
                              <option value="">Select</option>
                              <option value="unassigned">Unassigned</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Status
                            <select
                              value={filterDraft.status}
                              onChange={(event) => setFilterDraft((prev) => ({ ...prev, status: event.target.value }))}
                            >
                              <option value="">Select</option>
                              <option value="blocked">Blocked</option>
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="done">Done</option>
                            </select>
                          </label>
                          <label>
                            Priority
                            <select
                              value={filterDraft.priority}
                              onChange={(event) => setFilterDraft((prev) => ({ ...prev, priority: event.target.value }))}
                            >
                              <option value="">Select</option>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </label>
                          <label className="filter-popover-span">
                            Label
                            <input
                              placeholder="Select label"
                              value={filterDraft.label}
                              onChange={(event) => setFilterDraft((prev) => ({ ...prev, label: event.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="filter-popover-actions">
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() =>
                              setFilterDraft({
                                sprintId: "",
                                assigneeId: "",
                                status: "",
                                priority: "",
                                label: "",
                              })
                            }
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (activeView !== "board") {
                                setSelectedSprintId(filterDraft.sprintId || "");
                              }
                              setFilters((prev) => ({
                                ...prev,
                                assigneeId: filterDraft.assigneeId,
                                status: filterDraft.status,
                                priority: filterDraft.priority,
                                label: filterDraft.label,
                              }));
                              setShowFilterModal(false);
                            }}
                          >
                            Save Filter
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => setShowCreateTaskModal(true)}>
                    Add Task
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
        {error ? <p className="error">{error}</p> : null}
        {loading ? <p>Loading...</p> : null}
        {showCreateTaskModal ? (
          <div className="modal-overlay" role="presentation" onClick={() => setShowCreateTaskModal(false)}>
            <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="panel-head">
                <h3>Create Task</h3>
                <button type="button" className="ghost-btn" onClick={() => setShowCreateTaskModal(false)}>
                  Close
                </button>
              </div>
              <form className="project-form" onSubmit={createTask}>
                <input
                  placeholder="Task title"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                />
                <input
                  type="number"
                  min="1"
                  max="21"
                  value={storyPoints}
                  onChange={(event) => setStoryPoints(Number(event.target.value))}
                />
                <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <select value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
                  <option value="blocked">Blocked</option>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <input
                  placeholder="Label (e.g. frontend)"
                  value={taskLabel}
                  onChange={(event) => setTaskLabel(event.target.value)}
                />
                <button type="submit">Create Task</button>
              </form>
            </div>
          </div>
        ) : null}
        {activeView === "backlog" ? (
          <BacklogView
            tasks={backlogTasks}
            sprints={sprints}
            allTasks={allTasks}
            selectedSprintId={selectedSprintId}
            onSelectSprint={setSelectedSprintId}
            canManage={canManage}
            onStartSprint={startSprint}
            onCompleteSprint={completeSprint}
            onGoToSprintManagement={() => handleNavigate("sprints")}
          />
        ) : null}

        {activeView === "board" ? (
          <BoardView
            columns={safeColumns}
            usersById={usersById}
            onMove={moveTask}
            onOpenTask={openTask}
          />
        ) : null}

        {activeView === "sprints" ? (
          <SprintManagementView
            sprints={sprints}
            selectedSprintId={selectedSprintId}
            usersById={usersById}
            sprintTasks={sprintTasks}
            backlogTasks={backlogTasks}
            onSelectSprint={setSelectedSprintId}
            onCreateSprint={createSprint}
            onUpdateSprint={updateSprint}
            onStartSprint={startSprint}
            onCompleteSprint={completeSprint}
            onAddTasksToSprint={addTasksToSprint}
            onRemoveTaskFromSprint={removeTaskFromSprint}
          />
        ) : null}

        {activeView === "projects" ? (
          <ProjectManagementView
            projects={projects}
            users={users}
            onCreateProject={createProject}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
          />
        ) : null}

        {activeView === "users" ? (
          <UserAdminView
            users={users}
            canManage={canManage}
            currentUserId={currentUser?.id}
            onCreateUser={createUser}
            onUpdateUser={updateUser}
            onDeleteUser={deleteUser}
          />
        ) : null}

        {activeView === "settings" ? (
          <SystemSettingsView
            settings={systemSettings}
            canManage={canManage}
            onSave={saveSystemSettings}
          />
        ) : null}

        <TaskDrawer
          taskBundle={taskBundle}
          users={users}
          onClose={() => setTaskBundle(null)}
          onSaveTask={saveTask}
          onAddComment={addComment}
        />
      </div>
    </MainLayout>
  );
}

export default App;
