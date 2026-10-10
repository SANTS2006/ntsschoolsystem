export type LiveSessionStatus = "scheduled" | "live" | "ended" | "cancelled";
export type LiveSessionTargetType = "class_section" | "specific_students";

/** `teacher`/`teacher_name`, `status`, `daily_room_url`, `started_at`/`ended_at` are all
 * server-computed — a session only gets a room URL once `start` actually creates it.
 * `target_type` is chosen independently of any linked `lesson` — see the backend model's
 * docstring. `specific_students`'s recipient list lives in `LiveSessionRecipient`, not here. */
export interface LiveSession {
  id: string;
  title: string;
  subject: string;
  subject_name: string;
  school_class: string;
  school_class_name: string;
  section: string | null;
  section_name: string | null;
  lesson: string | null;
  lesson_title: string | null;
  teacher: string;
  teacher_name: string;
  scheduled_start: string;
  status: LiveSessionStatus;
  target_type: LiveSessionTargetType;
  daily_room_url: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveSessionPayload {
  title: string;
  subject: string;
  school_class: string;
  section?: string;
  lesson?: string;
  scheduled_start: string;
  target_type?: LiveSessionTargetType;
}

export interface LiveSessionListParams {
  subject?: string;
  school_class?: string;
  section?: string;
  status?: LiveSessionStatus;
  page?: number;
  page_size?: number;
}

/** Only populated when the parent LiveSession's `target_type` is `specific_students` — see
 * `LiveSessionRecipient`'s backend docstring. */
export interface LiveSessionRecipient {
  id: string;
  session: string;
  session_title: string;
  student: string;
  student_name: string;
}

export interface LiveSessionRecipientPayload {
  session: string;
  student: string;
}
