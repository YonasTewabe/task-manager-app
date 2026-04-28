import { dbQuery, pool } from "../db/pool.js";

function linkifyTextUrls(html) {
  const source = String(html || "");
  if (!source.trim()) return source;

  // Protect existing anchor tags so we don't double-link them.
  const anchors = [];
  const protectedHtml = source.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (match) => {
    const token = `__ANCHOR_TOKEN_${anchors.length}__`;
    anchors.push(match);
    return token;
  });

  // Linkify plain URLs in remaining content.
  const linked = protectedHtml.replace(
    /(^|[\s>(])((https?:\/\/[^\s<]+))/gi,
    (full, lead, url) => {
      let cleanUrl = String(url || "");
      let trailing = "";
      while (/[),.;!?]$/.test(cleanUrl)) {
        trailing = cleanUrl.slice(-1) + trailing;
        cleanUrl = cleanUrl.slice(0, -1);
      }
      if (!cleanUrl) return full;
      const anchor = `<a href="${cleanUrl}" target="_blank" rel="noreferrer">${cleanUrl}</a>`;
      return `${lead}${anchor}${trailing}`;
    },
  );

  return linked.replace(/__ANCHOR_TOKEN_(\d+)__/g, (_m, idx) => {
    const i = Number(idx);
    return Number.isInteger(i) && anchors[i] ? anchors[i] : "";
  });
}

async function run() {
  const projectKey = String(process.argv[2] || "PPII").trim().toUpperCase();

  const tasks = await dbQuery(
    `SELECT t.id, t.description
     FROM tasks t
     INNER JOIN projects p ON p.id = t.project_id
     WHERE p.project_key = $1`,
    [projectKey],
  );

  if (!tasks.rows.length) {
    console.log(`No tasks found for project key ${projectKey}.`);
    return;
  }

  let scanned = 0;
  let updated = 0;
  for (const row of tasks.rows) {
    scanned += 1;
    const before = String(row.description || "");
    const after = linkifyTextUrls(before);
    if (after === before) continue;
    await dbQuery(
      `UPDATE tasks
       SET description = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [after, row.id],
    );
    updated += 1;
  }

  console.log(
    `Linkify complete for ${projectKey}. Scanned: ${scanned}, updated: ${updated}.`,
  );
}

run()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Linkify task descriptions failed:", error.message || error);
    await pool.end();
    process.exit(1);
  });
