export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";
export type InviteeKind = "staff" | "parent" | "student";
export type EmailStatus = "pending" | "sent" | "failed" | "no_email";

export interface InviteeCounts {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  no_email: number;
}

export interface Meeting {
  id: string;
  /** You scheduled it — only then can you start, end, cancel or change it. */
  is_mine: boolean;
  title: string;
  agenda: string;
  scheduled_start: string;
  duration_minutes: number;
  host_name: string;
  status: MeetingStatus;
  include_all_staff: boolean;
  include_all_parents: boolean;
  include_all_students: boolean;
  audience: string;
  invitee_counts: InviteeCounts;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface Invitee {
  id: string;
  kind: InviteeKind;
  name: string;
  email: string;
  email_status: EmailStatus;
  emailed_at: string | null;
}

export interface MeetingDetail extends Meeting {
  invitees: Invitee[];
}

export interface MeetingListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: MeetingStatus;
  ordering?: string;
}

/** Who a meeting is for. Each group is everyone in it and/or hand-picked individuals. */
export interface MeetingAudience {
  include_all_staff: boolean;
  include_all_parents: boolean;
  include_all_students: boolean;
  staff_ids: string[];
  guardian_ids: string[];
  student_ids: string[];
}

export interface MeetingCreatePayload extends MeetingAudience {
  title: string;
  agenda: string;
  scheduled_start: string;
  duration_minutes: number;
}

export interface AudiencePreview {
  total: number;
  by_kind: Record<InviteeKind, number>;
  without_email: number;
}

export interface MeetingJoin {
  meeting: Meeting;
  room_url: string;
}
