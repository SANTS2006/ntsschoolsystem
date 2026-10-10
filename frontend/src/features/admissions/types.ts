export type ApplicationKind = "student" | "staff";

export type ApplicationStatus =
  | "submitted"
  | "shortlisted"
  | "interview_scheduled"
  | "accepted"
  | "rejected";

export interface ApplicationDocument {
  id: string;
  title: string;
  file: string;
  created_at: string;
}

export interface Application {
  id: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: string;
  address: string;
  applying_for_class: string | null;
  applying_for_class_name: string | null;
  previous_school: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
  applying_for_role: string | null;
  applying_for_role_name: string | null;
  job_title: string;
  qualification: string;
  years_of_experience: number | null;
  interview_datetime: string | null;
  interview_location: string;
  interview_notes: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  decided_at: string | null;
  rejection_reason: string;
  created_student: string | null;
  created_staff: string | null;
  documents: ApplicationDocument[];
  /** Answers to the school's own extra questions, with the question's label stored alongside. */
  custom_answers: Record<string, { label: string; value: string }>;
  created_at: string;
  updated_at: string;
}

export interface ApplicationListParams {
  kind?: ApplicationKind;
  status?: ApplicationStatus;
  search?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export interface InviteInterviewPayload {
  application_ids: string[];
  interview_datetime: string;
  interview_location?: string;
  interview_notes?: string;
}

export interface BulkAcceptSkip {
  id: string;
  name: string;
  reason: string;
}

export interface BulkAcceptResult {
  accepted: number;
  skipped: BulkAcceptSkip[];
}

export interface PublicSchoolClassOption {
  id: string;
  name: string;
}

export interface PublicRoleOption {
  id: string;
  name: string;
}

export type FormFieldType =
  | "text"
  | "email"
  | "date"
  | "textarea"
  | "gender"
  | "class"
  | "role"
  | "number"
  | "files";

/** One standard question on the public form, with the school's choices applied. Locked ones (names,
 * email, the class/role applied for) are always shown and required. */
export interface FormFieldConfig {
  key: string;
  label: string;
  type: FormFieldType;
  locked: boolean;
  enabled: boolean;
  required: boolean;
}

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "email"
  | "phone"
  | "select"
  | "radio"
  | "multiselect"
  | "checkbox"
  | "file";

/** Question types that offer a list of choices the admin writes. */
export const CHOICE_TYPES: CustomFieldType[] = ["select", "radio", "multiselect"];

/** A question the school added itself. `key` is assigned by the server when first saved. */
export interface CustomFieldConfig {
  key?: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: string[];
}

export interface FormConfig {
  kind: ApplicationKind;
  fields: FormFieldConfig[];
  custom_fields: CustomFieldConfig[];
}

export interface FormConfigResponse {
  apply_url: string;
  school_slug: string;
  student: FormConfig;
  staff: FormConfig;
}

export interface FormConfigPayload {
  /** Only the non-locked standard fields: { key: { enabled, required } }. */
  fields: Record<string, { enabled: boolean; required: boolean }>;
  custom_fields: CustomFieldConfig[];
}

export interface PublicApplicationOptions {
  classes: PublicSchoolClassOption[];
  roles: PublicRoleOption[];
  form: Record<ApplicationKind, FormConfig>;
}

export interface PublicApplicationPayload {
  kind: ApplicationKind;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  applying_for_class?: string;
  previous_school?: string;
  guardian_name?: string;
  guardian_phone?: string;
  guardian_email?: string;
  applying_for_role?: string;
  job_title?: string;
  qualification?: string;
  years_of_experience?: number;
  /** Answers to the school's own questions; a multiple-choice question sends a list. */
  custom_answers?: Record<string, string | string[]>;
  /** Uploads answering the school's own file questions, by question key. */
  custom_files?: Record<string, File[]>;
  documents?: File[];
}
