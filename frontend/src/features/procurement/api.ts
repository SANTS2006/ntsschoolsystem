import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderItemListParams,
  PurchaseOrderItemPayload,
  PurchaseOrderListParams,
  PurchaseOrderPayload,
  PurchaseRequest,
  PurchaseRequestItem,
  PurchaseRequestItemListParams,
  PurchaseRequestItemPayload,
  PurchaseRequestListParams,
  PurchaseRequestPayload,
  ReceiptLine,
  Supplier,
  SupplierListParams,
  SupplierPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchSuppliers(params: PageParams & SupplierListParams): Promise<PaginatedResponse<Supplier>> {
  const { data } = await apiClient.get<PaginatedResponse<Supplier>>("/procurement/suppliers/", { params });
  return data;
}

export async function getSupplier(id: string): Promise<Supplier> {
  const { data } = await apiClient.get<Supplier>(`/procurement/suppliers/${id}/`);
  return data;
}

export async function createSupplier(values: SupplierPayload): Promise<Supplier> {
  const { data } = await apiClient.post<Supplier>("/procurement/suppliers/", values);
  return data;
}

export async function updateSupplier(id: string, values: SupplierPayload): Promise<Supplier> {
  const { data } = await apiClient.patch<Supplier>(`/procurement/suppliers/${id}/`, values);
  return data;
}

export async function deleteSupplier(id: string): Promise<void> {
  await apiClient.delete(`/procurement/suppliers/${id}/`);
}

export async function fetchPurchaseRequests(
  params: PageParams & PurchaseRequestListParams,
): Promise<PaginatedResponse<PurchaseRequest>> {
  const { data } = await apiClient.get<PaginatedResponse<PurchaseRequest>>("/procurement/requests/", { params });
  return data;
}

export async function getPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { data } = await apiClient.get<PurchaseRequest>(`/procurement/requests/${id}/`);
  return data;
}

export async function createPurchaseRequest(values: PurchaseRequestPayload): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<PurchaseRequest>("/procurement/requests/", values);
  return data;
}

export async function updatePurchaseRequest(id: string, values: PurchaseRequestPayload): Promise<PurchaseRequest> {
  const { data } = await apiClient.patch<PurchaseRequest>(`/procurement/requests/${id}/`, values);
  return data;
}

export async function deletePurchaseRequest(id: string): Promise<void> {
  await apiClient.delete(`/procurement/requests/${id}/`);
}

export async function submitPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<{ request: PurchaseRequest }>(`/procurement/requests/${id}/submit/`);
  return data.request;
}

export async function approvePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<{ request: PurchaseRequest }>(`/procurement/requests/${id}/approve/`);
  return data.request;
}

export async function rejectPurchaseRequest(id: string, reason: string): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<{ request: PurchaseRequest }>(`/procurement/requests/${id}/reject/`, { reason });
  return data.request;
}

export async function cancelPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<{ request: PurchaseRequest }>(`/procurement/requests/${id}/cancel/`);
  return data.request;
}

export async function fetchPurchaseRequestItems(
  params: PageParams & PurchaseRequestItemListParams,
): Promise<PaginatedResponse<PurchaseRequestItem>> {
  const { data } = await apiClient.get<PaginatedResponse<PurchaseRequestItem>>("/procurement/request-items/", { params });
  return data;
}

export async function getPurchaseRequestItem(id: string): Promise<PurchaseRequestItem> {
  const { data } = await apiClient.get<PurchaseRequestItem>(`/procurement/request-items/${id}/`);
  return data;
}

export async function createPurchaseRequestItem(values: PurchaseRequestItemPayload): Promise<PurchaseRequestItem> {
  const { data } = await apiClient.post<PurchaseRequestItem>("/procurement/request-items/", values);
  return data;
}

export async function updatePurchaseRequestItem(
  id: string,
  values: PurchaseRequestItemPayload,
): Promise<PurchaseRequestItem> {
  const { data } = await apiClient.patch<PurchaseRequestItem>(`/procurement/request-items/${id}/`, values);
  return data;
}

export async function deletePurchaseRequestItem(id: string): Promise<void> {
  await apiClient.delete(`/procurement/request-items/${id}/`);
}

export async function fetchPurchaseOrders(
  params: PageParams & PurchaseOrderListParams,
): Promise<PaginatedResponse<PurchaseOrder>> {
  const { data } = await apiClient.get<PaginatedResponse<PurchaseOrder>>("/procurement/orders/", { params });
  return data;
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await apiClient.get<PurchaseOrder>(`/procurement/orders/${id}/`);
  return data;
}

export async function createPurchaseOrder(values: PurchaseOrderPayload): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>("/procurement/orders/", values);
  return data;
}

export async function updatePurchaseOrder(id: string, values: PurchaseOrderPayload): Promise<PurchaseOrder> {
  const { data } = await apiClient.patch<PurchaseOrder>(`/procurement/orders/${id}/`, values);
  return data;
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await apiClient.delete(`/procurement/orders/${id}/`);
}

export async function sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<{ order: PurchaseOrder }>(`/procurement/orders/${id}/send/`);
  return data.order;
}

export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<{ order: PurchaseOrder }>(`/procurement/orders/${id}/cancel/`);
  return data.order;
}

export async function receivePurchaseOrder(id: string, receipts: ReceiptLine[]): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<{ order: PurchaseOrder }>(`/procurement/orders/${id}/receive/`, { receipts });
  return data.order;
}

export async function fetchPurchaseOrderItems(
  params: PageParams & PurchaseOrderItemListParams,
): Promise<PaginatedResponse<PurchaseOrderItem>> {
  const { data } = await apiClient.get<PaginatedResponse<PurchaseOrderItem>>("/procurement/order-items/", { params });
  return data;
}

export async function getPurchaseOrderItem(id: string): Promise<PurchaseOrderItem> {
  const { data } = await apiClient.get<PurchaseOrderItem>(`/procurement/order-items/${id}/`);
  return data;
}

export async function createPurchaseOrderItem(values: PurchaseOrderItemPayload): Promise<PurchaseOrderItem> {
  const { data } = await apiClient.post<PurchaseOrderItem>("/procurement/order-items/", values);
  return data;
}

export async function updatePurchaseOrderItem(
  id: string,
  values: PurchaseOrderItemPayload,
): Promise<PurchaseOrderItem> {
  const { data } = await apiClient.patch<PurchaseOrderItem>(`/procurement/order-items/${id}/`, values);
  return data;
}

export async function deletePurchaseOrderItem(id: string): Promise<void> {
  await apiClient.delete(`/procurement/order-items/${id}/`);
}
