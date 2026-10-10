import type { AudienceFromApi, AudiencePayload } from "@/features/audience/audience";
export type TargetType =
  | "school"
  | "class"
  | "section"
  | "department"
  | "staff"
  | "students"
  | "parents"
  | "specific_users";

/** `published_by`/`published_by_name`/`published_at` are server-computed — set only by the
 * `publish` action (or left `null` for a draft that hasn't been published yet), never
 * client-writable. */
export interface Announcement extends AudienceFromApi {
  id: string;
  title: string;
  body: string;
  image: string | null;
  target_type: TargetType;
  target_class: string | null;
  target_class_name: string | null;
  target_section: string | null;
  target_section_name: string | null;
  target_department: string | null;
  target_department_name: string | null;
  send_email: boolean;
  created_by: string | null;
  created_by_name: string | null;
  /** True when the viewer created it — only the creator may edit, delete or publish it. */
  is_mine: boolean;
  published_by: string | null;
  published_by_name: string | null;
  published_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementPayload extends Partial<AudiencePayload> {
  title: string;
  body: string;
  /** Required when creating; omit on edit to keep the current image. */
  image?: File;
  target_type?: TargetType;
  target_class?: string;
  target_section?: string;
  target_department?: string;
  send_email?: boolean;
  is_active?: boolean;
}

export interface AnnouncementListParams {
  target_type?: TargetType;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface AnnouncementRecipient {
  id: string;
  announcement: string;
  user: string;
  user_name: string;
}

export interface AnnouncementRecipientPayload {
  announcement: string;
  user: string;
}

export interface AnnouncementRecipientListParams {
  announcement?: string;
  page?: number;
  page_size?: number;
}
