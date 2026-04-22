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
  const allowedOrigins = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
    next();
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("CORS origin denied"));
      },
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
    if (String(err.message || "").includes("CORS origin denied")) {
      return res.status(403).json({ error: "Origin not allowed." });
    }
    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
    return res.status(500).json({
      error: "Something went wrong!",
      ...(isProd ? {} : { details: err.message }),
    });
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
