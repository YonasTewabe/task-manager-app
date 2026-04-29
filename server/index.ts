import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";

import githubRoutes from "./routes/github.js";
import jenkinsRoutes from "./routes/jenkins.js";
import taskManagementRoutes from "./routes/taskManagement.js";
import authRoutes from "./routes/auth.js";
import notificationsRoutes from "./routes/notifications.js";
import { prisma } from "./db/prisma.js";

dotenv.config({ quiet: true });

function getCorsOriginAllowlist() {
  const raw = String(process.env.CORS_ORIGIN || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createApp() {
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// Security headers
app.use((req, res, next) => {
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Frame-Options", "DENY");
res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
res.setHeader(
"Strict-Transport-Security",
"max-age=31536000; includeSubDomains; preload"
);
next();
});

const corsAllowlist = getCorsOriginAllowlist();
const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
if (!isProd && corsAllowlist.length === 0) {
app.use(cors());
} else {
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests that do not send the Origin header.
      if (!origin) return callback(null, true);
      if (corsAllowlist.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
  })
);
}
app.use(
express.json({
verify: (req, _res, buf) => {
  (req as Express.Request).rawBody = Buffer.from(buf);
},
})
);

app.use(
"/uploads",
express.static(path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads"))
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/jenkins", jenkinsRoutes);
app.use("/api/task-management", taskManagementRoutes);
app.use("/api/notifications", notificationsRoutes);

app.get("/api/health", (_req, res) => {
res.json({ ok: true });
});

// Error handler
app.use((err, req, res, _next) => {
console.error(err.stack);
const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

res.status(500).json({
  error: "Something went wrong!",
  ...(isProd ? {} : { details: err.message }),
});

});

return app;
}

export async function startServer() {
try {
await prisma.$connect();


const app = createApp();
const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.warn(`[startup] backend listening on port ${PORT}`);
});

server.on("error", (error) => {
  console.error("[startup] server listen error:", error);
  process.exit(1);
});

return app;

} catch (error) {
console.error("Server startup failed:", error);
await prisma.$disconnect();
process.exit(1);
}
}

// Global error handlers
process.on("unhandledRejection", (reason) => {
console.error("[process] unhandledRejection:", reason);
});

process.on("uncaughtException", (error) => {
console.error("[process] uncaughtException:", error);
process.exit(1);
});

const isExecutedDirectly =
  process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url;

// Start only when this module is the entrypoint.
if (isExecutedDirectly) {
  startServer();
}
