export type SubmissionStatus = "submitted" | "late" | "graded";

/** `teacher`/`teacher_name` are server-computed — set from `request.user.staff_profile` on
 * create, never client-writable. `submission_count` is a read-only aggregate. */
export interface Assignment {
  id: string;
  title: string;
  description: string;
  school_class: string;
  school_class_name: string;
  section: string | null;
  section_name: string | null;
  subject: string;
  subject_name: string;
  teacher: string;
  teacher_name: string;
  due_date: string;
  max_score: string;
  attachment: string | null;
  is_active: boolean;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export interface AssignmentPayload {
  title: string;
  description?: string;
  school_class: string;
  section?: string;
  subject: string;
  due_date: string;
  max_score?: string;
  attachment?: File;
  is_active?: boolean;
}

export interface AssignmentListParams {
  school_class?: string;
  section?: string;
  subject?: string;
  teacher?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

/** `submitted_at`/`status`/`score`/`feedback`/`graded_by`/`graded_at` are all server-computed —
 * grading happens only through the dedicated `grade` action, never a plain PATCH. */
export interface AssignmentSubmission {
  id: string;
  assignment: string;
  assignment_title: string;
  student: string;
  student_name: string;
  submitted_at: string;
  attachment: string;
  status: SubmissionStatus;
  score: string | null;
  feedback: string;
  graded_by: string | null;
  graded_by_name: string | null;
  graded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentSubmissionListParams {
  assignment?: string;
  student?: string;
  status?: SubmissionStatus;
  page?: number;
  page_size?: number;
}

export interface GradeSubmissionPayload {
  score: string;
  feedback?: string;
}
