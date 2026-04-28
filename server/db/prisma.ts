import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__taskManagerPrisma ||
  new PrismaClient({
    log:
      String(process.env.NODE_ENV || "").toLowerCase() === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
  globalForPrisma.__taskManagerPrisma = prisma;
}

export async function withPrismaTransaction(handler) {
  return prisma.$transaction(async (tx) => handler(tx));
}
