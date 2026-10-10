export type IdCardHolderType = "student" | "staff";
export type IdCardStatus = "active" | "revoked" | "replaced";

/** Details frozen on the card at issue time. Student and staff cards carry different keys. */
export interface IdCardPayload {
  name: string;
  number: string;
  role: string;
  class?: string;
  section?: string;
  date_of_birth?: string;
  gender?: string;
  job_title?: string;
  department?: string;
  email?: string;
  phone?: string;
}

export interface IdCard {
  id: string;
  holder_type: IdCardHolderType;
  holder_id: string;
  holder_name: string;
  card_number: string;
  status: IdCardStatus;
  is_valid: boolean;
  issued_at: string;
  expires_at: string | null;
  payload: IdCardPayload;
  qr_svg: string;
  photo: string;
  verify_url: string;
  school_name: string;
  school_logo: string;
}

export interface IdCardListParams {
  page?: number;
  page_size?: number;
  search?: string;
  holder_type?: IdCardHolderType;
  status?: IdCardStatus;
  ordering?: string;
}

export interface IssueCardPayload {
  holder_type: IdCardHolderType;
  holder_id: string;
  expires_at?: string | null;
}

export interface BulkIssuePayload {
  holder_type: IdCardHolderType;
  school_class?: string | null;
}

export interface BulkIssueResult {
  issued: number;
  skipped: { name: string; reason: string }[];
}

/** What a public QR scan returns — deliberately minimal, no contact or birth details. */
export interface CardVerification {
  valid: boolean;
  status: IdCardStatus;
  reason: string;
  holder_type: IdCardHolderType;
  name: string;
  role: string;
  number: string;
  card_number: string;
  school_name: string;
  expires_at: string | null;
  photo: string;
}
