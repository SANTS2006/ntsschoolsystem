import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useToast } from "@/components/ui/toastContext";

import { fetchNotifications } from "./api";
import { useUnreadCount } from "./useNotificationsCrud";

/** Watches for new notifications while someone is signed in. When one arrives it pops up as a toast and every query on
 * screen is refreshed straight away — the notification usually means something just changed (a result published, a
 * reservation approved, a new event), and the page should show it without a reload. */
export function LiveUpdates() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: count } = useUnreadCount();
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (count === undefined) return;
    const before = previous.current;
    previous.current = count;
    if (before === null || count <= before) return;
    void queryClient.invalidateQueries();
    fetchNotifications({ page_size: 1, is_read: false })
      .then((page) => {
        const latest = page.results[0];
        if (latest) showToast({ title: latest.title, description: latest.message });
      })
      .catch(() => undefined);
  }, [count, queryClient, showToast]);

  return null;
}
