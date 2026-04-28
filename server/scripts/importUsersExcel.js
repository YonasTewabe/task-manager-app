import path from "path";
import bcrypt from "bcryptjs";
import XLSX from "xlsx";
import { dbQuery, pool } from "../db/pool.js";

function asText(value) {
  if (value == null) return "";
  return String(value);
}

function normalizeHeader(value) {
  return asText(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function pickValue(row, candidates) {
  const wanted = new Set(candidates.map(normalizeHeader));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(normalizeHeader(key))) {
      return value;
    }
  }
  return "";
}

function mapRole(roleInput) {
  const role = asText(roleInput).trim().toLowerCase();
  if (role === "org admin" || role === "admin") return "admin";
  if (role === "none" || role === "member") return "member";
  return "member";
}

async function importUsersFromExcel() {
  const sourcePath =
    process.argv[2] || path.resolve(process.cwd(), "..", "export-users.xlsx");
  const workbook = XLSX.readFile(sourcePath, { raw: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error("No sheet found in workbook.");
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    defval: "",
  });

  if (!rows.length) {
    console.log("No rows found in Excel file.");
    return;
  }

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const username = asText(
      pickValue(row, ["username", "user name", "name"]),
    ).trim();
    const email = asText(pickValue(row, ["email", "email address"])).trim();
    const password = asText(
      pickValue(row, ["password", "temp password", "temporary password"]),
    );
    const role = mapRole(pickValue(row, ["role", "user role"]));

    if (!email || !password) {
      skippedCount += 1;
      continue;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const fallbackName = `New User (${email.split("@")[0] || "member"})`;
    const name = username || fallbackName;

    const result = await dbQuery(
      `INSERT INTO users (
         name, email, password_hash, role, must_change_password, password_changed_at, updated_at
       ) VALUES ($1, $2, $3, $4, FALSE, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           must_change_password = FALSE,
           password_changed_at = NOW(),
           is_active = TRUE,
           updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [name, email, passwordHash, role],
    );

    if (result.rows[0]?.inserted) importedCount += 1;
    else updatedCount += 1;
  }

  console.log(
    `User import completed from ${sourcePath}. Imported: ${importedCount}, updated: ${updatedCount}, skipped: ${skippedCount}`,
  );
}

importUsersFromExcel()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("User Excel import failed:", error.message || error);
    await pool.end();
    process.exit(1);
  });
