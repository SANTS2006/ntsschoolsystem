import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient, type ApiError } from "@/lib/api-client";

export interface ReminderResult {
  message: string;
  sent: number;
  skipped_recent: number;
  no_recipient: number;
}

export interface ReminderRequest {
  invoice_ids?: string[];
  only_overdue?: boolean;
  note?: string;
  force?: boolean;
}

export function useSendReminders() {
  const qc = useQueryClient();
  return useMutation<ReminderResult, ApiError, ReminderRequest>({
    mutationFn: async (body) => (await apiClient.post<ReminderResult>("/finance/invoices/send-reminders/", body)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

export function useRemindInvoice() {
  const qc = useQueryClient();
  return useMutation<ReminderResult, ApiError, string>({
    mutationFn: async (id) => (await apiClient.post<ReminderResult>(`/finance/invoices/${id}/remind/`, {})).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}
