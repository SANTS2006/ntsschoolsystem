export type StudentStatus =
  | "applicant"
  | "admitted"
  | "active"
  | "transferred"
  | "graduated"
  | "withdrawn"
  | "archived";

export type StudentGender = "male" | "female" | "other" | "";

export interface Student {
  id: string;
  user: string | null;
  admission_number: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string | null;
  gender: StudentGender;
  photo: string | null;
  address: string;
  previous_school: string;
  admission_date: string | null;
  status: StudentStatus;
  current_academic_year: string | null;
  current_academic_year_name: string | null;
  current_class: string | null;
  current_class_name: string | null;
  current_section: string | null;
  current_section_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: StudentStatus;
  current_class?: string;
  current_section?: string;
  ordering?: string;
}

/** The wire payload sent to the API — optional fields are genuinely omitted (never sent
 * as ""), since DRF's DateField/relation fields reject an empty string as "wrong format"
 * rather than treating it as null. */
export interface StudentPayload {
  admission_number: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  status: StudentStatus;
  date_of_birth?: string;
  gender?: StudentGender;
  address?: string;
  previous_school?: string;
  admission_date?: string;
  current_academic_year?: string;
  current_class?: string;
  current_section?: string;
  /** A newly-picked file, when the user changed the photo in the form. Omitted (not sent
   * as an empty value) when the photo is left unchanged. */
  photo?: File;
}
