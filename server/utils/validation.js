export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function asInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function requireFields(body, fields) {
  const missing = fields.filter((field) => !isNonEmptyString(body[field]));
  return { ok: missing.length === 0, missing };
}
