import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export interface MyFeeLine {
  description: string;
  line_type: string;
  amount: number | string;
}

export interface MyFeePayment {
  id: string;
  receipt_number: string;
  amount: number | string;
  method: string;
  paid_at: string;
  status: string;
}

export interface MyFeeInvoice {
  id: string;
  invoice_number: string;
  status: string;
  due_date: string | null;
  is_overdue: boolean;
  subtotal: number | string;
  discount_total: number | string;
  total: number | string;
  amount_paid: number | string;
  balance: number | string;
  line_items: MyFeeLine[];
  payments: MyFeePayment[];
}

export interface FeeTotals {
  billed: number | string;
  paid: number | string;
  outstanding: number | string;
}

export interface MyFeeTerm {
  term_id: string | null;
  term: string;
  totals: FeeTotals;
  invoices: MyFeeInvoice[];
}

export interface MyFeeYear {
  academic_year_id: string;
  academic_year: string;
  status: string;
  totals: FeeTotals;
  terms: MyFeeTerm[];
}

export interface MyFees {
  is_student: boolean;
  summary: (FeeTotals & { overdue: number | string; status: "none" | "paid" | "overdue" | "outstanding"; invoice_count: number }) | null;
  years: MyFeeYear[];
}

export interface MyFeeReceipt {
  receipt_number: string;
  amount: number | string;
  method: string;
  reference: string;
  paid_at: string;
  status: string;
  invoice_number: string;
  academic_year: string;
  term: string;
  invoice_total: number | string;
  invoice_paid: number | string;
  invoice_balance: number | string;
  student_name: string;
  admission_number: string;
  school_name: string;
}

export function useMyFees() {
  return useQuery({
    queryKey: ["finance", "my-fees"],
    queryFn: async () => (await apiClient.get<MyFees>("/finance/my-fees/")).data,
  });
}

export function useMyFeeReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ["finance", "my-fee-receipt", id],
    queryFn: async () => (await apiClient.get<{ receipt: MyFeeReceipt }>(`/finance/my-fees/receipts/${id}/`)).data.receipt,
    enabled: !!id,
  });
}
