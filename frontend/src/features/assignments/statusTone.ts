import type { BadgeTone } from "@/components/ui/Badge";

import type { SubmissionStatus } from "./types";

export function submissionStatusTone(status: SubmissionStatus): BadgeTone {
  switch (status) {
    case "submitted":
      return "primary";
    case "late":
      return "warning";
    case "graded":
      return "success";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string): string {
  return status[0].toUpperCase() + status.slice(1);
}
