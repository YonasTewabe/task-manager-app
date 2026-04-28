import type { AuthJwtPayload } from "../types/api-contracts.js";

export function isObjectRecord(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function asObjectRecord(value: unknown): Record<string, any> {
  return isObjectRecord(value) ? value : {};
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : String(value ?? fallback);
}

export function isAuthJwtPayload(value: unknown): value is AuthJwtPayload {
  if (!isObjectRecord(value)) return false;
  return typeof value.userId === "string" && value.userId.trim().length > 0;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item).trim()).filter(Boolean);
  }
  const single = asString(value).trim();
  return single ? [single] : [];
}
