import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createInventoryCategory,
  createInventoryItem,
  deleteInventoryCategory,
  deleteInventoryItem,
  fetchInventoryCategories,
  fetchInventoryItems,
  fetchInventoryTransactions,
  fetchLowStockItems,
  getInventoryCategory,
  getInventoryItem,
  stockIn,
  stockOut,
  updateInventoryCategory,
  updateInventoryItem,
} from "./api";
import type {
  InventoryCategory,
  InventoryCategoryListParams,
  InventoryCategoryPayload,
  InventoryItem,
  InventoryItemListParams,
  InventoryItemPayload,
  InventoryTransactionListParams,
  StockActionPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const CATEGORIES_KEY = ["inventory", "categories"] as const;
const ITEMS_KEY = ["inventory", "items"] as const;
const TRANSACTIONS_KEY = ["inventory", "transactions"] as const;

export function useCategoryList(params: PageParams & InventoryCategoryListParams) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "list", params],
    queryFn: () => fetchInventoryCategories(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useCategory(id: string | undefined) {
  return useQuery<InventoryCategory, ApiError>({
    queryKey: [...CATEGORIES_KEY, "detail", id],
    queryFn: () => getInventoryCategory(id as string),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation<InventoryCategory, ApiError, InventoryCategoryPayload>({
    mutationFn: createInventoryCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useUpdateCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation<InventoryCategory, ApiError, InventoryCategoryPayload>({
    mutationFn: (values) => updateInventoryCategory(id, values),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      queryClient.setQueryData([...CATEGORIES_KEY, "detail", id], category);
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteInventoryCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useItemList(params: PageParams & InventoryItemListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...ITEMS_KEY, "list", params],
    queryFn: () => fetchInventoryItems(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useLowStockItems(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...ITEMS_KEY, "low-stock"],
    queryFn: fetchLowStockItems,
    enabled: options?.enabled,
  });
}

export function useItem(id: string | undefined) {
  return useQuery<InventoryItem, ApiError>({
    queryKey: [...ITEMS_KEY, "detail", id],
    queryFn: () => getInventoryItem(id as string),
    enabled: !!id,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, ApiError, InventoryItemPayload>({
    mutationFn: createInventoryItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
  });
}

export function useUpdateItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, ApiError, InventoryItemPayload>({
    mutationFn: (values) => updateInventoryItem(id, values),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
      queryClient.setQueryData([...ITEMS_KEY, "detail", id], item);
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteInventoryItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
  });
}

function invalidateAfterStockChange(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
  queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY });
}

export function useStockIn(id: string) {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, ApiError, StockActionPayload>({
    mutationFn: (values) => stockIn(id, values),
    onSuccess: () => invalidateAfterStockChange(queryClient),
  });
}

export function useStockOut(id: string) {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, ApiError, StockActionPayload>({
    mutationFn: (values) => stockOut(id, values),
    onSuccess: () => invalidateAfterStockChange(queryClient),
  });
}

export function useTransactionList(params: PageParams & InventoryTransactionListParams) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, "list", params],
    queryFn: () => fetchInventoryTransactions(params),
    placeholderData: (previousData) => previousData,
  });
}
