export interface EnrollmentReport {
  total_students: number;
  by_status: Array<{ status: string; count: number }>;
  by_class: Array<{ current_class__name: string | null; count: number }>;
  by_gender: Array<{ gender: string; count: number }>;
}

export interface AttendanceReportParams {
  start_date: string;
  end_date: string;
  school_class?: string;
}

export interface AttendanceReport {
  total_records: number;
  by_status: Array<{ status: string; count: number }>;
  attendance_rate_percent: number | null;
}

export interface AcademicPerformanceReport {
  overall_average_score: number | null;
  total_results: number;
  by_subject: Array<{ exam_schedule__subject__name: string; average_score: number; result_count: number }>;
  by_class: Array<{ exam_schedule__school_class__name: string; average_score: number; result_count: number }>;
}

/** Decimal fields come back as strings from DRF (e.g. `"1234.50"`), not numbers — same
 * convention as every other domain's Decimal fields (Finance, Examinations). */
export interface FinanceReport {
  total_invoiced: string;
  total_collected: string;
  total_outstanding: string;
  overdue_count: number;
  overdue_amount: string;
  by_status: Array<{ status: string; count: number }>;
}
