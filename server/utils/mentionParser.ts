import { prisma } from "../db/prisma.js";

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
  { excludeUserId, projectId }: any = {},
) {
  const tokens = extractMentionTokens(text);
  if (!tokens.length) return [];
  const normalizedProjectId = String(projectId || "").trim();
  const allActiveUsers = await prisma.user.findMany({
    where: {
      isActive: true,
    },
    select: { id: true, name: true, email: true },
  });
  const tokenSet = new Set(tokens.map((token) => String(token || "").toLowerCase()));
  const users = allActiveUsers.filter((user) => {
    const name = String(user.name || "").trim().toLowerCase();
    const emailLocal = String(user.email || "").split("@")[0].trim().toLowerCase();
    return tokenSet.has(name) || tokenSet.has(emailLocal);
  });
  const groups = await prisma.userGroup.findMany({
    where: {},
    select: {
      name: true,
      members: {
        where: {
          user: {
            isActive: true,
            ...(normalizedProjectId
              ? {
                  projectMembers: {
                    some: { projectId: normalizedProjectId },
                  },
                }
              : {}),
          },
        },
        select: { userId: true },
      },
    },
  });
  const tokenComparableSet = new Set(tokens.map((token) => toMentionComparable(token)));
  const mentionedFromGroups = groups
    .filter((row) => tokenComparableSet.has(toMentionComparable(row.name)))
    .flatMap((row) =>
      (Array.isArray(row.members) ? row.members : []).map((member) => String(member.userId)),
    );
  const excluded = String(excludeUserId || "");
  return [
    ...new Set(
      [...users.map((row) => String(row.id)), ...mentionedFromGroups]
        .filter((id) => id && id !== excluded),
    ),
  ];
}
