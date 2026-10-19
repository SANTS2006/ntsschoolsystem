import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient, type ApiError } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { MyAdjustment } from "./mySalary";

export interface SalaryAdjustment extends MyAdjustment {
  staff: string;
  staff_name: string;
}

export interface AdjustmentPayload {
  staff: string;
  kind: "deduction" | "addition";
  amount: string;
  reason: string;
  period_year: number;
  period_month: number;
}

export interface AdjustmentFilters {
  page_size?: number;
  search?: string;
  staff?: string;
  kind?: string;
  period_year?: number;
  period_month?: number;
}

const KEY = ["salary", "adjustments"] as const;

export function useAdjustmentList(params: AdjustmentFilters) {
  return useQuery({
    queryKey: [...KEY, params],
    queryFn: async () => (await apiClient.get<PaginatedResponse<SalaryAdjustment>>("/salary/adjustments/", { params })).data,
    placeholderData: (prev) => prev,
  });
}

export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation<SalaryAdjustment, ApiError, AdjustmentPayload>({
    mutationFn: async (values) => (await apiClient.post<SalaryAdjustment>("/salary/adjustments/", values)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["salary"] });
    },
  });
}

export function useDeleteAdjustment() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/salary/adjustments/${id}/`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["salary"] }),
  });
}
