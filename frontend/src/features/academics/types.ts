export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_archived: boolean;
  archived_at: string | null;
  /** upcoming | active | closed — derived by the server from the two flags above. */
  status: "upcoming" | "active" | "closed";
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcademicYearPayload {
  name: string;
  start_date: string;
  end_date: string;
}

/** `sequence` is the explicit 1st/2nd/3rd ordering within the academic year — independent of
 * `start_date`, which is fragile if a school ever needs to back-date or reorder a term. Unique
 * per academic year (enforced both DB-side and in the serializer's `validate()`, since a
 * Meta.constraints entry never gets DRF's automatic unique-together validator). */
export interface Term {
  id: string;
  academic_year: string;
  academic_year_name: string;
  name: string;
  sequence: number;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface TermPayload {
  academic_year: string;
  name: string;
  sequence: number;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface TermListParams {
  academic_year?: string;
  is_current?: boolean;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface DepartmentPayload {
  name: string;
  code?: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  departments: string[];
  department_names: string[];
  created_at: string;
  updated_at: string;
}

export interface SubjectPayload {
  name: string;
  code?: string;
  departments?: string[];
}

export interface SubjectListParams {
  departments?: string;
}

export type SubjectOfferingStatus = "active" | "inactive";
export type CAStatus = "open" | "closed";

/** Phase 3 (Subjects & Results): `Subject` above is the school-wide catalog entry ("Mathematics"
 * exists once per school); `SubjectOffering` is that subject *as taught* — to one class, for one
 * term of one year, by one main teacher (+ optional assistant), with its own CA/Exam split and
 * pass mark. One teacher can hold any number of offerings; nothing here limits that. */
export interface SubjectOffering {
  id: string;
  subject: string;
  subject_name: string;
  academic_year: string;
  academic_year_name: string;
  term: string;
  term_name: string;
  school_class: string;
  school_class_name: string;
  main_teacher: string;
  main_teacher_name: string;
  assistant_teacher: string | null;
  assistant_teacher_name: string | null;
  ca_weight_percent: number;
  exam_weight_percent: number;
  pass_mark: number;
  exam_max_score: string;
  status: SubjectOfferingStatus;
  ca_status: CAStatus;
  ca_closed_at: string | null;
  cover_image: string | null;
  ca_allocated_percent: number;
  ca_remaining_percent: number;
  /** The signed-in user is a teacher assigned to this subject. */
  is_my_subject: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubjectOfferingPayload {
  subject: string;
  academic_year: string;
  term: string;
  school_class: string;
  main_teacher: string;
  assistant_teacher?: string | null;
  ca_weight_percent: number;
  exam_weight_percent: number;
  pass_mark: number;
  status?: SubjectOfferingStatus;
}

export interface SubjectOfferingListParams {
  subject?: string;
  academic_year?: string;
  term?: string;
  school_class?: string;
  main_teacher?: string;
  status?: SubjectOfferingStatus;
  search?: string;
}

/** Phase 4 (Subjects & Results): explicit record that a student takes a given SubjectOffering —
 * never assumed automatically from class membership (electives/streams mean not every student in
 * a class takes every subject offered to it). */
export interface StudentSubjectEnrollment {
  id: string;
  subject_offering: string;
  subject_name: string;
  school_class_name: string;
  term_name: string;
  main_teacher_name: string;
  assistant_teacher_name: string | null;
  ca_weight_percent: number;
  exam_weight_percent: number;
  pass_mark: number;
  student: string;
  student_name: string;
  student_admission_number: string;
  created_at: string;
}

export interface StudentSubjectEnrollmentPayload {
  subject_offering: string;
  student: string;
}

export interface StudentSubjectEnrollmentListParams {
  subject_offering?: string;
  student?: string;
  search?: string;
}

export type AssessmentStatus = "active" | "inactive";

/** Phase 5 (Subjects & Results): one CA component of a SubjectOffering (e.g. "Assignment 1",
 * "Mid-Term Test", or any custom name) — `weight` is its share of the offering's CA percentage. */
/** off = takes no uploads; open = students can upload now; closed = the deadline has passed. */
export type UploadState = "off" | "open" | "closed";

export interface Assessment {
  id: string;
  subject_offering: string;
  subject_offering_name: string;
  school_class_name: string;
  term_name: string;
  name: string;
  weight: number;
  /** Part of `weight` the teacher reserves to award by hand per student. */
  discretionary_weight: number;
  max_score: string;
  status: AssessmentStatus;
  /** Students hand in files for this assessment (an assignment, a lab report...). */
  allow_file_uploads: boolean;
  /** Uploads stop at this moment (ISO); null = no cut-off. */
  upload_deadline: string | null;
  upload_instructions: string;
  upload_state: UploadState;
  created_at: string;
  updated_at: string;
}

export interface AssessmentPayload {
  subject_offering: string;
  name: string;
  weight: number;
  discretionary_weight?: number;
  max_score: number | string;
  status?: AssessmentStatus;
  allow_file_uploads?: boolean;
  upload_deadline?: string | null;
  upload_instructions?: string;
}

export interface AssessmentListParams {
  subject_offering?: string;
  status?: AssessmentStatus;
  search?: string;
}

export type AssessmentScoreStatus = "draft" | "submitted";

export interface AssessmentScoreRow {
  student: string;
  student_name: string;
  student_admission_number: string;
  raw_score: string | null;
  discretionary_mark: string | null;
  weighted_score: string | null;
  status: AssessmentScoreStatus;
}

export interface AssessmentScoresResponse {
  rows: AssessmentScoreRow[];
  max_score: string;
  weight: number;
  discretionary_weight: number;
}

export interface SaveAssessmentScoresPayload {
  entries: { student: string; raw_score: number | string | null; discretionary_mark?: number | string | null }[];
  submit: boolean;
}

export interface SubmittedFile {
  id: string;
  name: string;
  url: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface AssessmentSubmissionRow {
  student: string;
  student_name: string;
  student_admission_number: string;
  files: SubmittedFile[];
  submitted_at: string | null;
  raw_score: string | null;
  score_status: AssessmentScoreStatus | null;
}

export interface AssessmentSubmissions {
  assessment: string;
  name: string;
  max_score: string;
  allow_file_uploads: boolean;
  upload_state: UploadState;
  upload_deadline: string | null;
  rows: AssessmentSubmissionRow[];
  submitted_count: number;
  student_count: number;
}

export interface MySubjectCAAssessment {
  allow_file_uploads: boolean;
  upload_state: UploadState;
  upload_deadline: string | null;
  /** The deadline written out in the school's time zone, for display. */
  upload_deadline_text: string;
  upload_instructions: string;
  max_files: number;
  my_files: SubmittedFile[];
  assessment: string;
  name: string;
  weight: number;
  discretionary_weight: number;
  max_score: string;
  raw_score: string | null;
  discretionary_mark: string | null;
  weighted_score: string | null;
}

export interface MySubjectCA {
  assessments: MySubjectCAAssessment[];
  total_ca: string | null;
}

export type PassStatus = "pass" | "near_pass" | "fail" | "incomplete";

/** Phase 6 (Subjects & Results): one student's exam score plus the deterministic breakdown
 * computed server-side — CA/exam contributions, Final Subject Score, and pass status. Never
 * recomputed in the frontend; this is exactly what the backend returned. */
export interface SubjectResultRow {
  student: string;
  student_name: string;
  student_admission_number: string;
  exam_score: string | null;
  ca_contribution: string | null;
  exam_contribution: string | null;
  final_score: string | null;
  pass_status: PassStatus;
  /** Letter from the school's grading scale (null until the subject is fully graded). */
  letter_grade: string | null;
  /** Grade points for that letter — tertiary schools only. */
  grade_points: string | null;
}

export interface SubjectResultsResponse {
  rows: SubjectResultRow[];
  exam_max_score: string;
  pass_mark: number;
  is_tertiary: boolean;
  grade_point_scale: string;
}

export interface SaveSubjectResultsPayload {
  entries: { student: string; exam_score: number | string | null }[];
}

/** Phase 7 (Subjects & Results): one student's rank within a class for one term — standard
 * competition ranking (ties share a position; the next distinct score skips ahead). Only
 * students with a fully-computed Term Percentage appear here at all. */
export interface ClassTermResultRow {
  student: string;
  student_name: string;
  student_admission_number: string;
  term_percentage: string;
  position: number;
}

/** One student's Overall % (average Term Percentage across every term of the academic year) —
 * `null` until every term is complete. Present for every student currently in the class,
 * regardless of completeness, unlike the term-results ranking above. */
export interface ClassOverallResultRow {
  student: string;
  student_name: string;
  student_admission_number: string;
  overall_percent: string | null;
  threshold_percent: number;
  is_public_exam_transition: boolean;
}

export type PromotionStatus = "promoted" | "repeated" | "public_exam_required";
export type PromotionType = "normal" | "public_exam" | "manual";
export type ExternalExamStatus = "not_applicable" | "pending" | "passed" | "failed";

/** Append-only — a PromotionRecord is never edited after creation, so this type has no
 * corresponding "update payload." */
export interface PromotionRecord {
  id: string;
  student: string;
  student_name: string;
  student_admission_number: string;
  previous_class: string;
  previous_class_name: string;
  previous_academic_year: string;
  previous_academic_year_name: string;
  new_class: string | null;
  new_class_name: string | null;
  new_academic_year: string | null;
  new_academic_year_name: string | null;
  overall_percent: string | null;
  threshold_percent: number;
  status: PromotionStatus;
  type: PromotionType;
  external_exam_status: ExternalExamStatus;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface PromotionRecordListParams {
  student?: string;
  previous_academic_year?: string;
  previous_class?: string;
  status?: PromotionStatus;
  type?: PromotionType;
}

export interface BulkPromotePayload {
  school_class: string;
  academic_year: string;
  target_academic_year: string;
  student_ids?: string[];
}

export interface ManualPromotePayload {
  student: string;
  new_class: string;
  new_academic_year: string;
  status: "promoted" | "repeated";
  external_exam_status: "passed" | "failed";
}

/** Phase 8 (Subjects & Results): the publication gate for one student's results in one
 * class/term. DRAFT/IN_PROGRESS/READY_FOR_REVIEW advance automatically from data completeness;
 * VERIFIED/PUBLISHED/LOCKED only ever change through an explicit, audited action. */
export type TermResultPublicationStatus =
  | "draft"
  | "in_progress"
  | "ready_for_review"
  | "verified"
  | "published"
  | "locked";

export interface TermResultPublication {
  id: string;
  student: string;
  student_name: string;
  student_admission_number: string;
  school_class: string;
  school_class_name: string;
  term: string;
  term_name: string;
  status: TermResultPublicationStatus;
  verified_at: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  published_at: string | null;
  published_by: string | null;
  published_by_name: string | null;
  locked_at: string | null;
  locked_by: string | null;
  locked_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermResultPublicationListParams {
  student?: string;
  school_class?: string;
  term?: string;
  status?: TermResultPublicationStatus;
}

export interface BulkResultTransitionPayload {
  school_classes: string[];
  term: string;
  student_ids?: string[];
}

export interface BulkResultTransitionResult {
  processed_count: number;
  skipped_count: number;
}

/** One subject line in a term result report — CA/Exam/Final/Pass-Mark/Remark, exactly as
 * computed server-side (Phase 6). Never recomputed in the frontend. */
export interface TermReportSubject {
  subject_name: string;
  ca_contribution: string | null;
  exam_contribution: string | null;
  final_score: string | null;
  pass_mark: number;
  pass_status: PassStatus;
  letter_grade: string | null;
  grade_points: string | null;
}

export interface TermReport {
  student_name?: string;
  school_class_name: string;
  term_name: string;
  subjects: TermReportSubject[];
  total_subjects: number;
  passed: number;
  failed: number;
  term_percentage: string | null;
  position: number | null;
  threshold_percent: number;
  overall_percent: string | null;
  promotion_status: PromotionStatus | null;
  /** Tertiary institutions also get a grade-point average on the scale the school chose. */
  is_tertiary: boolean;
  grade_point_scale: string | null;
  term_gpa: string | null;
}

export interface MyResultSummary {
  id: string;
  school_class: string;
  school_class_name: string;
  term: string;
  term_name: string;
  academic_year_name: string;
  published_at: string;
}

/** Phase 9 (Subjects & Results): a file a subject's teacher shares with its enrolled students —
 * reuses the same shared upload allowlist as every other attachment in this app. */
export interface SubjectMaterial {
  id: string;
  subject_offering: string;
  subject_offering_name: string;
  school_class_name: string;
  title: string;
  file: string;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}

export interface SubjectMaterialPayload {
  subject_offering: string;
  title: string;
  file: File;
}

/** A general broadcast message from a subject's teacher to every enrolled student — never a
 * one-to-one conversation (see SubjectPrivateMessage for that). */
export interface SubjectMessage {
  id: string;
  subject_offering: string;
  subject_offering_name: string;
  sender: string;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface SubjectMessagePayload {
  subject_offering: string;
  body: string;
}

/** One message in a private thread between a subject's teacher and exactly one enrolled
 * student. `student` identifies which thread it belongs to; `sender` is whoever wrote it. */
export interface SubjectPrivateMessage {
  id: string;
  subject_offering: string;
  subject_offering_name: string;
  student: string;
  student_name: string;
  sender: string;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface SubjectPrivateMessagePayload {
  subject_offering: string;
  student: string;
  body: string;
}

/** Phase 10 (Subjects & Results): graduation eligibility derived entirely from the school's own
 * configured is_graduation_level class(es) and the student's actual promotion history — never a
 * hard-coded number of levels. */
export interface GraduationStatus {
  current_class: string | null;
  current_class_name: string | null;
  is_in_graduation_level: boolean;
  has_graduated: boolean;
  graduated_at: string | null;
  history: PromotionRecord[];
}

/** `next_class` is the school-configured progression edge the promotion engine (Phase 7) walks
 * — null for a class with no configured successor yet, or a terminal class. `order` stays a
 * purely cosmetic display-sort value; it is never used for promotion logic. */
export interface SchoolClass {
  id: string;
  name: string;
  order: number;
  next_class: string | null;
  next_class_name: string | null;
  is_public_exam_transition: boolean;
  is_graduation_level: boolean;
  created_at: string;
  updated_at: string;
}

export interface SchoolClassPayload {
  name: string;
  order: number;
  next_class?: string | null;
  is_public_exam_transition?: boolean;
  is_graduation_level?: boolean;
}

export interface Section {
  id: string;
  school_class: string;
  school_class_name: string;
  academic_year: string;
  academic_year_name: string;
  name: string;
  class_teacher: string | null;
  class_teacher_name: string | null;
  capacity: number;
  created_at: string;
  updated_at: string;
}

export interface SectionPayload {
  school_class: string;
  academic_year: string;
  name: string;
  capacity: number;
  class_teacher?: string;
}

export interface SectionListParams {
  school_class?: string;
  academic_year?: string;
}
