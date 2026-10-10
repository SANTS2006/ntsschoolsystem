export type OwnerType = "school" | "student" | "staff";

export interface DocumentCategory {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentCategoryPayload {
  name: string;
  description?: string;
}

export interface DocumentCategoryListParams {
  page?: number;
  page_size?: number;
}

/** `uploaded_by`/`uploaded_by_name` are server-computed — set from `request.user` on create,
 * never client-writable. `file` is a plain Django `FileField` (not Cloudinary) — write as
 * multipart/form-data, read back as a media URL string. */
export interface Document {
  id: string;
  /** You uploaded it — only then can you edit or delete it. */
  is_mine: boolean;
  title: string;
  description: string;
  category: string | null;
  category_name: string | null;
  owner_type: OwnerType;
  student: string | null;
  student_name: string | null;
  staff: string | null;
  staff_name: string | null;
  file: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  is_confidential: boolean;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentPayload {
  title: string;
  description?: string;
  category?: string;
  owner_type: OwnerType;
  student?: string;
  staff?: string;
  file?: File;
  is_confidential?: boolean;
  expiry_date?: string;
}

export interface DocumentListParams {
  category?: string;
  owner_type?: OwnerType;
  student?: string;
  staff?: string;
  is_confidential?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}
