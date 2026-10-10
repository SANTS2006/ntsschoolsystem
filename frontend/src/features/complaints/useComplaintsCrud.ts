import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  assignComplaint,
  createComplaint,
  createComplaintResponse,
  fetchAddressableStaff,
  fetchComplaintResponses,
  fetchComplaints,
  getComplaint,
  rejectComplaint,
  resolveComplaint,
} from "./api";
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

const COMPLAINTS_KEY = ["complaints", "records"] as const;
const RESPONSES_KEY = ["complaints", "responses"] as const;

export function useComplaintList(params: PageParams & ComplaintListParams) {
  return useQuery({
    queryKey: [...COMPLAINTS_KEY, "list", params],
    queryFn: () => fetchComplaints(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useComplaint(id: string | undefined) {
  return useQuery<Complaint, ApiError>({
    queryKey: [...COMPLAINTS_KEY, "detail", id],
    queryFn: () => getComplaint(id as string),
    enabled: !!id,
  });
}

export function useCreateComplaint() {
  const queryClient = useQueryClient();
  return useMutation<Complaint, ApiError, ComplaintPayload>({
    mutationFn: createComplaint,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY }),
  });
}

function invalidateComplaint(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
  queryClient.invalidateQueries({ queryKey: [...COMPLAINTS_KEY, "detail", id] });
}

export function useAssignComplaint() {
  const queryClient = useQueryClient();
  return useMutation<Complaint, ApiError, { id: string; assignedTo: string }>({
    mutationFn: ({ id, assignedTo }) => assignComplaint(id, assignedTo),
    onSuccess: (_data, { id }) => invalidateComplaint(queryClient, id),
  });
}

export function useResolveComplaint() {
  const queryClient = useQueryClient();
  return useMutation<Complaint, ApiError, { id: string; resolutionNotes: string }>({
    mutationFn: ({ id, resolutionNotes }) => resolveComplaint(id, resolutionNotes),
    onSuccess: (_data, { id }) => invalidateComplaint(queryClient, id),
  });
}

export function useRejectComplaint() {
  const queryClient = useQueryClient();
  return useMutation<Complaint, ApiError, { id: string; resolutionNotes: string }>({
    mutationFn: ({ id, resolutionNotes }) => rejectComplaint(id, resolutionNotes),
    onSuccess: (_data, { id }) => invalidateComplaint(queryClient, id),
  });
}

export function useComplaintResponses(complaintId: string | undefined) {
  return useQuery<ComplaintResponse[], ApiError>({
    queryKey: [...RESPONSES_KEY, complaintId],
    queryFn: () => fetchComplaintResponses(complaintId as string),
    enabled: !!complaintId,
  });
}

export function useAddressableStaff() {
  return useQuery<AddressableStaffMember[], ApiError>({
    queryKey: ["complaints", "addressable-staff"],
    queryFn: fetchAddressableStaff,
  });
}

export function useCreateComplaintResponse() {
  const queryClient = useQueryClient();
  return useMutation<ComplaintResponse, ApiError, ComplaintResponsePayload>({
    mutationFn: createComplaintResponse,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSES_KEY, response.complaint] });
    },
  });
}
