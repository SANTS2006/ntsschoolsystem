/** Enough of the Staff record to populate a dropdown (e.g. "class teacher" on a Section). */
export interface StaffLookup {
  id: string;
  full_name: string;
}

export type EmploymentStatus = "active" | "on_leave" | "terminated";

export interface Staff {
  id: string;
  user: string;
  full_name: string;
  email: string;
  photo: string | null;
  is_online: boolean;
  staff_id: string;
  department: string | null;
  department_name: string | null;
  job_title: string;
  qualification: string;
  hire_date: string | null;
  employment_status: EmploymentStatus;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  roles: { id: string; name: string; slug: string }[];
  created_at: string;
  updated_at: string;
}

export interface StaffListParams {
  page?: number;
  page_size?: number;
  search?: string;
  department?: string;
  employment_status?: EmploymentStatus;
  /** RBAC role slug (e.g. "teacher") — narrows to staff holding that role. Not a Staff field
   * itself (roles live on the linked User), handled server-side. */
  role?: string;
  ordering?: string;
}

/** `employment_status` is deliberately absent — the backend marks it read-only everywhere;
 * it only ever changes via the dedicated terminate (`DELETE`) / reactivate (`enable`) actions.
 * `user` is required on create (a Staff row can't exist without one) but omitted on update —
 * the link to a User is immutable from this form once the profile exists. */
export interface StaffPayload {
  user?: string;
  staff_id?: string;
  department?: string;
  job_title?: string;
  qualification?: string;
  hire_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  /** Written through to the linked User's own photo field — `Staff` has no photo of its own.
   * Sent to the backend as `photo_upload` (see `api.ts`'s `toRequestBody`), since `photo` on the
   * wire is a separate read-only field mirroring `user.photo`. */
  photo?: File;
}
