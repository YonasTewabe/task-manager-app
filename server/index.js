import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";

import githubRoutes from "./routes/github.js";
import jenkinsRoutes from "./routes/jenkins.js";
import taskManagementRoutes from "./routes/taskManagement.js";
import authRoutes from "./routes/auth.js";
import { initSchema } from "./db/initSchema.js";
import { pool } from "./db/pool.js";

dotenv.config();

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.use(express.json());
  app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads")),
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/github", githubRoutes);
  app.use("/api/jenkins", jenkinsRoutes);
  app.use("/api/task-management", taskManagementRoutes);
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use((err, req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
  });

  return app;
}

export async function startServer() {
  await initSchema();
  const app = createApp();
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {});
  return app;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  startServer().catch(async (error) => {
    console.error("Server startup failed:", error);
    await pool.end();
    process.exit(1);
  });
}
