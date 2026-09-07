import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";

async function seed() {
  console.log("🌱 Starting full comprehensive database seeding...");
  await prisma.$connect();

  // --------------------------------------------------------------------------
  // 1. SYSTEM SETTINGS
  // --------------------------------------------------------------------------
  console.log("⚙️ Seeding system settings...");
  const systemWorkflowStages = [
    {
      key: "blocked",
      name: "Blocked",
      description: "Work that cannot proceed due to dependencies or blockers",
      badge: "Blocked",
      counterGroup: "upcoming",
    },
    {
      key: "todo",
      name: "To Do",
      description: "Ready to be picked up by the team",
      badge: "To Do",
      counterGroup: "upcoming",
    },
    {
      key: "in_progress",
      name: "In Progress",
      description: "Actively being developed",
      badge: "In Progress",
      counterGroup: "active",
    },
    {
      key: "done",
      name: "Done",
      description: "Completed and accepted work",
      badge: "Done",
      counterGroup: "done",
    },
  ];

  const systemWorkflowTransitions = [
    { from: "blocked", to: "todo", allowAllUsers: true, allowedUserIds: [], allowedGroupIds: [] },
    { from: "todo", to: "in_progress", allowAllUsers: true, allowedUserIds: [], allowedGroupIds: [] },
    { from: "in_progress", to: "blocked", allowAllUsers: true, allowedUserIds: [], allowedGroupIds: [] },
    { from: "in_progress", to: "done", allowAllUsers: true, allowedUserIds: [], allowedGroupIds: [] },
    { from: "done", to: "in_progress", allowAllUsers: true, allowedUserIds: [], allowedGroupIds: [] },
  ];

  const standardLabels = [
    { name: "backend", color: "#3b82f6" },
    { name: "frontend", color: "#10b981" },
    { name: "api", color: "#06b6d4" },
    { name: "database", color: "#8b5cf6" },
    { name: "security", color: "#ef4444" },
    { name: "devops", color: "#f97316" },
    { name: "ui/ux", color: "#ec4899" },
    { name: "performance", color: "#f59e0b" },
    { name: "bugfix", color: "#84cc16" },
  ];

  const standardWorkTypes = ["task", "bug", "hot-fix", "story"];
  const standardVersions = ["v1.0.0", "v1.1.0", "v1.2.0", "v2.0.0"];

  const existingSystemSettings = await prisma.systemSettings.findFirst();
  if (!existingSystemSettings) {
    await prisma.systemSettings.create({
      data: {
        boardCardFields: {
          workflowStages: systemWorkflowStages,
        },
        workflowRules: {
          transitions: systemWorkflowTransitions,
        },
        generalRules: {
          labels: standardLabels,
          types: standardWorkTypes,
          versions: standardVersions,
        },
      },
    });
  }

  // --------------------------------------------------------------------------
  // 2. APP INTEGRATION SETTINGS (GLOBAL GITHUB CONFIG)
  // --------------------------------------------------------------------------
  console.log("🔗 Seeding app integration settings...");
  await prisma.appIntegrationSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      githubOrg: "acme-corp",
      githubToken: "ghp_mocktoken1234567890abcdefghijklmnopqrstuvwxyz",
      githubWebhookSecret: "whsec_mocksupersecret1234567890abcdef",
    },
    update: {
      githubOrg: "acme-corp",
      githubToken: "ghp_mocktoken1234567890abcdefghijklmnopqrstuvwxyz",
      githubWebhookSecret: "whsec_mocksupersecret1234567890abcdef",
    },
  });

  // --------------------------------------------------------------------------
  // 3. USERS (ADMIN, LEADS, DEVS, QA, AND DISABLED ACCOUNT)
  // --------------------------------------------------------------------------
  console.log("👥 Seeding users...");
  const adminPasswordHash = await bcrypt.hash("Admin123!", 10);
  const userPasswordHash = await bcrypt.hash("Password123!", 10);

  const usersData = [
    {
      email: "admin@local.dev",
      name: "Admin User",
      passwordHash: adminPasswordHash,
      role: "admin",
      isActive: true,
    },
    {
      email: "sarah.chen@local.dev",
      name: "Sarah Chen",
      passwordHash: userPasswordHash,
      role: "member",
      isActive: true,
    },
    {
      email: "alex.rivera@local.dev",
      name: "Alex Rivera",
      passwordHash: userPasswordHash,
      role: "member",
      isActive: true,
    },
    {
      email: "elena.rostova@local.dev",
      name: "Elena Rostova",
      passwordHash: userPasswordHash,
      role: "member",
      isActive: true,
    },
    {
      email: "marcus.johnson@local.dev",
      name: "Marcus Johnson",
      passwordHash: userPasswordHash,
      role: "member",
      isActive: true,
    },
    {
      email: "priya.patel@local.dev",
      name: "Priya Patel",
      passwordHash: userPasswordHash,
      role: "member",
      isActive: true,
    },
    {
      email: "dev.archived@local.dev",
      name: "David Vance (Inactive)",
      passwordHash: userPasswordHash,
      role: "member",
      isActive: false,
      disableReason: "Departed organization (account archived)",
      disabledAt: new Date("2026-03-15T09:00:00Z"),
    },
  ];

  const userMap: Record<string, any> = {};
  for (const u of usersData) {
    const existing = await prisma.user.findFirst({ where: { email: u.email } });
    if (!existing) {
      const created = await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash: u.passwordHash,
          role: u.role,
          isActive: u.isActive,
          disableReason: u.disableReason || "",
          disabledAt: u.disabledAt || null,
        },
      });
      userMap[u.email] = created;
    } else {
      userMap[u.email] = existing;
    }
  }

  const adminUser = userMap["admin@local.dev"];
  const sarah = userMap["sarah.chen@local.dev"];
  const alex = userMap["alex.rivera@local.dev"];
  const elena = userMap["elena.rostova@local.dev"];
  const marcus = userMap["marcus.johnson@local.dev"];
  const priya = userMap["priya.patel@local.dev"];
  const disabledUser = userMap["dev.archived@local.dev"];

  if (disabledUser && adminUser && !disabledUser.disabledBy) {
    await prisma.user.update({
      where: { id: disabledUser.id },
      data: { disabledBy: adminUser.id },
    });
  }

  // --------------------------------------------------------------------------
  // 4. USER GROUPS & GROUP MEMBERSHIPS
  // --------------------------------------------------------------------------
  console.log("🏢 Seeding user groups and memberships...");
  const groupsData = [
    { name: "Engineering", memberEmails: [alex.email, elena.email, marcus.email] },
    { name: "Product & Design", memberEmails: [sarah.email] },
    { name: "Quality Assurance", memberEmails: [priya.email] },
    { name: "DevOps & Infrastructure", memberEmails: [alex.email, marcus.email] },
  ];

  for (const g of groupsData) {
    let group = await prisma.userGroup.findFirst({ where: { name: g.name } });
    if (!group) {
      group = await prisma.userGroup.create({
        data: { name: g.name },
      });
    }
    for (const email of g.memberEmails) {
      const u = userMap[email];
      if (u) {
        await prisma.userGroupMember.upsert({
          where: { groupId_userId: { groupId: group.id, userId: u.id } },
          create: { groupId: group.id, userId: u.id },
          update: {},
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. PROJECTS, SETTINGS, MEMBERS, REPOS & AUTOMATION RULES
  // --------------------------------------------------------------------------
  console.log("📁 Seeding projects, repositories, and automation rules...");
  const projectsData = [
    {
      name: "Core Platform Services",
      projectKey: "CORE",
      description: "High-throughput backend microservices, authentication, caching, and data pipelines.",
      repo: { owner: "acme-corp", name: "core-platform-services", branch: "main", installationId: 10001n },
      admins: [adminUser.id, alex.id],
      members: [sarah.id, elena.id, marcus.id, priya.id],
    },
    {
      name: "Web Portal Experience",
      projectKey: "WEB",
      description: "Customer dashboard, project board management, analytics, and collaborative workflows.",
      repo: { owner: "acme-corp", name: "web-portal-frontend", branch: "main", installationId: 10002n },
      admins: [adminUser.id, sarah.id],
      members: [alex.id, elena.id, priya.id],
    },
    {
      name: "Mobile App Client",
      projectKey: "MOB",
      description: "Cross-platform mobile client for iOS and Android with push notifications and offline sync.",
      repo: { owner: "acme-corp", name: "mobile-app-client", branch: "develop", installationId: 10003n },
      admins: [adminUser.id, elena.id],
      members: [sarah.id, alex.id, marcus.id],
    },
  ];

  const projectMap: Record<string, any> = {};

  for (const p of projectsData) {
    let project = await prisma.project.findFirst({ where: { projectKey: p.projectKey } });
    if (!project) {
      project = await prisma.project.create({
        data: {
          name: p.name,
          projectKey: p.projectKey,
          description: p.description,
        },
      });
    }
    projectMap[p.projectKey] = project;

    // Project Settings
    await prisma.projectSettings.upsert({
      where: { projectId: project.id },
      create: {
        projectId: project.id,
        boardCardFields: {
          workflowStages: systemWorkflowStages,
        },
        workflowRules: {
          transitions: systemWorkflowTransitions,
        },
        generalRules: {
          labels: standardLabels,
          types: standardWorkTypes,
          versions: standardVersions,
        },
      },
      update: {
        boardCardFields: {
          workflowStages: systemWorkflowStages,
        },
        workflowRules: {
          transitions: systemWorkflowTransitions,
        },
        generalRules: {
          labels: standardLabels,
          types: standardWorkTypes,
          versions: standardVersions,
        },
      },
    });

    // Project Members
    for (const adminId of p.admins) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: adminId } },
        create: { projectId: project.id, userId: adminId, isProjectAdmin: true },
        update: { isProjectAdmin: true },
      });
    }

    for (const memberId of p.members) {
      if (p.admins.includes(memberId)) continue;
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: memberId } },
        create: { projectId: project.id, userId: memberId, isProjectAdmin: false },
        update: {},
      });
    }

    // GitHub Repo Mapping
    await prisma.projectGithubRepo.upsert({
      where: {
        projectId_owner_repo: {
          projectId: project.id,
          owner: p.repo.owner,
          repo: p.repo.name,
        },
      },
      create: {
        projectId: project.id,
        owner: p.repo.owner,
        repo: p.repo.name,
        defaultBranch: p.repo.branch,
        githubInstallationId: p.repo.installationId,
        isEnabled: true,
      },
      update: {
        defaultBranch: p.repo.branch,
        isEnabled: true,
      },
    });

    // Project Automation Rules
    const automationRules = [
      {
        eventType: "branch_created",
        isEnabled: true,
        priority: 1,
        conditionsJson: { branchScope: "any" },
        actionsJson: { targetStatus: "in_progress" },
      },
      {
        eventType: "pr_opened",
        isEnabled: true,
        priority: 2,
        conditionsJson: { branchScope: "any", requireTaskKey: true },
        actionsJson: { targetStatus: "in_progress" },
      },
      {
        eventType: "commit_pushed",
        isEnabled: true,
        priority: 3,
        conditionsJson: { branchScope: "any" },
        actionsJson: { targetStatus: "in_progress" },
      },
      {
        eventType: "pr_merged",
        isEnabled: true,
        priority: 4,
        conditionsJson: { branchScope: "specific", baseBranch: p.repo.branch },
        actionsJson: { targetStatus: "done" },
      },
    ];

    const currentRules = await prisma.projectAutomationRule.count({
      where: { projectId: project.id },
    });
    if (currentRules === 0) {
      for (const rule of automationRules) {
        await prisma.projectAutomationRule.create({
          data: {
            projectId: project.id,
            eventType: rule.eventType,
            isEnabled: rule.isEnabled,
            priority: rule.priority,
            conditionsJson: rule.conditionsJson,
            actionsJson: rule.actionsJson,
          },
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. SPRINTS FOR PROJECTS
  // --------------------------------------------------------------------------
  console.log("🏃 Seeding sprints...");
  const coreProject = projectMap["CORE"];
  const webProject = projectMap["WEB"];
  const mobProject = projectMap["MOB"];

  const sprintsData = [
    // CORE Sprints
    {
      name: "CORE Sprint 1 - Foundation & Auth",
      projectId: coreProject.id,
      status: "completed",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-14"),
    },
    {
      name: "CORE Sprint 2 - API Optimization & Queue",
      projectId: coreProject.id,
      status: "active",
      startDate: new Date("2026-08-15"),
      endDate: new Date("2026-08-29"),
    },
    {
      name: "CORE Sprint 3 - Real-time Push & Webhooks",
      projectId: coreProject.id,
      status: "planned",
      startDate: new Date("2026-08-30"),
      endDate: new Date("2026-09-13"),
    },
    // WEB Sprints
    {
      name: "WEB Sprint 1 - Design System & Navigation",
      projectId: webProject.id,
      status: "completed",
      startDate: new Date("2026-08-05"),
      endDate: new Date("2026-08-19"),
    },
    {
      name: "WEB Sprint 2 - Interactive Kanban & Drawer",
      projectId: webProject.id,
      status: "active",
      startDate: new Date("2026-08-20"),
      endDate: new Date("2026-09-03"),
    },
    // MOB Sprints
    {
      name: "MOB Sprint 1 - Mobile MVP & Biometrics",
      projectId: mobProject.id,
      status: "active",
      startDate: new Date("2026-08-22"),
      endDate: new Date("2026-09-05"),
    },
  ];

  const sprintMap: Record<string, any> = {};
  for (const s of sprintsData) {
    let sprint = await prisma.sprint.findFirst({
      where: { projectId: s.projectId, name: s.name },
    });
    if (!sprint) {
      sprint = await prisma.sprint.create({
        data: {
          name: s.name,
          projectId: s.projectId,
          status: s.status,
          startDate: s.startDate,
          endDate: s.endDate,
        },
      });
    }
    sprintMap[s.name] = sprint;
  }

  // --------------------------------------------------------------------------
  // 7. TASKS WITH ACCEPTANCE CRITERIA, POINTS, LABELS, ESTIMATES
  // --------------------------------------------------------------------------
  console.log("📋 Seeding tasks...");

  const coreS1 = sprintMap["CORE Sprint 1 - Foundation & Auth"];
  const coreS2 = sprintMap["CORE Sprint 2 - API Optimization & Queue"];
  const webS1 = sprintMap["WEB Sprint 1 - Design System & Navigation"];
  const webS2 = sprintMap["WEB Sprint 2 - Interactive Kanban & Drawer"];
  const mobS1 = sprintMap["MOB Sprint 1 - Mobile MVP & Biometrics"];

  const coreTasks = [
    {
      taskNumber: 1,
      title: "Design and implement JWT refresh token rotation",
      description: "Ensure secure token storage with HttpOnly cookies, rotation on refresh, and replay detection.",
      acceptanceCriteria: [
        "Refresh tokens are persisted in hashed format",
        "Replay attempts immediately revoke the entire token family",
        "Access tokens expire in 15 minutes",
      ],
      label: "security",
      versionLabel: "v1.0.0",
      type: "story",
      priority: "urgent",
      status: "done",
      storyPoints: 5,
      assigneeId: alex.id,
      createdBy: sarah.id,
      sprintId: coreS1.id,
    },
    {
      taskNumber: 2,
      title: "Set up PostgreSQL database migrations with Prisma",
      description: "Create baseline schema migration including users, projects, tasks, and audit indices.",
      acceptanceCriteria: [
        "Prisma schema cleanly models all domain relations",
        "Indexes added for query performance on board views",
        "Foreign key constraints enforce referential integrity",
      ],
      label: "database",
      versionLabel: "v1.0.0",
      type: "task",
      priority: "high",
      status: "done",
      storyPoints: 3,
      assigneeId: marcus.id,
      createdBy: alex.id,
      sprintId: coreS1.id,
    },
    {
      taskNumber: 3,
      title: "Implement GitHub Webhook HMAC verification and event ingestion",
      description: "Verify x-hub-signature-256 header on incoming webhooks and route push, PR, and branch events.",
      acceptanceCriteria: [
        "Rejects unsigned or incorrectly signed requests with 401",
        "Extracts task keys matching regex pattern (e.g. CORE-123)",
        "Triggers configured project automation rules idempotently",
      ],
      label: "api",
      versionLabel: "v1.1.0",
      type: "story",
      priority: "urgent",
      status: "in_progress",
      storyPoints: 8,
      assigneeId: alex.id,
      createdBy: sarah.id,
      sprintId: coreS2.id,
    },
    {
      taskNumber: 4,
      title: "Optimize task filtering and pagination queries",
      description: "Query execution times spike with >1000 tasks per project; introduce compound indexes.",
      acceptanceCriteria: [
        "Index on (projectId, status, updatedAt DESC)",
        "API response time under 40ms for 500 items",
        "Cursor pagination implemented for task history feed",
      ],
      label: "performance",
      versionLabel: "v1.1.0",
      type: "task",
      priority: "high",
      status: "in_progress",
      storyPoints: 5,
      assigneeId: marcus.id,
      createdBy: alex.id,
      sprintId: coreS2.id,
    },
    {
      taskNumber: 5,
      title: "Resolve race condition in concurrent task status update",
      description: "Simultaneous drag-and-drop actions can overwrite rowVersion and cause optimistic lock conflicts.",
      acceptanceCriteria: [
        "Atomic update with rowVersion check",
        "Return 409 Conflict with latest task data on stale update",
        "Unit test replicating simultaneous write scenario",
      ],
      label: "bugfix",
      versionLabel: "v1.1.0",
      type: "bug",
      priority: "high",
      status: "blocked",
      storyPoints: 3,
      assigneeId: marcus.id,
      createdBy: priya.id,
      sprintId: coreS2.id,
    },
    {
      taskNumber: 6,
      title: "Implement Web Push notification dispatch worker",
      description: "Queue web-push notifications asynchronously when users are assigned to high-priority items.",
      acceptanceCriteria: [
        "Supports VAPID protocol with payload encryption",
        "Prunes expired or invalid subscription endpoints (410 Gone)",
        "Batching mechanism prevents rate limit throttling",
      ],
      label: "backend",
      versionLabel: "v1.2.0",
      type: "story",
      priority: "medium",
      status: "todo",
      storyPoints: 5,
      assigneeId: alex.id,
      createdBy: sarah.id,
      sprintId: coreS2.id,
    },
    {
      taskNumber: 7,
      title: "Build automated DB backup and restore verification job",
      description: "Nightly cron job to snapshot PostgreSQL and test restoring into isolated scratch container.",
      acceptanceCriteria: [
        "Encrypted backups pushed to offsite object storage",
        "Healthcheck alert dispatched to Slack/email on backup failure",
      ],
      label: "devops",
      versionLabel: "v1.2.0",
      type: "task",
      priority: "medium",
      status: "todo",
      storyPoints: 3,
      assigneeId: marcus.id,
      createdBy: adminUser.id,
      sprintId: null, // Backlog
    },
  ];

  const webTasks = [
    {
      taskNumber: 1,
      title: "Establish Tailwind typography and theme design tokens",
      description: "Define cohesive color palettes, typography scale, borders, and dark mode classes.",
      acceptanceCriteria: [
        "Consistent spacing and color tokens aligned with brand",
        "Accessibility compliance for contrast ratios (WCAG AA)",
      ],
      label: "ui/ux",
      versionLabel: "v1.0.0",
      type: "task",
      priority: "high",
      status: "done",
      storyPoints: 3,
      assigneeId: elena.id,
      createdBy: sarah.id,
      sprintId: webS1.id,
    },
    {
      taskNumber: 2,
      title: "Build interactive Drag & Drop Kanban board view",
      description: "Support fluid drag between status columns, optimistic UI updates, and transition restriction warnings.",
      acceptanceCriteria: [
        "Smooth card animation and drag handles",
        "Respects workflow transition permissions defined in settings",
        "Keyboard accessible navigation",
      ],
      label: "frontend",
      versionLabel: "v1.1.0",
      type: "story",
      priority: "urgent",
      status: "in_progress",
      storyPoints: 8,
      assigneeId: elena.id,
      createdBy: sarah.id,
      sprintId: webS2.id,
    },
    {
      taskNumber: 3,
      title: "Fix layout shift when expanding task details drawer",
      description: "TaskDrawer causes parent board columns to resize unexpectedly on smaller laptop screens.",
      acceptanceCriteria: [
        "Overlay drawer with fixed right sheet layout",
        "No horizontal viewport overflow or scroll jump",
      ],
      label: "bugfix",
      versionLabel: "v1.1.0",
      type: "bug",
      priority: "medium",
      status: "todo",
      storyPoints: 2,
      assigneeId: elena.id,
      createdBy: priya.id,
      sprintId: webS2.id,
    },
    {
      taskNumber: 4,
      title: "Implement real-time in-app notification bell and popover",
      description: "Poll or listen to SSE notification stream and display badge with unread counters.",
      acceptanceCriteria: [
        "Unread notification badge with visual counter",
        "Mark-as-read individual and mark-all-read actions",
      ],
      label: "frontend",
      versionLabel: "v1.2.0",
      type: "story",
      priority: "medium",
      status: "todo",
      storyPoints: 5,
      assigneeId: elena.id,
      createdBy: sarah.id,
      sprintId: null, // Backlog
    },
  ];

  const mobTasks = [
    {
      taskNumber: 1,
      title: "Integrate biometric authentication (FaceID / Fingerprint)",
      description: "Allow users to unlock session securely using hardware biometric sensors.",
      acceptanceCriteria: [
        "Fallback to master PIN on biometric failure",
        "Encrypted keychain token storage",
      ],
      label: "security",
      versionLabel: "v1.0.0",
      type: "story",
      priority: "high",
      status: "in_progress",
      storyPoints: 5,
      assigneeId: elena.id,
      createdBy: sarah.id,
      sprintId: mobS1.id,
    },
    {
      taskNumber: 2,
      title: "Offline task caching and optimistic write replay",
      description: "Queue local task updates in IndexedDB/SQLite while offline and sync when network resumes.",
      acceptanceCriteria: [
        "Conflict resolution logic for concurrently modified tasks",
        "Network connectivity indicator badge",
      ],
      label: "frontend",
      versionLabel: "v1.0.0",
      type: "task",
      priority: "high",
      status: "todo",
      storyPoints: 8,
      assigneeId: marcus.id,
      createdBy: alex.id,
      sprintId: mobS1.id,
    },
    {
      taskNumber: 3,
      title: "Emergency hot-fix for push token registration crash on iOS 18",
      description: "APNs device token conversion throws TypeError on specific iOS 18 beta builds.",
      acceptanceCriteria: [
        "Safe string conversion for byte array buffer",
        "Graceful degradation if push permission is denied",
      ],
      label: "bugfix",
      versionLabel: "v1.0.1",
      type: "hot-fix",
      priority: "urgent",
      status: "blocked",
      storyPoints: 2,
      assigneeId: elena.id,
      createdBy: priya.id,
      sprintId: mobS1.id,
    },
  ];

  const allProjectTaskBatches = [
    { projectId: coreProject.id, tasks: coreTasks },
    { projectId: webProject.id, tasks: webTasks },
    { projectId: mobProject.id, tasks: mobTasks },
  ];

  const taskEntityMap: Record<string, any> = {};

  for (const batch of allProjectTaskBatches) {
    for (const t of batch.tasks) {
      const task = await prisma.task.upsert({
        where: {
          projectId_taskNumber: {
            projectId: batch.projectId,
            taskNumber: t.taskNumber,
          },
        },
        create: {
          title: t.title,
          description: t.description,
          acceptanceCriteria: t.acceptanceCriteria,
          label: t.label,
          versionLabel: t.versionLabel,
          type: t.type,
          priority: t.priority,
          status: t.status,
          storyPoints: t.storyPoints,
          dueDate: new Date(Date.now() + 86400000 * 7),
          projectId: batch.projectId,
          assigneeId: t.assigneeId,
          createdBy: t.createdBy,
          sprintId: t.sprintId,
          taskNumber: t.taskNumber,
        },
        update: {
          title: t.title,
          description: t.description,
          acceptanceCriteria: t.acceptanceCriteria,
          label: t.label,
          versionLabel: t.versionLabel,
          type: t.type,
          priority: t.priority,
          status: t.status,
          storyPoints: t.storyPoints,
          assigneeId: t.assigneeId,
          sprintId: t.sprintId,
        },
      });
      taskEntityMap[`${batch.projectId}-${t.taskNumber}`] = task;
    }
  }

  // --------------------------------------------------------------------------
  // 8. TASK COMMENTS, ACTIVITY LOGS, DEV LINKS
  // --------------------------------------------------------------------------
  console.log("💬 Seeding task comments, activities, and dev links...");

  const coreTask3 = taskEntityMap[`${coreProject.id}-3`]; // Webhook HMAC
  const coreTask5 = taskEntityMap[`${coreProject.id}-5`]; // Race condition
  const webTask2 = taskEntityMap[`${webProject.id}-2`];   // Kanban drag & drop

  if (coreTask3) {
    // Comments
    const commentCount = await prisma.taskComment.count({ where: { taskId: coreTask3.id } });
    if (commentCount === 0) {
      await prisma.taskComment.createMany({
        data: [
          {
            taskId: coreTask3.id,
            userId: sarah.id,
            body: "Make sure we support secret rotation seamlessly so webhooks aren't dropped during maintenance.",
            createdAt: new Date(Date.now() - 3600000 * 24),
          },
          {
            taskId: coreTask3.id,
            userId: alex.id,
            body: "Great point Sarah! I implemented secondary signature verification with fallback to previous secret.",
            createdAt: new Date(Date.now() - 3600000 * 12),
          },
          {
            taskId: coreTask3.id,
            userId: priya.id,
            body: "Tested automated branch trigger payload against local test runner, assertions passed! 🎉",
            createdAt: new Date(Date.now() - 3600000 * 2),
          },
        ],
      });
    }

    // Activities
    const activityCount = await prisma.taskActivity.count({ where: { taskId: coreTask3.id } });
    if (activityCount === 0) {
      await prisma.taskActivity.createMany({
        data: [
          {
            taskId: coreTask3.id,
            userId: sarah.id,
            action: "task_created",
            meta: { title: coreTask3.title, priority: "urgent" },
            createdAt: new Date(Date.now() - 3600000 * 48),
          },
          {
            taskId: coreTask3.id,
            userId: sarah.id,
            action: "assigned",
            meta: { toUserId: alex.id, toUserName: alex.name },
            createdAt: new Date(Date.now() - 3600000 * 40),
          },
          {
            taskId: coreTask3.id,
            userId: alex.id,
            action: "status_changed",
            meta: { from: "todo", to: "in_progress" },
            createdAt: new Date(Date.now() - 3600000 * 20),
          },
        ],
      });
    }

    // Dev Links
    await prisma.taskDevLink.upsert({
      where: {
        provider_artifactType_externalId_taskId: {
          provider: "github",
          artifactType: "pull_request",
          externalId: "142",
          taskId: coreTask3.id,
        },
      },
      create: {
        taskId: coreTask3.id,
        provider: "github",
        artifactType: "pull_request",
        externalId: "142",
        owner: "acme-corp",
        repo: "core-platform-services",
        url: "https://github.com/acme-corp/core-platform-services/pull/142",
        titleOrMessage: "feat(webhook): HMAC signature verification and event dispatcher",
        status: "open",
        payloadJson: { prNumber: 142, headBranch: "feature/CORE-3-webhook-hmac", baseBranch: "main" },
      },
      update: {
        status: "open",
      },
    });

    await prisma.taskDevLink.upsert({
      where: {
        provider_artifactType_externalId_taskId: {
          provider: "github",
          artifactType: "branch",
          externalId: "feature/CORE-3-webhook-hmac",
          taskId: coreTask3.id,
        },
      },
      create: {
        taskId: coreTask3.id,
        provider: "github",
        artifactType: "branch",
        externalId: "feature/CORE-3-webhook-hmac",
        owner: "acme-corp",
        repo: "core-platform-services",
        url: "https://github.com/acme-corp/core-platform-services/tree/feature/CORE-3-webhook-hmac",
        titleOrMessage: "feature/CORE-3-webhook-hmac",
        status: "active",
        payloadJson: { branch: "feature/CORE-3-webhook-hmac" },
      },
      update: {
        status: "active",
      },
    });
  }

  if (coreTask5) {
    const commentCount = await prisma.taskComment.count({ where: { taskId: coreTask5.id } });
    if (commentCount === 0) {
      await prisma.taskComment.create({
        data: {
          taskId: coreTask5.id,
          userId: priya.id,
          body: "Blocked on reproducing this in CI environment. Marcus, can you share the load test script?",
          createdAt: new Date(Date.now() - 3600000 * 5),
        },
      });
    }
  }

  if (webTask2) {
    await prisma.taskDevLink.upsert({
      where: {
        provider_artifactType_externalId_taskId: {
          provider: "github",
          artifactType: "pull_request",
          externalId: "88",
          taskId: webTask2.id,
        },
      },
      create: {
        taskId: webTask2.id,
        provider: "github",
        artifactType: "pull_request",
        externalId: "88",
        owner: "acme-corp",
        repo: "web-portal-frontend",
        url: "https://github.com/acme-corp/web-portal-frontend/pull/88",
        titleOrMessage: "feat(board): Interactive Kanban Drag & Drop with animated drop indicators",
        status: "open",
        payloadJson: { prNumber: 88, headBranch: "feature/WEB-2-kanban-dnd", baseBranch: "main" },
      },
      update: {
        status: "open",
      },
    });
  }

  // --------------------------------------------------------------------------
  // 9. NOTIFICATIONS & AUDIT LOGS
  // --------------------------------------------------------------------------
  console.log("🔔 Seeding notifications and user audit logs...");

  const notificationsData = [
    {
      userId: alex.id,
      type: "task_assigned",
      title: "New Task Assigned",
      body: "Sarah Chen assigned you to CORE-3: Implement GitHub Webhook HMAC verification",
      entityType: "task",
      entityId: coreTask3 ? coreTask3.id : null,
      dedupeKey: `assign-${coreTask3 ? coreTask3.id : "core3"}-${alex.id}`,
      readAt: null,
    },
    {
      userId: alex.id,
      type: "task_comment",
      title: "New Comment on CORE-3",
      body: "Priya Patel commented on CORE-3: Tested automated branch trigger payload...",
      entityType: "task",
      entityId: coreTask3 ? coreTask3.id : null,
      dedupeKey: `comment-${coreTask3 ? coreTask3.id : "core3"}-priya`,
      readAt: null,
    },
    {
      userId: elena.id,
      type: "task_assigned",
      title: "New Task Assigned",
      body: "Sarah Chen assigned you to WEB-2: Build interactive Drag & Drop Kanban board view",
      entityType: "task",
      entityId: webTask2 ? webTask2.id : null,
      dedupeKey: `assign-${webTask2 ? webTask2.id : "web2"}-${elena.id}`,
      readAt: new Date(Date.now() - 3600000 * 8),
    },
  ];

  for (const n of notificationsData) {
    if (!n.userId) continue;
    await prisma.notification.upsert({
      where: {
        userId_dedupeKey: {
          userId: n.userId,
          dedupeKey: n.dedupeKey,
        },
      },
      create: {
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        entityType: n.entityType,
        entityId: n.entityId,
        dedupeKey: n.dedupeKey,
        readAt: n.readAt,
      },
      update: {},
    });
  }

  const auditLogCount = await prisma.userAuditLog.count();
  if (auditLogCount === 0) {
    await prisma.userAuditLog.createMany({
      data: [
        {
          actorUserId: adminUser.id,
          targetUserId: disabledUser.id,
          action: "user_disabled",
          metadata: { reason: "Departed organization (account archived)" },
          createdAt: new Date("2026-03-15T09:00:00Z"),
        },
        {
          actorUserId: adminUser.id,
          targetUserId: alex.id,
          action: "role_promoted",
          metadata: { fromRole: "member", toRole: "project_admin", projectKey: "CORE" },
          createdAt: new Date("2026-04-01T10:00:00Z"),
        },
        {
          actorUserId: adminUser.id,
          targetUserId: sarah.id,
          action: "role_promoted",
          metadata: { fromRole: "member", toRole: "project_admin", projectKey: "WEB" },
          createdAt: new Date("2026-04-01T10:05:00Z"),
        },
      ],
    });
  }

  console.log("✅ Comprehensive database seeding finished successfully!");
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("❌ Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
