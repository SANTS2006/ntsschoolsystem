import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { fetchPayments, getPayment, recordPayment, refundPayment } from "./api";
import type { Payment, PaymentListParams, PaymentPayload, Refund, RefundPayload } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const PAYMENTS_KEY = ["finance", "payments"] as const;
const INVOICES_KEY = ["finance", "invoices"] as const;

export function usePaymentList(params: PageParams & PaymentListParams) {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, "list", params],
    queryFn: () => fetchPayments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function usePayment(id: string | undefined) {
  return useQuery<Payment, ApiError>({
    queryKey: [...PAYMENTS_KEY, "detail", id],
    queryFn: () => getPayment(id as string),
    enabled: !!id,
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation<Payment, ApiError, PaymentPayload>({
    mutationFn: recordPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
    },
  });
}

export function useRefundPayment(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Refund, ApiError, RefundPayload>({
    mutationFn: (values) => refundPayment(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
    },
  });
}
