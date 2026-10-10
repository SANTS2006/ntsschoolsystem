import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { categoryLabel, priorityLabel, priorityTone } from "./priorityTone";
import { useMarkNotificationRead, useNotification } from "./useNotificationsCrud";

// Links the server has sent that don't have a page of their own in the app — the message itself
// (shown in full here) is the content, so there is nothing further to "open".
const NO_TARGET_PREFIXES = ["/announcements/"];

export function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: notification, isLoading, isError, error } = useNotification(id);
  const markRead = useMarkNotificationRead();

  // Opening a notification reads it.
  useEffect(() => {
    if (notification && !notification.is_read && !markRead.isPending) {
      markRead.mutate(notification.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification?.id, notification?.is_read]);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !notification) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Notification not found."}</Alert>;
  }

  const hasTarget = !!notification.link && !NO_TARGET_PREFIXES.some((prefix) => notification.link.startsWith(prefix));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/notifications")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to notifications
        </button>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Notification</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <CardTitle>{notification.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{categoryLabel(notification.category)}</Badge>
            <Badge tone={priorityTone(notification.priority)}>{priorityLabel(notification.priority)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            Received {new Date(notification.created_at).toLocaleString()}
            {notification.read_at && ` · read ${new Date(notification.read_at).toLocaleString()}`}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">{notification.message}</p>
          {hasTarget && (
            <div>
              <Button variant="secondary" size="sm" onClick={() => navigate(notification.link)}>
                <ExternalLink className="size-4" aria-hidden="true" /> Open related page
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
