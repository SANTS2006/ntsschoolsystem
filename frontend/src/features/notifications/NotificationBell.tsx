import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

import { categoryLabel } from "./priorityTone";
import type { Notification } from "./types";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationList, useUnreadCount } from "./useNotificationsCrud";

const PREVIEW_COUNT = 8;

export function NotificationBell() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount } = useUnreadCount();
  const { data, isLoading } = useNotificationList({ page_size: PREVIEW_COUNT }, { enabled: isOpen });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (notification: Notification) => {
    if (!notification.is_read) {
      markRead.mutate(notification.id);
    }
    setIsOpen(false);
    if (notification.link) {
      navigate(`/notifications/${notification.id}`);
    }
  };

  return (
    <div ref={containerRef} className="relative max-sm:static">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Notifications"
        className="relative rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)]"
      >
        <Bell className="size-5" aria-hidden="true" />
        {!!unreadCount && (
          <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-3 top-[calc(100%+0.5rem)] z-50 mx-auto w-auto max-w-sm overflow-hidden sm:inset-x-auto sm:right-0 sm:mx-0 sm:w-80 sm:max-w-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--color-text)]">Notifications</p>
              {!!unreadCount && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="flex items-center gap-1 text-xs text-[var(--color-primary)] transition-colors disabled:opacity-60"
                >
                  <CheckCheck className="size-3.5" aria-hidden="true" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : data && data.results.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">You're all caught up.</p>
              ) : (
                data?.results.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleSelect(notification)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-[var(--color-border)] px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-[var(--color-bg-subtle)]",
                      !notification.is_read && "bg-[var(--color-primary)]/5",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {!notification.is_read && (
                        <span className="size-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                      )}
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">{notification.title}</p>
                    </div>
                    <p className="line-clamp-2 text-xs text-[var(--color-text-muted)]">{notification.message}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      {categoryLabel(notification.category)} · {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate("/notifications");
              }}
              className="block w-full border-t border-[var(--color-border)] px-4 py-2.5 text-center text-sm text-[var(--color-primary)] transition-colors hover:bg-[var(--color-bg-subtle)]"
            >
              View all
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
