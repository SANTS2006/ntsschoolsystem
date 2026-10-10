/** The built-in categories; a school can add more through "Other", so the value itself is any string. */
export type BuiltinDisciplineCategory =
  | "bullying"
  | "vandalism"
  | "tardiness"
  | "academic_dishonesty"
  | "fighting"
  | "other";
export type DisciplineCategory = string;
export type DisciplineSeverity = "minor" | "moderate" | "severe";
export type DisciplineActionTaken = "none" | "warning" | "detention" | "suspension" | "expulsion";
export type DisciplineStatus = "reported" | "under_review" | "resolved";

/** `reported_by`/`reported_by_name` are server-computed — always the logged-in user who created
 * the incident, never client-settable (not writable even on update). */
export interface DisciplineIncident {
  id: string;
  student: string;
  student_name: string;
  category: DisciplineCategory;
  category_label: string;
  severity: DisciplineSeverity;
  incident_date: string;
  description: string;
  reported_by: string | null;
  reported_by_name: string | null;
  action_taken: DisciplineActionTaken;
  status: DisciplineStatus;
  parent_notified: boolean;
  follow_up_notes: string;
  created_at: string;
  updated_at: string;
}

export interface DisciplineIncidentPayload {
  student: string;
  category?: DisciplineCategory;
  severity?: DisciplineSeverity;
  incident_date: string;
  description: string;
  action_taken?: DisciplineActionTaken;
  status?: DisciplineStatus;
  parent_notified?: boolean;
  follow_up_notes?: string;
}

export interface DisciplineIncidentListParams {
  student?: string;
  category?: DisciplineCategory;
  severity?: DisciplineSeverity;
  status?: DisciplineStatus;
  page?: number;
  page_size?: number;
}
