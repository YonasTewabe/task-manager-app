import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "task_manager",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 10000,
  ),
});

export async function dbQuery(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const elapsed = Date.now() - start;
  const slowThreshold = Number(process.env.DB_SLOW_QUERY_MS || 300);
  if (elapsed >= slowThreshold && process.env.NODE_ENV !== "test") {
    console.warn(`[db] slow query (${elapsed}ms): ${String(text).slice(0, 160)}`);
  }
  return result;
}

export async function withDbClient(handler) {
  const client = await pool.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}
