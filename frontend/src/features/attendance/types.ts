export type AttendanceStatus = "present" | "absent" | "late" | "excused" | "early_departure";

export interface StudentAttendance {
  id: string;
  student: string;
  student_name: string;
  date: string;
  status: AttendanceStatus;
  section: string | null;
  section_name: string | null;
  subject: string | null;
  subject_name: string | null;
  period: string | null;
  notes: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentAttendanceListParams {
  page?: number;
  page_size?: number;
  student?: string;
  date?: string;
  section?: string;
  subject?: string;
  status?: AttendanceStatus;
  ordering?: string;
}

/** A single-record write — the realistic path for a correction, not the everyday "take
 * attendance" flow (that's `BulkMarkPayload` below, which upserts many students at once). */
export interface StudentAttendancePayload {
  student: string;
  date: string;
  status: AttendanceStatus;
  section?: string;
  subject?: string;
  period?: string;
  notes?: string;
}

export interface BulkMarkEntry {
  student_id: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface BulkMarkPayload {
  date: string;
  section: string;
  subject?: string;
  period?: string;
  entries: BulkMarkEntry[];
}

export interface AttendanceStats {
  present: number;
  absent: number;
  late: number;
  excused: number;
  early_departure: number;
}

export interface AttendanceStatsParams {
  date?: string;
  section?: string;
  subject?: string;
  student?: string;
}

export interface StaffAttendance {
  id: string;
  staff: string;
  staff_name: string;
  date: string;
  status: AttendanceStatus;
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffAttendanceListParams {
  page?: number;
  page_size?: number;
  staff?: string;
  date?: string;
  status?: AttendanceStatus;
  ordering?: string;
}

export interface StaffAttendancePayload {
  staff: string;
  date: string;
  status: AttendanceStatus;
  check_in_time?: string;
  check_out_time?: string;
  notes?: string;
}
