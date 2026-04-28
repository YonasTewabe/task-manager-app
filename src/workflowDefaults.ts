/** Default board columns — keys are stored on tasks.status */
export const DEFAULT_WORKFLOW_STAGES = [
  {
    key: "blocked",
    name: "Blocked",
    description: "Work that cannot proceed",
    badge: "",
    counterGroup: "upcoming",
  },
  {
    key: "todo",
    name: "To Do",
    description: "Ready to be picked up",
    badge: "",
    counterGroup: "upcoming",
  },
  {
    key: "in_progress",
    name: "In Progress",
    description: "Actively being worked on",
    badge: "",
    counterGroup: "active",
  },
  {
    key: "done",
    name: "Done",
    description: "Completed work",
    badge: "",
    counterGroup: "done",
  },
];

export const BUILTIN_STAGE_KEYS = new Set(["blocked", "todo", "in_progress", "done"]);
