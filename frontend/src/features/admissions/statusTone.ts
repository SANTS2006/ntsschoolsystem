import type { BadgeTone } from "@/components/ui/Badge";

import type { ApplicationStatus } from "./types";

export function applicationStatusTone(status: ApplicationStatus): BadgeTone {
  switch (status) {
    case "submitted":
      return "neutral";
    case "shortlisted":
      return "primary";
    case "interview_scheduled":
      return "warning";
    case "accepted":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

export function applicationStatusLabel(status: ApplicationStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "shortlisted":
      return "Shortlisted";
    case "interview_scheduled":
      return "Interview scheduled";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}
