import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  approvePurchaseRequest,
  cancelPurchaseOrder,
  cancelPurchaseRequest,
  createPurchaseOrder,
  createPurchaseOrderItem,
  createPurchaseRequest,
  createPurchaseRequestItem,
  createSupplier,
  deletePurchaseOrder,
  deletePurchaseOrderItem,
  deletePurchaseRequest,
  deletePurchaseRequestItem,
  deleteSupplier,
  fetchPurchaseOrderItems,
  fetchPurchaseOrders,
  fetchPurchaseRequestItems,
  fetchPurchaseRequests,
  fetchSuppliers,
  getPurchaseOrder,
  getPurchaseOrderItem,
  getPurchaseRequest,
  getPurchaseRequestItem,
  getSupplier,
  receivePurchaseOrder,
  rejectPurchaseRequest,
  sendPurchaseOrder,
  submitPurchaseRequest,
  updatePurchaseOrder,
  updatePurchaseOrderItem,
  updatePurchaseRequest,
  updatePurchaseRequestItem,
  updateSupplier,
} from "./api";
import type {
  PurchaseOrderItemListParams,
  PurchaseOrderItemPayload,
  PurchaseOrderListParams,
  PurchaseOrderPayload,
  PurchaseRequestItemListParams,
  PurchaseRequestItemPayload,
  PurchaseRequestListParams,
  PurchaseRequestPayload,
  ReceiptLine,
  SupplierListParams,
  SupplierPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const SUPPLIERS_KEY = ["procurement", "suppliers"] as const;
const REQUESTS_KEY = ["procurement", "requests"] as const;
const REQUEST_ITEMS_KEY = ["procurement", "request-items"] as const;
const ORDERS_KEY = ["procurement", "orders"] as const;
const ORDER_ITEMS_KEY = ["procurement", "order-items"] as const;

export function useSupplierList(params: PageParams & SupplierListParams) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, "list", params],
    queryFn: () => fetchSuppliers(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, "detail", id],
    queryFn: () => getSupplier(id as string),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof createSupplier>>, ApiError, SupplierPayload>({
    mutationFn: createSupplier,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY }),
  });
}

export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof updateSupplier>>, ApiError, SupplierPayload>({
    mutationFn: (values) => updateSupplier(id, values),
    onSuccess: (supplier) => {
      queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY });
      queryClient.setQueryData([...SUPPLIERS_KEY, "detail", id], supplier);
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSupplier,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY }),
  });
}

export function usePurchaseRequestList(params: PageParams & PurchaseRequestListParams) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, "list", params],
    queryFn: () => fetchPurchaseRequests(params),
    placeholderData: (previousData) => previousData,
  });
}

export function usePurchaseRequest(id: string | undefined) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, "detail", id],
    queryFn: () => getPurchaseRequest(id as string),
    enabled: !!id,
  });
}

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof createPurchaseRequest>>, ApiError, PurchaseRequestPayload>({
    mutationFn: createPurchaseRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REQUESTS_KEY }),
  });
}

export function useUpdatePurchaseRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof updatePurchaseRequest>>, ApiError, PurchaseRequestPayload>({
    mutationFn: (values) => updatePurchaseRequest(id, values),
    onSuccess: (request) => {
      queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      queryClient.setQueryData([...REQUESTS_KEY, "detail", id], request);
    },
  });
}

export function useDeletePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deletePurchaseRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REQUESTS_KEY }),
  });
}

function invalidateRequest(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
  queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, "detail", id] });
}

export function useSubmitPurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof submitPurchaseRequest>>, ApiError, string>({
    mutationFn: submitPurchaseRequest,
    onSuccess: (_data, id) => invalidateRequest(queryClient, id),
  });
}

export function useApprovePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof approvePurchaseRequest>>, ApiError, string>({
    mutationFn: approvePurchaseRequest,
    onSuccess: (_data, id) => invalidateRequest(queryClient, id),
  });
}

export function useRejectPurchaseRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof rejectPurchaseRequest>>, ApiError, string>({
    mutationFn: (reason) => rejectPurchaseRequest(id, reason),
    onSuccess: () => invalidateRequest(queryClient, id),
  });
}

export function useCancelPurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof cancelPurchaseRequest>>, ApiError, string>({
    mutationFn: cancelPurchaseRequest,
    onSuccess: (_data, id) => invalidateRequest(queryClient, id),
  });
}

