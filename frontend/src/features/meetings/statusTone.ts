import type { BadgeTone } from "@/components/ui/Badge";

import type { EmailStatus, MeetingStatus } from "./types";

export function meetingStatusTone(status: MeetingStatus): BadgeTone {
  switch (status) {
    case "live":
      return "success";
    case "scheduled":
      return "primary";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function emailStatusTone(status: EmailStatus): BadgeTone {
  switch (status) {
    case "sent":
      return "success";
    case "failed":
      return "danger";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
}

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  sent: "Emailed",
  pending: "Sending…",
  failed: "Failed",
  no_email: "No email",
};

export function formatMeetingTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
