import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

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

export async function fetchSalaryStructures(
  params: SalaryStructureListParams,
): Promise<PaginatedResponse<SalaryStructure>> {
  const { data } = await apiClient.get<PaginatedResponse<SalaryStructure>>("/salary/salary-structures/", { params });
  return data;
}

export async function getSalaryStructure(id: string): Promise<SalaryStructure> {
  const { data } = await apiClient.get<SalaryStructure>(`/salary/salary-structures/${id}/`);
  return data;
}

export async function createSalaryStructure(values: SalaryStructurePayload): Promise<SalaryStructure> {
  const { data } = await apiClient.post<SalaryStructure>("/salary/salary-structures/", values);
  return data;
}

export async function updateSalaryStructure(id: string, values: SalaryStructurePayload): Promise<SalaryStructure> {
  const { data } = await apiClient.patch<SalaryStructure>(`/salary/salary-structures/${id}/`, values);
  return data;
}

export async function deleteSalaryStructure(id: string): Promise<void> {
  await apiClient.delete(`/salary/salary-structures/${id}/`);
}

export async function fetchSalaryStructureItems(
  params: { salary_structure: string; page_size?: number },
): Promise<PaginatedResponse<SalaryStructureItem>> {
  const { data } = await apiClient.get<PaginatedResponse<SalaryStructureItem>>("/salary/salary-structure-items/", {
    params,
  });
  return data;
}

export async function getSalaryStructureItem(id: string): Promise<SalaryStructureItem> {
  const { data } = await apiClient.get<SalaryStructureItem>(`/salary/salary-structure-items/${id}/`);
  return data;
}

export async function createSalaryStructureItem(values: SalaryStructureItemPayload): Promise<SalaryStructureItem> {
  const { data } = await apiClient.post<SalaryStructureItem>("/salary/salary-structure-items/", values);
  return data;
}

export async function updateSalaryStructureItem(
  id: string,
  values: SalaryStructureItemPayload,
): Promise<SalaryStructureItem> {
  const { data } = await apiClient.patch<SalaryStructureItem>(`/salary/salary-structure-items/${id}/`, values);
  return data;
}

export async function deleteSalaryStructureItem(id: string): Promise<void> {
  await apiClient.delete(`/salary/salary-structure-items/${id}/`);
}

export async function fetchStaffSalaryAssignments(
  params: PageParams & { staff?: string; salary_structure?: string; search?: string },
): Promise<PaginatedResponse<StaffSalaryAssignment>> {
  const { data } = await apiClient.get<PaginatedResponse<StaffSalaryAssignment>>(
    "/salary/staff-salary-assignments/",
    { params },
  );
  return data;
}

export async function getStaffSalaryAssignment(id: string): Promise<StaffSalaryAssignment> {
  const { data } = await apiClient.get<StaffSalaryAssignment>(`/salary/staff-salary-assignments/${id}/`);
  return data;
}

export async function createStaffSalaryAssignment(
  values: StaffSalaryAssignmentPayload,
): Promise<StaffSalaryAssignment> {
  const { data } = await apiClient.post<StaffSalaryAssignment>("/salary/staff-salary-assignments/", values);
  return data;
}

export async function updateStaffSalaryAssignment(
  id: string,
  values: StaffSalaryAssignmentPayload,
): Promise<StaffSalaryAssignment> {
  const { data } = await apiClient.patch<StaffSalaryAssignment>(`/salary/staff-salary-assignments/${id}/`, values);
  return data;
}

export async function deleteStaffSalaryAssignment(id: string): Promise<void> {
  await apiClient.delete(`/salary/staff-salary-assignments/${id}/`);
}

export async function fetchSalaryPayments(
  params: PageParams & SalaryPaymentListParams,
): Promise<PaginatedResponse<SalaryPayment>> {
  const { data } = await apiClient.get<PaginatedResponse<SalaryPayment>>("/salary/payments/", { params });
  return data;
}

export async function getSalaryPayment(id: string): Promise<SalaryPayment> {
  const { data } = await apiClient.get<SalaryPayment>(`/salary/payments/${id}/`);
  return data;
}

export async function generateSalaryPayments(
  payload: GenerateSalaryPaymentsPayload,
): Promise<GenerateSalaryPaymentsResponse> {
  const { data } = await apiClient.post<GenerateSalaryPaymentsResponse>("/salary/payments/generate/", payload);
  return data;
}

export async function paySalaryPayment(id: string, values: RecordSalaryPaymentPayload): Promise<SalaryPayment> {
  const { data } = await apiClient.post<{ payment: SalaryPayment }>(`/salary/payments/${id}/pay/`, values);
  return data.payment;
}
