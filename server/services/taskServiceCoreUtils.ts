function asUuid(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toDateOnlyValue(value, fieldName) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date in YYYY-MM-DD format.`);
  }
  return parsed;
}

function encodeCursor(payload) {
  if (!payload) return "";
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  const raw = String(cursor || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const updatedAt = String(parsed.updatedAt || "").trim();
    const id = String(parsed.id || "").trim();
    if (!updatedAt || !id) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

function normalizeMemberIds(memberIds = []) {
  return [
    ...new Set(
      (Array.isArray(memberIds) ? memberIds : [])
        .map((v) => asUuid(v))
        .filter((v) => v != null),
    ),
  ];
}

export {
  asUuid,
  decodeCursor,
  encodeCursor,
  normalizeEmail,
  normalizeMemberIds,
  toDateOnlyValue,
};
