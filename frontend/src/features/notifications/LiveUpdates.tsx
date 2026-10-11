import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useToast } from "@/components/ui/toastContext";

import { fetchNotifications } from "./api";
import { currentPushState, enablePush, fetchPushConfig, pushWanted } from "./push";
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

  // A push message arrives the moment a notification is created: refresh everything and show the toast right away, rather
  // than waiting for the next check. (The unread-count check above stays as the fallback when push is off or blocked.)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "nts-push") return;
      void queryClient.invalidateQueries();
      if (event.data.title) showToast({ title: event.data.title, description: event.data.body });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [queryClient, showToast]);

  // Signing in again on a browser where this person already allowed alerts switches them back on without asking.
  useEffect(() => {
    if (!pushWanted()) return;
    (async () => {
      const [state, config] = await Promise.all([currentPushState(), fetchPushConfig().catch(() => null)]);
      if (config?.enabled && state === "off" && Notification.permission === "granted") await enablePush();
    })().catch(() => undefined);
  }, []);

  return null;
}
