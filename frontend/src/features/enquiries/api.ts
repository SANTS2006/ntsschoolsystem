import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

export interface Enquiry {
  id: string;
  kind: "demo" | "contact";
  name: string;
  email: string;
  phone: string;
  organization: string;
  school_type: string;
  student_count: string;
  interests: string[];
  preferred_contact: string;
  topic: string;
  message: string;
  handled: boolean;
  email_status: "pending" | "sent" | "failed" | "not_configured";
  created_at: string;
}

export interface EnquiryListParams {
  page?: number;
  page_size?: number;
  handled?: boolean;
  kind?: string;
}

export async function fetchEnquiries(params: EnquiryListParams): Promise<PaginatedResponse<Enquiry>> {
  const { data } = await apiClient.get<PaginatedResponse<Enquiry>>("/platform/enquiries/", { params });
  return data;
}

export async function setEnquiryHandled(id: string, handled: boolean): Promise<Enquiry> {
  const { data } = await apiClient.patch<Enquiry>(`/platform/enquiries/${id}/`, { handled });
  return data;
}
