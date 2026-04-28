import {
  exportSummaryReportApi,
  fetchSummaryFlowApi,
  fetchSummaryOverviewApi,
  fetchSummarySprintApi,
  fetchSummaryWorkloadApi,
} from "../api.js";

export function fetchSummaryOverviewController(
  projectId: string,
  fromDate?: string,
  toDate?: string,
  signal?: AbortSignal,
) {
  return fetchSummaryOverviewApi(projectId, fromDate, toDate, { signal });
}

export function fetchSummarySprintController(
  projectId: string,
  fromDate?: string,
  toDate?: string,
  signal?: AbortSignal,
) {
  return fetchSummarySprintApi(projectId, fromDate, toDate, { signal });
}

export function fetchSummaryFlowController(
  projectId: string,
  fromDate?: string,
  toDate?: string,
  interval = "week",
  signal?: AbortSignal,
) {
  return fetchSummaryFlowApi(projectId, fromDate, toDate, interval, { signal });
}

export function fetchSummaryWorkloadController(
  projectId: string,
  fromDate?: string,
  toDate?: string,
  signal?: AbortSignal,
) {
  return fetchSummaryWorkloadApi(projectId, fromDate, toDate, { signal });
}

export async function exportSummaryReportController(
  type: string,
  projectId: string,
  fromDate: string,
  toDate: string,
  deps: { notify: (message: string) => void },
) {
  const response = await exportSummaryReportApi(type, projectId, fromDate, toDate);
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const contentDisposition = response.headers.get("content-disposition") || "";
  const reportType = String(type || "overview");
  const fallbackName = `summary-${reportType}.xlsx`;
  const matched =
    contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ||
    contentDisposition.match(/filename="?([^"]+)"?/i);
  const filename = matched?.[1] ? decodeURIComponent(matched[1]) : fallbackName;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
  deps.notify("Report downloaded.");
}
