import { useMutation, useQuery } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { downloadReportCsv, fetchAcademicPerformanceReport, fetchAttendanceReport, fetchEnrollmentReport, fetchFinanceReport } from "./api";
import type { AttendanceReportParams } from "./types";

const REPORTS_KEY = ["reports"] as const;

export function useEnrollmentReport(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "enrollment"],
    queryFn: fetchEnrollmentReport,
    enabled: options?.enabled ?? true,
  });
}

export function useAttendanceReport(params: AttendanceReportParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "attendance", params],
    queryFn: () => fetchAttendanceReport(params),
    enabled: options?.enabled ?? true,
  });
}

export function useAcademicPerformanceReport(examId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "academic-performance", examId],
    queryFn: () => fetchAcademicPerformanceReport(examId),
    enabled: (options?.enabled ?? true) && !!examId,
  });
}

export function useFinanceReport(academicYearId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "finance", academicYearId ?? "all"],
    queryFn: () => fetchFinanceReport(academicYearId),
    enabled: options?.enabled ?? true,
  });
}

export function useDownloadReportCsv() {
  return useMutation<void, ApiError, Parameters<typeof downloadReportCsv>>({
    mutationFn: ([path, params, filename]) => downloadReportCsv(path, params, filename),
  });
}
