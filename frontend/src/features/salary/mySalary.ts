import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export type LineType = "basic" | "allowance" | "deduction";

export interface MyPlanLine {
  line_type: LineType;
  description: string;
  amount: number | string;
}

export interface MyAdjustment {
  id: string;
  kind: "deduction" | "addition";
  amount: number | string;
  reason: string;
  period_year: number;
  period_month: number;
  applied: boolean;
  payment_status: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface MyPaymentRow {
  id: string;
  payment_number: string;
  period_year: number;
  period_month: number;
  gross_amount: number | string;
  deductions_total: number | string;
  net_amount: number | string;
  status: "pending" | "paid" | "cancelled";
  paid_at: string | null;
  method: string;
}

export interface MySalary {
  has_plan: boolean;
  plan: { name: string; effective_from: string; lines: MyPlanLine[]; gross: number | string; deductions: number | string; net: number | string } | null;
  payments: MyPaymentRow[];
  pending_adjustments: MyAdjustment[];
  adjustments: MyAdjustment[];
}

export interface MyReceipt {
  id: string;
  payment_number: string;
  month_label: string;
  school_name: string;
  staff_name: string;
  staff_id: string;
  salary_structure_name: string | null;
  gross_amount: number | string;
  deductions_total: number | string;
  net_amount: number | string;
  status: "pending" | "paid" | "cancelled";
  paid_at: string | null;
  method: string;
  reference: string;
  has_breakdown: boolean;
  lines: { id: string; line_type: LineType; description: string; amount: number | string; source: "plan" | "adjustment" }[];
}

export function useMySalary() {
  return useQuery({
    queryKey: ["salary", "my-salary"],
    queryFn: async () => (await apiClient.get<MySalary>("/salary/my-salary/")).data,
  });
}

export function useMyReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ["salary", "my-receipt", id],
    queryFn: async () => (await apiClient.get<{ payment: MyReceipt }>(`/salary/my-payments/${id}/`)).data.payment,
    enabled: !!id,
  });
}
