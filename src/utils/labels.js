const DEFAULT_LABEL_COLOR = "#edf3ff";

function normalizeHexColor(color) {
  const value = String(color || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return DEFAULT_LABEL_COLOR;
}

export function normalizeLabelDefinitions(labels) {
  const source = Array.isArray(labels) ? labels : [];
  const seen = new Set();
  const normalized = [];
  source.forEach((entry) => {
    const name =
      typeof entry === "string"
        ? String(entry || "").trim()
        : String(entry?.name || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      name,
      color: normalizeHexColor(entry?.color),
    });
  });
  return normalized;
}

export function buildLabelColorMap(labels) {
  const map = {};
  normalizeLabelDefinitions(labels).forEach((label) => {
    map[label.name] = label.color;
  });
  return map;
}

export { DEFAULT_LABEL_COLOR };
