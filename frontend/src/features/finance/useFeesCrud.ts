import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  cancelInvoice,
  createFeeCategory,
  createFeeStructure,
  createFeeStructureItem,
  createInvoice,
  createInvoiceLineItem,
  deleteFeeCategory,
  deleteFeeStructure,
  deleteFeeStructureItem,
  deleteInvoiceLineItem,
  fetchFeeCategories,
  fetchFeeStructureItems,
  fetchFeeStructures,
  fetchInvoiceLineItems,
  fetchInvoiceStats,
  fetchInvoices,
  fetchOutstandingInvoices,
  generateInvoices,
  getFeeCategory,
  getFeeStructure,
  getFeeStructureItem,
  getInvoice,
  getInvoiceLineItem,
  updateFeeCategory,
  updateFeeStructure,
  updateFeeStructureItem,
  updateInvoiceLineItem,
} from "./api";
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
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const CATEGORIES_KEY = ["finance", "fee-categories"] as const;
const STRUCTURES_KEY = ["finance", "fee-structures"] as const;
const STRUCTURE_ITEMS_KEY = ["finance", "fee-structure-items"] as const;
const INVOICES_KEY = ["finance", "invoices"] as const;
const LINE_ITEMS_KEY = ["finance", "invoice-line-items"] as const;

export function useFeeCategoryList(params: PageParams & FeeCategoryListParams) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "list", params],
    queryFn: () => fetchFeeCategories(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useFeeCategory(id: string | undefined) {
  return useQuery<FeeCategory, ApiError>({
    queryKey: [...CATEGORIES_KEY, "detail", id],
    queryFn: () => getFeeCategory(id as string),
    enabled: !!id,
  });
}

export function useCreateFeeCategory() {
  const queryClient = useQueryClient();
  return useMutation<FeeCategory, ApiError, FeeCategoryPayload>({
    mutationFn: createFeeCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useUpdateFeeCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation<FeeCategory, ApiError, FeeCategoryPayload>({
    mutationFn: (values) => updateFeeCategory(id, values),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      queryClient.setQueryData([...CATEGORIES_KEY, "detail", id], category);
    },
  });
}

export function useDeleteFeeCategory() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteFeeCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useFeeStructureList(params: PageParams & FeeStructureListParams) {
  return useQuery({
    queryKey: [...STRUCTURES_KEY, "list", params],
    queryFn: () => fetchFeeStructures(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useFeeStructure(id: string | undefined) {
  return useQuery<FeeStructure, ApiError>({
    queryKey: [...STRUCTURES_KEY, "detail", id],
    queryFn: () => getFeeStructure(id as string),
    enabled: !!id,
  });
}

export function useCreateFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation<FeeStructure, ApiError, FeeStructurePayload>({
    mutationFn: createFeeStructure,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STRUCTURES_KEY }),
  });
}

export function useUpdateFeeStructure(id: string) {
  const queryClient = useQueryClient();
  return useMutation<FeeStructure, ApiError, FeeStructurePayload>({
    mutationFn: (values) => updateFeeStructure(id, values),
    onSuccess: (structure) => {
      queryClient.invalidateQueries({ queryKey: STRUCTURES_KEY });
      queryClient.setQueryData([...STRUCTURES_KEY, "detail", id], structure);
    },
  });
}

export function useDeleteFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteFeeStructure,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STRUCTURES_KEY }),
  });
}

export function useFeeStructureItemList(params: { fee_structure: string; page_size?: number }) {
  return useQuery({
    queryKey: [...STRUCTURE_ITEMS_KEY, "list", params],
    queryFn: () => fetchFeeStructureItems(params),
    enabled: !!params.fee_structure,
  });
}

export function useFeeStructureItem(id: string | undefined) {
  return useQuery<FeeStructureItem, ApiError>({
    queryKey: [...STRUCTURE_ITEMS_KEY, "detail", id],
    queryFn: () => getFeeStructureItem(id as string),
    enabled: !!id,
  });
}

export function useCreateFeeStructureItem() {
  const queryClient = useQueryClient();
  return useMutation<FeeStructureItem, ApiError, FeeStructureItemPayload>({
    mutationFn: createFeeStructureItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STRUCTURE_ITEMS_KEY }),
  });
}

export function useUpdateFeeStructureItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation<FeeStructureItem, ApiError, FeeStructureItemPayload>({
    mutationFn: (values) => updateFeeStructureItem(id, values),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: STRUCTURE_ITEMS_KEY });
      queryClient.setQueryData([...STRUCTURE_ITEMS_KEY, "detail", id], item);
    },
  });
}

export function useDeleteFeeStructureItem() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteFeeStructureItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STRUCTURE_ITEMS_KEY }),
  });
}

export function useInvoiceList(params: PageParams & InvoiceListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...INVOICES_KEY, "list", params],
    queryFn: () => fetchInvoices(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useOutstandingInvoiceList(params: PageParams & InvoiceListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...INVOICES_KEY, "outstanding", params],
    queryFn: () => fetchOutstandingInvoices(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery<Invoice, ApiError>({
    queryKey: [...INVOICES_KEY, "detail", id],
    queryFn: () => getInvoice(id as string),
    enabled: !!id,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation<Invoice, ApiError, InvoiceCreatePayload>({
    mutationFn: createInvoice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVOICES_KEY }),
  });
}

export function useCancelInvoice() {
  const queryClient = useQueryClient();
  return useMutation<Invoice, ApiError, string>({
    mutationFn: cancelInvoice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVOICES_KEY }),
  });
}

export function useGenerateInvoices() {
  const queryClient = useQueryClient();
  return useMutation<GenerateInvoicesResponse, ApiError, GenerateInvoicesPayload>({
    mutationFn: generateInvoices,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVOICES_KEY }),
  });
}

export function useInvoiceStats() {
  return useQuery<InvoiceStats, ApiError>({
    queryKey: [...INVOICES_KEY, "stats"],
    queryFn: fetchInvoiceStats,
  });
}

export function useInvoiceLineItemList(params: { invoice: string; page_size?: number }) {
  return useQuery({
    queryKey: [...LINE_ITEMS_KEY, "list", params],
    queryFn: () => fetchInvoiceLineItems(params),
    enabled: !!params.invoice,
  });
}

export function useInvoiceLineItem(id: string | undefined) {
  return useQuery<InvoiceLineItem, ApiError>({
    queryKey: [...LINE_ITEMS_KEY, "detail", id],
    queryFn: () => getInvoiceLineItem(id as string),
    enabled: !!id,
  });
}

export function useCreateInvoiceLineItem() {
  const queryClient = useQueryClient();
  return useMutation<InvoiceLineItem, ApiError, InvoiceLineItemPayload>({
    mutationFn: createInvoiceLineItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LINE_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
    },
  });
}

export function useUpdateInvoiceLineItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation<InvoiceLineItem, ApiError, InvoiceLineItemPayload>({
    mutationFn: (values) => updateInvoiceLineItem(id, values),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: LINE_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
      queryClient.setQueryData([...LINE_ITEMS_KEY, "detail", id], item);
    },
  });
}

export function useDeleteInvoiceLineItem() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteInvoiceLineItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LINE_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
    },
  });
}
