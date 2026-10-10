import { apiClient } from "@/lib/api-client";

import type { AcademicPerformanceReport, AttendanceReport, AttendanceReportParams, EnrollmentReport, FinanceReport } from "./types";

export async function fetchEnrollmentReport(): Promise<EnrollmentReport> {
  const { data } = await apiClient.get<{ report: EnrollmentReport }>("/reports/enrollment/");
  return data.report;
}

export async function fetchAttendanceReport(params: AttendanceReportParams): Promise<AttendanceReport> {
  const { data } = await apiClient.get<{ report: AttendanceReport }>("/reports/attendance/", { params });
  return data.report;
}

export async function fetchAcademicPerformanceReport(examId: string): Promise<AcademicPerformanceReport> {
  const { data } = await apiClient.get<{ report: AcademicPerformanceReport }>("/reports/academic-performance/", {
    params: { exam_id: examId },
  });
  return data.report;
}

export async function fetchFinanceReport(academicYearId?: string): Promise<FinanceReport> {
  const { data } = await apiClient.get<{ report: FinanceReport }>("/reports/finance/", {
    params: academicYearId ? { academic_year_id: academicYearId } : undefined,
  });
  return data.report;
}

/** Every report endpoint accepts `?export=csv` and returns a raw CSV file instead of the usual
 * JSON envelope (deliberately not named `format` on the backend to avoid colliding with DRF's own
 * content-negotiation query param). Fetched as a blob and handed to the browser as a real
 * download — there's no JSON to parse here, so this bypasses the normal `data.report` unwrapping. */
export async function downloadReportCsv(
  path: "enrollment" | "attendance" | "academic-performance" | "finance",
  params: Record<string, string | undefined>,
  filename: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/reports/${path}/`, {
    params: { ...params, export: "csv" },
    responseType: "blob",
  });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
