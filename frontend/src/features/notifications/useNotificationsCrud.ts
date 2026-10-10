import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { fetchNotifications, getNotification, markAllNotificationsRead, markNotificationRead } from "./api";
import type { Notification, NotificationListParams } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotificationList(params: PageParams & NotificationListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "list", params],
    queryFn: () => fetchNotifications(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

/** There's no dedicated unread-count endpoint — the pagination envelope's own `count` on a
 * `page_size=1, is_read=false` request gives the true total cheaply, without pulling every row.
 * Polls every few seconds so the topbar bell reflects new notifications without a full page reload. */
export function useUnreadCount() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread-count"],
    queryFn: () => fetchNotifications({ page_size: 1, is_read: false }),
    select: (data) => data.count,
    // Checked often, so a new notification shows up (and the rest of the page refreshes) within seconds.
    refetchInterval: 8_000,
  });
}

export function useNotification(id: string | undefined) {
  return useQuery<Notification, ApiError>({
    queryKey: [...NOTIFICATIONS_KEY, "detail", id],
    queryFn: () => getNotification(id as string),
    enabled: !!id,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation<Notification, ApiError, string>({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
