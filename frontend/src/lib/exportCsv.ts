import { apiClient } from "./api-client";

/** Generic counterpart to `apps.reports.api.downloadReportCsv` — every list endpoint built on
 * `ExportMixin` (apps.common.views) accepts the same `?export=csv` query param and streams back
 * every row matching the current search/filter/ordering, unpaginated, as a real CSV file. `path`
 * is the same list endpoint the page already calls (e.g. "/students/"); `params` should be that
 * page's current filter params minus `page`/`page_size`, so the export matches what's on screen. */
export async function downloadCsvExport(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  filename: string,
  format: "csv" | "xlsx" = "csv",
): Promise<void> {
  const { data } = await apiClient.get<Blob>(path, {
    params: { ...params, export: format },
    responseType: "blob",
    timeout: 5 * 60 * 1000, // an export of every matching row can take a while
  });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  // The caller names the CSV; an Excel download takes the same name with its own extension.
  link.download = format === "xlsx" ? filename.replace(/\.csv$/i, "") + ".xlsx" : filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
