import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  FeeCategory,
  FeeCategoryListParams,
  FeeCategoryPayload,
  FeeStructure,
  FeeStructureItem,
  FeeStructureItemPayload,
  FeeStructureListParams,
  FeeStructurePayload,
  GenerateInvoicesPayload,
  GenerateInvoicesResponse,
  Invoice,
  InvoiceCreatePayload,
  InvoiceLineItem,
  InvoiceLineItemPayload,
  InvoiceListParams,
  InvoiceStats,
  Payment,
  PaymentListParams,
  PaymentPayload,
  Refund,
  RefundPayload,
} from "./types";

export async function fetchFeeCategories(params: FeeCategoryListParams): Promise<PaginatedResponse<FeeCategory>> {
  const { data } = await apiClient.get<PaginatedResponse<FeeCategory>>("/finance/fee-categories/", { params });
  return data;
}

export async function getFeeCategory(id: string): Promise<FeeCategory> {
  const { data } = await apiClient.get<FeeCategory>(`/finance/fee-categories/${id}/`);
  return data;
}

export async function createFeeCategory(values: FeeCategoryPayload): Promise<FeeCategory> {
  const { data } = await apiClient.post<FeeCategory>("/finance/fee-categories/", values);
  return data;
}

export async function updateFeeCategory(id: string, values: FeeCategoryPayload): Promise<FeeCategory> {
  const { data } = await apiClient.patch<FeeCategory>(`/finance/fee-categories/${id}/`, values);
  return data;
}

export async function deleteFeeCategory(id: string): Promise<void> {
  await apiClient.delete(`/finance/fee-categories/${id}/`);
}

export async function fetchFeeStructures(
  params: FeeStructureListParams,
): Promise<PaginatedResponse<FeeStructure>> {
  const { data } = await apiClient.get<PaginatedResponse<FeeStructure>>("/finance/fee-structures/", { params });
  return data;
}

export async function getFeeStructure(id: string): Promise<FeeStructure> {
  const { data } = await apiClient.get<FeeStructure>(`/finance/fee-structures/${id}/`);
  return data;
}

export async function createFeeStructure(values: FeeStructurePayload): Promise<FeeStructure> {
  const { data } = await apiClient.post<FeeStructure>("/finance/fee-structures/", values);
  return data;
}

export async function updateFeeStructure(id: string, values: FeeStructurePayload): Promise<FeeStructure> {
  const { data } = await apiClient.patch<FeeStructure>(`/finance/fee-structures/${id}/`, values);
  return data;
}

export async function deleteFeeStructure(id: string): Promise<void> {
  await apiClient.delete(`/finance/fee-structures/${id}/`);
}

export async function fetchFeeStructureItems(
  params: { fee_structure: string; page_size?: number },
): Promise<PaginatedResponse<FeeStructureItem>> {
  const { data } = await apiClient.get<PaginatedResponse<FeeStructureItem>>("/finance/fee-structure-items/", {
    params,
  });
  return data;
}

export async function getFeeStructureItem(id: string): Promise<FeeStructureItem> {
  const { data } = await apiClient.get<FeeStructureItem>(`/finance/fee-structure-items/${id}/`);
  return data;
}

export async function createFeeStructureItem(values: FeeStructureItemPayload): Promise<FeeStructureItem> {
  const { data } = await apiClient.post<FeeStructureItem>("/finance/fee-structure-items/", values);
  return data;
}

export async function updateFeeStructureItem(id: string, values: FeeStructureItemPayload): Promise<FeeStructureItem> {
  const { data } = await apiClient.patch<FeeStructureItem>(`/finance/fee-structure-items/${id}/`, values);
  return data;
}

export async function deleteFeeStructureItem(id: string): Promise<void> {
  await apiClient.delete(`/finance/fee-structure-items/${id}/`);
}

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchInvoices(params: PageParams & InvoiceListParams): Promise<PaginatedResponse<Invoice>> {
  const { data } = await apiClient.get<PaginatedResponse<Invoice>>("/finance/invoices/", { params });
  return data;
}

export async function fetchOutstandingInvoices(
  params: PageParams & InvoiceListParams,
): Promise<PaginatedResponse<Invoice>> {
  const { data } = await apiClient.get<PaginatedResponse<Invoice>>("/finance/invoices/outstanding/", { params });
  return data;
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data } = await apiClient.get<Invoice>(`/finance/invoices/${id}/`);
  return data;
}

export async function createInvoice(values: InvoiceCreatePayload): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>("/finance/invoices/", values);
  return data.invoice;
}

export async function cancelInvoice(id: string): Promise<Invoice> {
  const { data } = await apiClient.post<{ invoice: Invoice }>(`/finance/invoices/${id}/cancel/`);
  return data.invoice;
}

export async function generateInvoices(payload: GenerateInvoicesPayload): Promise<GenerateInvoicesResponse> {
  const { data } = await apiClient.post<GenerateInvoicesResponse>("/finance/invoices/generate/", payload);
  return data;
}

export async function fetchInvoiceStats(): Promise<InvoiceStats> {
  const { data } = await apiClient.get<{ stats: InvoiceStats }>("/finance/invoices/stats/");
  return data.stats;
}

export async function fetchInvoiceLineItems(
  params: { invoice: string; page_size?: number },
): Promise<PaginatedResponse<InvoiceLineItem>> {
  const { data } = await apiClient.get<PaginatedResponse<InvoiceLineItem>>("/finance/invoice-line-items/", {
    params,
  });
  return data;
}

export async function createInvoiceLineItem(values: InvoiceLineItemPayload): Promise<InvoiceLineItem> {
  const { data } = await apiClient.post<InvoiceLineItem>("/finance/invoice-line-items/", values);
  return data;
}

export async function getInvoiceLineItem(id: string): Promise<InvoiceLineItem> {
  const { data } = await apiClient.get<InvoiceLineItem>(`/finance/invoice-line-items/${id}/`);
  return data;
}

export async function updateInvoiceLineItem(id: string, values: InvoiceLineItemPayload): Promise<InvoiceLineItem> {
  const { data } = await apiClient.patch<InvoiceLineItem>(`/finance/invoice-line-items/${id}/`, values);
  return data;
}

export async function deleteInvoiceLineItem(id: string): Promise<void> {
  await apiClient.delete(`/finance/invoice-line-items/${id}/`);
}

export async function fetchPayments(params: PageParams & PaymentListParams): Promise<PaginatedResponse<Payment>> {
  const { data } = await apiClient.get<PaginatedResponse<Payment>>("/finance/payments/", { params });
  return data;
}

export async function getPayment(id: string): Promise<Payment> {
  const { data } = await apiClient.get<Payment>(`/finance/payments/${id}/`);
  return data;
}

export async function recordPayment(values: PaymentPayload): Promise<Payment> {
  const { data } = await apiClient.post<{ payment: Payment }>("/finance/payments/", values);
  return data.payment;
}

export async function refundPayment(id: string, values: RefundPayload): Promise<Refund> {
  const { data } = await apiClient.post<{ refund: Refund }>(`/finance/payments/${id}/refund/`, values);
  return data.refund;
}
