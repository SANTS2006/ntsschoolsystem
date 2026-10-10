export type MaterialType = "document" | "video";

export type LessonTargetType = "class_section" | "specific_students";

/** `teacher`/`teacher_name` are server-computed from `request.user.staff_profile` on create,
 * never client-writable. `material_count` is a read-only aggregate. `school_class`/`section`
 * stay populated regardless of `target_type` — a lesson still belongs to a subject+class
 * contextually for grading/reporting; `target_type` only changes who *receives* it (see
 * `MyLessonsView`'s backend docstring). `specific_students`'s actual recipient list lives in
 * `LessonEnrollment`, not on this object. */
export interface Lesson {
  id: string;
  title: string;
  description: string;
  subject: string;
  subject_name: string;
  school_class: string;
  school_class_name: string;
  section: string | null;
  section_name: string | null;
  teacher: string;
  teacher_name: string;
  is_active: boolean;
  target_type: LessonTargetType;
  material_count: number;
  created_at: string;
  updated_at: string;
}

export interface LessonPayload {
  title: string;
  description?: string;
  subject: string;
  school_class: string;
  section?: string;
  is_active?: boolean;
  target_type?: LessonTargetType;
}

export interface LessonListParams {
  subject?: string;
  school_class?: string;
  section?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

/** Only populated when the parent Lesson's `target_type` is `specific_students` — see
 * `LessonEnrollment`'s backend docstring. */
export interface LessonEnrollment {
  id: string;
  lesson: string;
  lesson_title: string;
  student: string;
  student_name: string;
}

export interface LessonEnrollmentPayload {
  lesson: string;
  student: string;
}

export interface LessonMaterial {
  id: string;
  lesson: string;
  lesson_title: string;
  material_type: MaterialType;
  title: string;
  file: string;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface LessonMaterialPayload {
  lesson: string;
  material_type: MaterialType;
  title: string;
  file: File;
}

/** Student self-service shape — the staff-side `Lesson` fields plus the materials nested
 * inline (the staff `LessonSerializer` only exposes a count, since a list page doesn't need
 * every file; MyLessonsView embeds the full list since a student needs to open them). */
export interface MyLesson extends Lesson {
  materials: LessonMaterial[];
}
