function parseIsoDate(value, fallback = null) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function startOfDay(value) {
  const date = parseIsoDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = parseIsoDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function daysBetween(older, newer) {
  const start = parseIsoDate(older);
  const end = parseIsoDate(newer);
  if (!start || !end) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function bucketDate(dateValue, interval = "week") {
  const date = parseIsoDate(dateValue);
  if (!date) return "";
  const year = date.getUTCFullYear();
  if (interval === "month") {
    return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const firstJan = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - firstJan) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function filterByDateRange(tasks, fromDate, toDate, field = "createdAt") {
  return tasks.filter((task) => {
    const at = parseIsoDate(task?.[field]);
    if (!at) return false;
    if (fromDate && at < fromDate) return false;
    if (toDate && at > toDate) return false;
    return true;
  });
}

function formatMetricRows(metrics = []) {
  return metrics.map((metric) => ({
    Metric: metric.label,
    Value: metric.value,
    notes: metric.sublabel || "",
  }));
}

function formatDateDdMmYyyy(value: unknown) {
  const date = parseIsoDate(value);
  if (!date) return "";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  return `${day}-${month}-${year}`;
}

export {
  bucketDate,
  daysBetween,
  endOfDay,
  filterByDateRange,
  formatDateDdMmYyyy,
  formatMetricRows,
  parseIsoDate,
  startOfDay,
};
