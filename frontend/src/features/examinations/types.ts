export type ExamType = "exam" | "test" | "quiz" | "continuous_assessment" | "practical";

export interface GradingScale {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface GradingScalePayload {
  name: string;
  is_default: boolean;
}

/** Decimal fields come back as strings from DRF (e.g. `"72.50"`), not numbers — parse with
 * `Number()` only where an actual computation is needed (a percentage, a comparison). */
export interface GradeBoundary {
  id: string;
  grading_scale: string;
  grade: string;
  min_score: string;
  max_score: string;
  gpa_value: string | null;
}

export interface GradeBoundaryPayload {
  grading_scale: string;
  grade: string;
  min_score: string;
  max_score: string;
  gpa_value?: string;
}

export interface Exam {
  id: string;
  name: string;
  exam_type: ExamType;
  term: string;
  term_name: string;
  grading_scale: string | null;
  grading_scale_name: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface ExamPayload {
  name: string;
  exam_type: ExamType;
  term: string;
  grading_scale?: string;
  start_date: string;
  end_date: string;
}

export interface ExamListParams {
  page?: number;
  page_size?: number;
  search?: string;
  term?: string;
  exam_type?: ExamType;
  ordering?: string;
}

/** One subject's sitting within an `Exam`, for one class. */
export interface ExamSchedule {
  id: string;
  exam: string;
  exam_name: string;
  school_class: string;
  school_class_name: string;
  subject: string;
  subject_name: string;
  max_score: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamSchedulePayload {
  exam: string;
  school_class: string;
  subject: string;
  max_score: string;
  date?: string;
  start_time?: string | null;
  end_time?: string | null;
}

export interface ExamScheduleListParams {
  page?: number;
  page_size?: number;
  exam?: string;
  school_class?: string;
  subject?: string;
}

/** One row of a student's transcript — a historical, published/locked grade snapshot. */
export interface ReportCardEntry {
  subject: string;
  exam: string;
  ca_score: string | null;
  exam_score: string | null;
  score: string | null;
  max_score: string;
  grade: string;
  teacher_comment: string;
}

export interface TranscriptTerm {
  id: string;
  name: string;
  results: ReportCardEntry[];
}

export interface Transcript {
  school: { id: string; name: string; slug: string; logo: string | null } | null;
  student: { id: string; name: string } | null;
  terms: TranscriptTerm[];
}

export interface TimetableRoom {
  id: string;
  room: string;
  room_name: string;
  capacity: number;
  seated: number;
  invigilators: { id: string; name: string }[];
}

export interface TimetablePaper {
  id: string;
  exam: string;
  school_class: string;
  school_class_name: string;
  subject_name: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  rooms: TimetableRoom[];
  seated: number;
  /** Active students of the class who should be seated. */
  students: number;
}

export interface ExamTimetable {
  exam: { id: string; name: string; start_date: string; end_date: string; published: boolean; published_at: string | null };
  schedules: TimetablePaper[];
}

export interface TimetableOptions {
  rooms: { id: string; name: string; capacity: number }[];
  invigilators: { id: string; name: string }[];
}

export interface AssignRoomPayload {
  room: string;
  invigilators: string[];
  auto_seat: boolean;
}

/** One line of the signed-in person's published exam timetable: a student's sitting, or a staff member's duty. */
export interface MyExamRow {
  exam: string;
  subject: string;
  class?: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  room: string;
  seat_number?: number;
  students?: number;
  invigilators: string[];
}

export interface MyExamTimetable {
  kind: "student" | "staff" | "none";
  rows: MyExamRow[];
}
