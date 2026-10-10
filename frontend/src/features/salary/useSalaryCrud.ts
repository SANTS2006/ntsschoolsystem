import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createSalaryStructure,
  createSalaryStructureItem,
  createStaffSalaryAssignment,
  deleteSalaryStructure,
  deleteSalaryStructureItem,
  deleteStaffSalaryAssignment,
  fetchSalaryPayments,
  fetchSalaryStructureItems,
  fetchSalaryStructures,
  fetchStaffSalaryAssignments,
  generateSalaryPayments,
  getSalaryPayment,
  getSalaryStructure,
  getSalaryStructureItem,
  getStaffSalaryAssignment,
  paySalaryPayment,
  updateSalaryStructure,
  updateSalaryStructureItem,
  updateStaffSalaryAssignment,
} from "./api";
import type {
  GenerateSalaryPaymentsPayload,
  GenerateSalaryPaymentsResponse,
  RecordSalaryPaymentPayload,
  SalaryPayment,
  SalaryPaymentListParams,
  SalaryStructure,
  SalaryStructureItem,
  SalaryStructureItemPayload,
  SalaryStructureListParams,
  SalaryStructurePayload,
  StaffSalaryAssignment,
  StaffSalaryAssignmentPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const STRUCTURES_KEY = ["salary", "salary-structures"] as const;
const STRUCTURE_ITEMS_KEY = ["salary", "salary-structure-items"] as const;
const ASSIGNMENTS_KEY = ["salary", "staff-salary-assignments"] as const;
const PAYMENTS_KEY = ["salary", "payments"] as const;

export function useSalaryStructureList(params: PageParams & SalaryStructureListParams) {
  return useQuery({
    queryKey: [...STRUCTURES_KEY, "list", params],
    queryFn: () => fetchSalaryStructures(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSalaryStructure(id: string | undefined) {
  return useQuery<SalaryStructure, ApiError>({
    queryKey: [...STRUCTURES_KEY, "detail", id],
    queryFn: () => getSalaryStructure(id as string),
    enabled: !!id,
  });
}

export function useCreateSalaryStructure() {
  const queryClient = useQueryClient();
  return useMutation<SalaryStructure, ApiError, SalaryStructurePayload>({
    mutationFn: createSalaryStructure,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STRUCTURES_KEY }),
  });
}

export function useUpdateSalaryStructure(id: string) {
  const queryClient = useQueryClient();
  return useMutation<SalaryStructure, ApiError, SalaryStructurePayload>({
    mutationFn: (values) => updateSalaryStructure(id, values),
    onSuccess: (structure) => {
      queryClient.invalidateQueries({ queryKey: STRUCTURES_KEY });
      queryClient.setQueryData([...STRUCTURES_KEY, "detail", id], structure);
    },
  });
}

export function useDeleteSalaryStructure() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSalaryStructure,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STRUCTURES_KEY }),
  });
}

export function useSalaryStructureItemList(params: { salary_structure: string; page_size?: number }) {
  return useQuery({
    queryKey: [...STRUCTURE_ITEMS_KEY, "list", params],
    queryFn: () => fetchSalaryStructureItems(params),
    enabled: !!params.salary_structure,
  });
}

export function useSalaryStructureItem(id: string | undefined) {
  return useQuery<SalaryStructureItem, ApiError>({
    queryKey: [...STRUCTURE_ITEMS_KEY, "detail", id],
    queryFn: () => getSalaryStructureItem(id as string),
    enabled: !!id,
  });
}

export function useCreateSalaryStructureItem() {
  const queryClient = useQueryClient();
  return useMutation<SalaryStructureItem, ApiError, SalaryStructureItemPayload>({
    mutationFn: createSalaryStructureItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STRUCTURE_ITEMS_KEY }),
  });
}

export function useUpdateSalaryStructureItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation<SalaryStructureItem, ApiError, SalaryStructureItemPayload>({
    mutationFn: (values) => updateSalaryStructureItem(id, values),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: STRUCTURE_ITEMS_KEY });
      queryClient.setQueryData([...STRUCTURE_ITEMS_KEY, "detail", id], item);
    },
  });
}

export function useDeleteSalaryStructureItem() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSalaryStructureItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STRUCTURE_ITEMS_KEY }),
  });
}

export function useStaffSalaryAssignmentList(
  params: PageParams & { staff?: string; salary_structure?: string; search?: string },
) {
  return useQuery({
    queryKey: [...ASSIGNMENTS_KEY, "list", params],
    queryFn: () => fetchStaffSalaryAssignments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useStaffSalaryAssignment(id: string | undefined) {
  return useQuery<StaffSalaryAssignment, ApiError>({
    queryKey: [...ASSIGNMENTS_KEY, "detail", id],
    queryFn: () => getStaffSalaryAssignment(id as string),
    enabled: !!id,
  });
}

export function useCreateStaffSalaryAssignment() {
  const queryClient = useQueryClient();
  return useMutation<StaffSalaryAssignment, ApiError, StaffSalaryAssignmentPayload>({
    mutationFn: createStaffSalaryAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  });
}

export function useUpdateStaffSalaryAssignment(id: string) {
  const queryClient = useQueryClient();
  return useMutation<StaffSalaryAssignment, ApiError, StaffSalaryAssignmentPayload>({
    mutationFn: (values) => updateStaffSalaryAssignment(id, values),
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
      queryClient.setQueryData([...ASSIGNMENTS_KEY, "detail", id], assignment);
    },
  });
}

export function useDeleteStaffSalaryAssignment() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteStaffSalaryAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  });
}

export function useSalaryPaymentList(params: PageParams & SalaryPaymentListParams) {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, "list", params],
    queryFn: () => fetchSalaryPayments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSalaryPayment(id: string | undefined) {
  return useQuery<SalaryPayment, ApiError>({
    queryKey: [...PAYMENTS_KEY, "detail", id],
    queryFn: () => getSalaryPayment(id as string),
    enabled: !!id,
  });
}

export function useGenerateSalaryPayments() {
  const queryClient = useQueryClient();
  return useMutation<GenerateSalaryPaymentsResponse, ApiError, GenerateSalaryPaymentsPayload>({
    mutationFn: generateSalaryPayments,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY }),
  });
}

export function usePaySalaryPayment(id: string) {
  const queryClient = useQueryClient();
  return useMutation<SalaryPayment, ApiError, RecordSalaryPaymentPayload>({
    mutationFn: (values) => paySalaryPayment(id, values),
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
      queryClient.setQueryData([...PAYMENTS_KEY, "detail", id], payment);
    },
  });
}
