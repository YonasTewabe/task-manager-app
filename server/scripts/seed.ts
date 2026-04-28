import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";

async function seed() {
  await prisma.$connect();

  const existing = await prisma.user.findFirst({
    where: { email: "admin@local.dev" },
    select: { id: true },
  });
  if (!existing) {
    const passwordHash = await bcrypt.hash("Admin123!", 10);
    await prisma.user.create({
      data: {
        name: "Admin User",
        email: "admin@local.dev",
        passwordHash,
        role: "admin",
      },
    });
  }

  const admin = await prisma.user.findFirst({
    where: { email: "admin@local.dev" },
    select: { id: true },
  });

  let projectId;
  const projectLookup = await prisma.project.findFirst({
    where: { projectKey: "SEED" },
    select: { id: true },
  });
  if (!projectLookup) {
    const inserted = await prisma.project.create({
      data: {
        name: "Seed project",
        projectKey: "SEED",
        description: "Local development seed data",
      },
      select: { id: true },
    });
    projectId = inserted.id;
    await prisma.projectSettings.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: admin.id } },
      create: { projectId, userId: admin.id, isProjectAdmin: true },
      update: { isProjectAdmin: true },
    });
  } else {
    projectId = projectLookup.id;
  }

  let sprintId;
  const sprintLookup = await prisma.sprint.findFirst({
    where: { projectId, name: "Sprint 1" },
    select: { id: true },
  });
  if (!sprintLookup) {
    const sprintIns = await prisma.sprint.create({
      data: {
        name: "Sprint 1",
        projectId,
        status: "active",
      },
      select: { id: true },
    });
    sprintId = sprintIns.id;
  } else {
    sprintId = sprintLookup.id;
  }

  const taskCount = await prisma.task.count({ where: { projectId } });
  if (Number(taskCount || 0) === 0) {
    await prisma.task.createMany({
      data: [
        {
          title: "Set up authentication",
          description: "Implement login/register and protected routes",
          acceptanceCriteria: [],
          label: "",
          versionLabel: "",
          type: "story",
          priority: "high",
          status: "blocked",
          storyPoints: 5,
          assigneeId: admin.id,
          sprintId,
          projectId,
          createdBy: admin.id,
          taskNumber: 1,
        },
        {
          title: "Build first board screen",
          description: "Render blocked/todo/in-progress/done columns with task cards",
          acceptanceCriteria: [],
          label: "",
          versionLabel: "",
          type: "task",
          priority: "medium",
          status: "in_progress",
          storyPoints: 3,
          assigneeId: admin.id,
          sprintId,
          projectId,
          createdBy: admin.id,
          taskNumber: 2,
        },
      ],
    });
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
