import { apiClient } from "@/lib/api-client";
import { toFormData } from "@/lib/formData";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  AddressableStaffMember,
  Complaint,
  ComplaintListParams,
  ComplaintPayload,
  ComplaintResponse,
  ComplaintResponsePayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchComplaints(
  params: PageParams & ComplaintListParams,
): Promise<PaginatedResponse<Complaint>> {
  const { data } = await apiClient.get<PaginatedResponse<Complaint>>("/complaints/", { params });
  return data;
}

export async function getComplaint(id: string): Promise<Complaint> {
  const { data } = await apiClient.get<Complaint>(`/complaints/${id}/`);
  return data;
}

export async function createComplaint(values: ComplaintPayload): Promise<Complaint> {
  const { data } = await apiClient.post<Complaint>("/complaints/", toFormData(values));
  return data;
}

export async function assignComplaint(id: string, assignedTo: string): Promise<Complaint> {
  const { data } = await apiClient.post<{ complaint: Complaint }>(`/complaints/${id}/assign/`, {
    assigned_to: assignedTo,
  });
  return data.complaint;
}

export async function resolveComplaint(id: string, resolutionNotes: string): Promise<Complaint> {
  const { data } = await apiClient.post<{ complaint: Complaint }>(`/complaints/${id}/resolve/`, {
    resolution_notes: resolutionNotes,
  });
  return data.complaint;
}

export async function rejectComplaint(id: string, resolutionNotes: string): Promise<Complaint> {
  const { data } = await apiClient.post<{ complaint: Complaint }>(`/complaints/${id}/reject/`, {
    resolution_notes: resolutionNotes,
  });
  return data.complaint;
}

export async function fetchComplaintResponses(complaintId: string): Promise<ComplaintResponse[]> {
  const { data } = await apiClient.get<PaginatedResponse<ComplaintResponse>>("/complaint-responses/", {
    params: { complaint: complaintId, page_size: 100 },
  });
  return data.results;
}

export async function createComplaintResponse(values: ComplaintResponsePayload): Promise<ComplaintResponse> {
  const { data } = await apiClient.post<ComplaintResponse>("/complaint-responses/", values);
  return data;
}

export async function fetchAddressableStaff(): Promise<AddressableStaffMember[]> {
  const { data } = await apiClient.get<{ staff: AddressableStaffMember[] }>("/complaints/addressable-staff/");
  return data.staff;
}