export function usePurchaseRequestItemList(params: PageParams & PurchaseRequestItemListParams) {
  return useQuery({
    queryKey: [...REQUEST_ITEMS_KEY, "list", params],
    queryFn: () => fetchPurchaseRequestItems(params),
    placeholderData: (previousData) => previousData,
  });
}

export function usePurchaseRequestItem(id: string | undefined) {
  return useQuery({
    queryKey: [...REQUEST_ITEMS_KEY, "detail", id],
    queryFn: () => getPurchaseRequestItem(id as string),
    enabled: !!id,
  });
}

export function useCreatePurchaseRequestItem() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof createPurchaseRequestItem>>, ApiError, PurchaseRequestItemPayload>({
    mutationFn: createPurchaseRequestItem,
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: REQUEST_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, "detail", item.request] });
    },
  });
}

export function useUpdatePurchaseRequestItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof updatePurchaseRequestItem>>, ApiError, PurchaseRequestItemPayload>({
    mutationFn: (values) => updatePurchaseRequestItem(id, values),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: REQUEST_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, "detail", item.request] });
    },
  });
}

export function useDeletePurchaseRequestItem() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string; requestId: string }>({
    mutationFn: ({ id }) => deletePurchaseRequestItem(id),
    onSuccess: (_data, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: REQUEST_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, "detail", requestId] });
    },
  });
}

export function usePurchaseOrderList(params: PageParams & PurchaseOrderListParams) {
  return useQuery({
    queryKey: [...ORDERS_KEY, "list", params],
    queryFn: () => fetchPurchaseOrders(params),
    placeholderData: (previousData) => previousData,
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: [...ORDERS_KEY, "detail", id],
    queryFn: () => getPurchaseOrder(id as string),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof createPurchaseOrder>>, ApiError, PurchaseOrderPayload>({
    mutationFn: createPurchaseOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
  });
}

export function useUpdatePurchaseOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof updatePurchaseOrder>>, ApiError, PurchaseOrderPayload>({
    mutationFn: (values) => updatePurchaseOrder(id, values),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      queryClient.setQueryData([...ORDERS_KEY, "detail", id], order);
    },
  });
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deletePurchaseOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
  });
}

function invalidateOrder(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, "detail", id] });
  // Receiving updates quantity_received on the order's own line items, which live under a
  // separate top-level query key (ORDER_ITEMS_KEY) — invalidating ORDERS_KEY alone doesn't touch
  // it, so the detail page's item table would otherwise keep showing stale received quantities.
  queryClient.invalidateQueries({ queryKey: ORDER_ITEMS_KEY });
  // Receiving an order writes into the inventory ledger, so both stay fresh after the fact.
  queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "transactions"] });
}

export function useSendPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof sendPurchaseOrder>>, ApiError, string>({
    mutationFn: sendPurchaseOrder,
    onSuccess: (_data, id) => invalidateOrder(queryClient, id),
  });
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof cancelPurchaseOrder>>, ApiError, string>({
    mutationFn: cancelPurchaseOrder,
    onSuccess: (_data, id) => invalidateOrder(queryClient, id),
  });
}

export function useReceivePurchaseOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof receivePurchaseOrder>>, ApiError, ReceiptLine[]>({
    mutationFn: (receipts) => receivePurchaseOrder(id, receipts),
    onSuccess: () => invalidateOrder(queryClient, id),
  });
}

export function usePurchaseOrderItemList(params: PageParams & PurchaseOrderItemListParams) {
  return useQuery({
    queryKey: [...ORDER_ITEMS_KEY, "list", params],
    queryFn: () => fetchPurchaseOrderItems(params),
    placeholderData: (previousData) => previousData,
  });
}

export function usePurchaseOrderItem(id: string | undefined) {
  return useQuery({
    queryKey: [...ORDER_ITEMS_KEY, "detail", id],
    queryFn: () => getPurchaseOrderItem(id as string),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrderItem() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof createPurchaseOrderItem>>, ApiError, PurchaseOrderItemPayload>({
    mutationFn: createPurchaseOrderItem,
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ORDER_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, "detail", item.order] });
    },
  });
}

export function useUpdatePurchaseOrderItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof updatePurchaseOrderItem>>, ApiError, PurchaseOrderItemPayload>({
    mutationFn: (values) => updatePurchaseOrderItem(id, values),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ORDER_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, "detail", item.order] });
    },
  });
}

export function useDeletePurchaseOrderItem() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string; orderId: string }>({
    mutationFn: ({ id }) => deletePurchaseOrderItem(id),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ORDER_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY, "detail", orderId] });
    },
  });
}
