import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { Notification, NotificationListParams } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchNotifications(
  params: PageParams & NotificationListParams,
): Promise<PaginatedResponse<Notification>> {
  const { data } = await apiClient.get<PaginatedResponse<Notification>>("/notifications/", { params });
  return data;
}

export async function getNotification(id: string): Promise<Notification> {
  const { data } = await apiClient.get<Notification>(`/notifications/${id}/`);
  return data;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const { data } = await apiClient.post<{ notification: Notification }>(`/notifications/${id}/mark-read/`);
  return data.notification;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post("/notifications/mark-all-read/");
}
