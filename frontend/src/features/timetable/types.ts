export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface Room {
  id: string;
  name: string;
  capacity: number;
  created_at: string;
  updated_at: string;
}

export interface RoomPayload {
  name: string;
  capacity: number;
}

export interface Period {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  order: number;
  is_break: boolean;
  created_at: string;
  updated_at: string;
}

export interface PeriodPayload {
  name: string;
  start_time: string;
  end_time: string;
  order: number;
  is_break: boolean;
}

export interface TimetableEntry {
  id: string;
  section: string;
  section_name: string | null;
  day_of_week: DayOfWeek;
  period: string;
  period_name: string;
  /** "HH:MM" (24h) — the period's own start/end, so a timetable can show when each lesson is. */
  period_start_time: string;
  period_end_time: string;
  period_order: number;
  subject: string | null;
  subject_name: string | null;
  teacher: string | null;
  teacher_name: string | null;
  room: string | null;
  room_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimetableEntryPayload {
  section: string;
  day_of_week: DayOfWeek;
  period: string;
  subject?: string;
  teacher?: string;
  room?: string;
}

export interface TimetableEntryListParams {
  section?: string;
  day_of_week?: DayOfWeek;
  teacher?: string;
  room?: string;
}

/** One row of a draft timetable being built in BuildTimetablePage — the same shape as
 * TimetableEntryPayload minus `section`, since every row in one bulk-create request shares the
 * section currently being built. */
export interface TimetableEntryDraft {
  day_of_week: DayOfWeek;
  period: string;
  subject?: string;
  teacher?: string;
  room?: string;
}

export interface CopySectionPayload {
  from_section: string;
  to_section: string;
  replace?: boolean;
}

export interface CopySectionSkip {
  day_of_week: DayOfWeek;
  period_name: string;
  subject_name: string | null;
}

export interface CopySectionResult {
  created: TimetableEntry[];
  skipped: CopySectionSkip[];
}
