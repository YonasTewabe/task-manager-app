import { Router } from "express";
import bcrypt from "bcryptjs";
import { dbQuery } from "../db/pool.js";
import { requireAuth, signAuthToken } from "../middleware/auth.js";
import { requireFields } from "../utils/validation.js";

const router = Router();

router.post("/register", async (req, res) => {
  const validation = requireFields(req.body, ["name", "email", "password"]);
  if (!validation.ok) {
    return res.status(400).json({ error: `Missing fields: ${validation.missing.join(", ")}` });
  }

  const email = req.body.email.trim().toLowerCase();
  const name = req.body.name.trim();
  const passwordHash = await bcrypt.hash(req.body.password, 10);

  try {
    const countResult = await dbQuery("SELECT COUNT(*)::int AS count FROM users");
    const userCount = countResult.rows[0].count;
    const role = userCount === 0 ? "admin" : "member";

    const insert = await dbQuery(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role],
    );

    const user = insert.rows[0];
    const token = signAuthToken(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Failed to register user" });
  }
});

router.post("/login", async (req, res) => {
  const validation = requireFields(req.body, ["email", "password"]);
  if (!validation.ok) {
    return res.status(400).json({ error: `Missing fields: ${validation.missing.join(", ")}` });
  }

  const email = req.body.email.trim().toLowerCase();
  const result = await dbQuery(
    "SELECT id, name, email, role, password_hash FROM users WHERE email = $1",
    [email],
  );
  const row = result.rows[0];
  if (!row) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const validPassword = await bcrypt.compare(req.body.password, row.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  const token = signAuthToken(user);
  return res.json({ token, user });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
