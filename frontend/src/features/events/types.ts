import type { AudienceFromApi, AudiencePayload } from "@/features/audience/audience";
/** Audience-targeting shape mirrors `features/communications`'s `TargetType` exactly — same
 * backend enum, same meaning (Class/Section narrow "Students"/"Parents", Department narrows
 * "Staff", ignored by other audiences). */
export type TargetType =
  | "school"
  | "class"
  | "section"
  | "department"
  | "staff"
  | "students"
  | "parents"
  | "specific_users";

/** The built-in categories; a school can add more through "Other", so the value itself is any string. */
export type BuiltinEventCategory = "academic" | "sports" | "cultural" | "meeting" | "holiday" | "other";
export type EventCategory = string;
export type EventStatus = "draft" | "published" | "cancelled";

export interface Event extends AudienceFromApi {
  id: string;
  title: string;
  description: string;
  image: string | null;
  category: EventCategory;
  category_label: string;
  start_datetime: string;
  end_datetime: string;
  location: string;
  capacity: number | null;
  registered_count: number;
  /** Optional deadline; registration closes by itself then (and always when the event ends). */
  registration_closes_at: string | null;
  /** The creator closed registration by hand. */
  registration_closed: boolean;
  registration_state: "open" | "not_published" | "ended" | "closed" | "deadline";
  registration_open: boolean;
  /** True when the viewer created it — only the creator may edit, publish, cancel or delete it. */
  is_mine: boolean;
  status: EventStatus;
  target_type: TargetType;
  target_class: string | null;
  target_class_name: string | null;
  target_section: string | null;
  target_section_name: string | null;
  target_department: string | null;
  target_department_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventPayload extends Partial<AudiencePayload> {
  title: string;
  description?: string;
  /** Required when creating; omit on edit to keep the current image. */
  image?: File;
  category: EventCategory;
  start_datetime: string;
  end_datetime: string;
  location?: string;
  capacity?: number;
  /** ISO time; an empty string removes the deadline. */
  registration_closes_at?: string;
  target_type?: TargetType;
  target_class?: string;
  target_section?: string;
  target_department?: string;
}

export interface EventListParams {
  category?: EventCategory;
  status?: EventStatus;
  target_type?: TargetType;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface EventRegistrationStatus {
  id: string;
  event: string;
  event_title: string;
  user: string;
  user_name: string;
  status: "registered" | "cancelled" | "attended";
  registered_at: string;
}

export interface EventRecipient {
  id: string;
  event: string;
  user: string;
  user_name: string;
}

export interface EventRecipientPayload {
  event: string;
  user: string;
}

export interface EventRecipientListParams {
  event?: string;
  page?: number;
  page_size?: number;
}

export type EventMediaType = "photo" | "video";

export interface EventMedia {
  id: string;
  event: string;
  event_title: string;
  media_type: EventMediaType;
  file: string;
  caption: string;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface EventMediaPayload {
  event: string;
  media_type: EventMediaType;
  caption?: string;
  file: File;
}
