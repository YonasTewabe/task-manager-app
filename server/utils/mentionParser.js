import { dbQuery } from "../db/pool.js";

const MENTION_REGEX = /(^|\s)@([a-zA-Z0-9._-]{2,64})\b/g;

export function extractMentionTokens(text) {
  const value = String(text || "");
  const out = new Set();
  let match = MENTION_REGEX.exec(value);
  while (match) {
    out.add(String(match[2] || "").toLowerCase());
    match = MENTION_REGEX.exec(value);
  }
  return [...out];
}

export async function resolveMentionedUserIds(text, { excludeUserId } = {}) {
  const tokens = extractMentionTokens(text);
  if (!tokens.length) return [];
  const result = await dbQuery(
    `SELECT id
     FROM users
     WHERE LOWER(name) = ANY($1::text[])
        OR SPLIT_PART(LOWER(email), '@', 1) = ANY($1::text[])`,
    [tokens],
  );
  const excluded = String(excludeUserId || "");
  return [
    ...new Set(
      result.rows
        .map((row) => String(row.id))
        .filter((id) => id && id !== excluded),
    ),
  ];
}
