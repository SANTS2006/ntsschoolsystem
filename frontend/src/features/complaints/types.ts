/** The built-in categories; a school can add more through "Other", so the value itself is any string. */
export type BuiltinComplaintCategory = "academic" | "facility" | "behavioral" | "administrative" | "other";
export type ComplaintCategory = string;
export type ComplaintPriority = "low" | "normal" | "high";
export type ComplaintStatus = "submitted" | "under_review" | "resolved" | "rejected";

/** `submitted_by`/`submitted_by_name` come back `null` whenever `is_anonymous` is true and the
 * viewer isn't the submitter themselves — even for staff. There is no way to un-mask it from the
 * frontend; that's enforced server-side. */
export interface Complaint {
  id: string;
  submitted_by: string | null;
  submitted_by_name: string | null;
  category: ComplaintCategory;
  category_label: string;
  subject: string;
  description: string;
  image: string | null;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  is_anonymous: boolean;
  addressed_to: string | null;
  addressed_to_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  resolution_notes: string;
  resolved_at: string | null;
  /** Server-computed for the viewer: handler, not the author, and the addressee when one is named. */
  can_act: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComplaintPayload {
  category: ComplaintCategory;
  subject: string;
  description: string;
  image?: File;
  priority: ComplaintPriority;
  is_anonymous?: boolean;
  addressed_to?: string;
}

export interface AddressableStaffMember {
  id: string;
  name: string;
}

export interface ComplaintListParams {
  category?: ComplaintCategory;
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface ComplaintResponse {
  id: string;
  complaint: string;
  author: string;
  author_name: string;
  message: string;
  created_at: string;
}

export interface ComplaintResponsePayload {
  complaint: string;
  message: string;
}
