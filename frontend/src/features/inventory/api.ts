import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  InventoryCategory,
  InventoryCategoryListParams,
  InventoryCategoryPayload,
  InventoryItem,
  InventoryItemListParams,
  InventoryItemPayload,
  InventoryTransaction,
  InventoryTransactionListParams,
  StockActionPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchInventoryCategories(
  params: PageParams & InventoryCategoryListParams,
): Promise<PaginatedResponse<InventoryCategory>> {
  const { data } = await apiClient.get<PaginatedResponse<InventoryCategory>>("/inventory/categories/", { params });
  return data;
}

export async function getInventoryCategory(id: string): Promise<InventoryCategory> {
  const { data } = await apiClient.get<InventoryCategory>(`/inventory/categories/${id}/`);
  return data;
}

export async function createInventoryCategory(values: InventoryCategoryPayload): Promise<InventoryCategory> {
  const { data } = await apiClient.post<InventoryCategory>("/inventory/categories/", values);
  return data;
}

export async function updateInventoryCategory(id: string, values: InventoryCategoryPayload): Promise<InventoryCategory> {
  const { data } = await apiClient.patch<InventoryCategory>(`/inventory/categories/${id}/`, values);
  return data;
}

export async function deleteInventoryCategory(id: string): Promise<void> {
  await apiClient.delete(`/inventory/categories/${id}/`);
}

export async function fetchInventoryItems(
  params: PageParams & InventoryItemListParams,
): Promise<PaginatedResponse<InventoryItem>> {
  const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>("/inventory/items/", { params });
  return data;
}

export async function getInventoryItem(id: string): Promise<InventoryItem> {
  const { data } = await apiClient.get<InventoryItem>(`/inventory/items/${id}/`);
  return data;
}

export async function createInventoryItem(values: InventoryItemPayload): Promise<InventoryItem> {
  const { data } = await apiClient.post<InventoryItem>("/inventory/items/", values);
  return data;
}

export async function updateInventoryItem(id: string, values: InventoryItemPayload): Promise<InventoryItem> {
  const { data } = await apiClient.patch<InventoryItem>(`/inventory/items/${id}/`, values);
  return data;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await apiClient.delete(`/inventory/items/${id}/`);
}

/** Not paginated — the backend returns a plain `items` array from a custom list action, unlike
 * every other list endpoint in this codebase. */
export async function fetchLowStockItems(): Promise<InventoryItem[]> {
  const { data } = await apiClient.get<{ items: InventoryItem[] }>("/inventory/items/low_stock/");
  return data.items;
}

export async function stockIn(id: string, values: StockActionPayload): Promise<InventoryItem> {
  const { data } = await apiClient.post<{ item: InventoryItem }>(`/inventory/items/${id}/stock_in/`, values);
  return data.item;
}

export async function stockOut(id: string, values: StockActionPayload): Promise<InventoryItem> {
  const { data } = await apiClient.post<{ item: InventoryItem }>(`/inventory/items/${id}/stock_out/`, values);
  return data.item;
}

export async function fetchInventoryTransactions(
  params: PageParams & InventoryTransactionListParams,
): Promise<PaginatedResponse<InventoryTransaction>> {
  const { data } = await apiClient.get<PaginatedResponse<InventoryTransaction>>("/inventory/transactions/", { params });
  return data;
}
