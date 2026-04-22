import { dbQuery } from "../db/pool.js";

const MENTION_REGEX = /(^|\s)@([a-zA-Z0-9._-]{2,64})\b/g;
const NON_ALNUM_REGEX = /[^a-z0-9]+/g;

function toMentionComparable(value) {
  const lower = String(value || "").trim().toLowerCase();
  if (!lower) return "";
  return lower.replace(NON_ALNUM_REGEX, "");
}

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

export async function resolveMentionedUserIds(
  text,
  { excludeUserId, projectId } = {},
) {
  const tokens = extractMentionTokens(text);
  if (!tokens.length) return [];
  const normalizedProjectId = String(projectId || "").trim();
  const userResult = await dbQuery(
    `SELECT id
     FROM users
     WHERE is_active = TRUE
       AND (
         LOWER(name) = ANY($1::text[])
         OR SPLIT_PART(LOWER(email), '@', 1) = ANY($1::text[])
       )`,
    [tokens],
  );
  const groupResult = normalizedProjectId
    ? await dbQuery(
        `SELECT g.name,
                ARRAY_AGG(DISTINCT u.id::text) AS "memberIds"
         FROM user_groups g
         JOIN user_group_members ugm ON ugm.group_id = g.id
         JOIN users u ON u.id = ugm.user_id AND u.is_active = TRUE
         LEFT JOIN project_members pm
           ON pm.user_id = u.id
          AND pm.project_id = $1::uuid
         GROUP BY g.id, g.name
         HAVING COUNT(u.id) > 0
            AND BOOL_AND(pm.user_id IS NOT NULL)`,
        [normalizedProjectId],
      )
    : await dbQuery(
        `SELECT g.name,
                ARRAY_AGG(DISTINCT u.id::text) AS "memberIds"
         FROM user_groups g
         JOIN user_group_members ugm ON ugm.group_id = g.id
         JOIN users u ON u.id = ugm.user_id AND u.is_active = TRUE
         GROUP BY g.id, g.name`,
      );
  const tokenSet = new Set(tokens.map((token) => toMentionComparable(token)));
  const mentionedFromGroups = groupResult.rows
    .filter((row) => tokenSet.has(toMentionComparable(row.name)))
    .flatMap((row) =>
      (Array.isArray(row.memberIds) ? row.memberIds : []).map((id) => String(id)),
    );
  const excluded = String(excludeUserId || "");
  return [
    ...new Set(
      [...userResult.rows.map((row) => String(row.id)), ...mentionedFromGroups]
        .filter((id) => id && id !== excluded),
    ),
  ];
}
