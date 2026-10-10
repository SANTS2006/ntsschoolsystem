import { Bell, BellRing, CheckCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { categoryLabel, priorityLabel, priorityTone } from "./priorityTone";
import type { Notification, NotificationPriority } from "./types";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationList, useUnreadCount } from "./useNotificationsCrud";

const PAGE_SIZE = 25;
const PRIORITIES: NotificationPriority[] = ["low", "normal", "high"];

export function NotificationsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [page, setPage] = useState(1);
  const [isRead, setIsRead] = useState<"" | "true" | "false">("");
  const [priority, setPriority] = useState<NotificationPriority | "">("");

  const filterParams = { is_read: isRead === "" ? undefined : isRead === "true", priority: priority || undefined };
  const { data, isLoading, isError, error, isFetching } = useNotificationList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("notifications", filterParams);
  const { data: unreadCount } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleSelect = (notification: Notification) => {
    if (!notification.is_read) {
      markRead.mutate(notification.id, {
        onError: (err: ApiError) =>
          showToast({ title: "Could not mark as read", description: generalErrorMessage(err), tone: "danger" }),
      });
    }
    navigate(`/notifications/${notification.id}`);
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => showToast({ title: "All notifications marked as read" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not mark all as read", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Notifications</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Updates relevant to you.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/notifications/" params={filterParams} filename="notifications.csv" />
          {!!unreadCount && (
            <Button variant="secondary" size="sm" onClick={handleMarkAllRead} isLoading={markAllRead.isPending}>
              {!markAllRead.isPending && <CheckCheck className="size-4" aria-hidden="true" />}
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total notifications", value: stats.total as number, icon: Bell },
              { key: "unread", label: "Unread", value: stats.unread as number, tone: "warning", icon: BellRing },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-[160px]">
          <Select
            value={isRead}
            onChange={(e) => {
              setIsRead(e.target.value as "" | "true" | "false");
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </Select>
        </div>
        <div className="w-full max-w-[160px]">
          <Select
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as NotificationPriority | "");
              setPage(1);
            }}
          >
            <option value="">All priorities</option>
            {PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {priorityLabel(option)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Notification</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Priority</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((notification) => (
                <TableRow
                  key={notification.id}
                  onClick={() => handleSelect(notification)}
                  className="cursor-pointer transition-colors hover:bg-[var(--color-bg-subtle)]"
                >
                  <TableCell>
                    <div className="flex items-start gap-2">
                      {!notification.is_read && (
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-primary)]"
                          aria-label="Unread"
                        />
                      )}
                      {/* Just the title here — the full message is on the notification's own page. */}
                      <p className={`min-w-0 truncate text-[var(--color-text)] ${notification.is_read ? "" : "font-semibold"}`}>
                        {notification.title}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{categoryLabel(notification.category)}</TableCell>
                  <TableCell>
                    <Badge tone={priorityTone(notification.priority)}>{priorityLabel(notification.priority)}</Badge>
                  </TableCell>
                  <TableCell>{new Date(notification.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-[var(--color-border)]">
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </div>
        </TableContainer>
        </ScrollReveal>
      ) : null}

      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
