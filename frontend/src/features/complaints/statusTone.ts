import type { BadgeTone } from "@/components/ui/Badge";

import type { ComplaintCategory, ComplaintPriority, ComplaintStatus } from "./types";

const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic",
  facility: "Facility",
  behavioral: "Behavioral",
  administrative: "Administrative",
  other: "Other",
};

export function categoryLabel(category: ComplaintCategory): string {
  return CATEGORY_LABELS[category];
}

export function priorityTone(priority: ComplaintPriority): BadgeTone {
  switch (priority) {
    case "high":
      return "danger";
    case "normal":
      return "warning";
    default:
      return "neutral";
  }
}

export function priorityLabel(priority: ComplaintPriority): string {
  return priority[0].toUpperCase() + priority.slice(1);
}

export function statusTone(status: ComplaintStatus): BadgeTone {
  switch (status) {
    case "resolved":
      return "success";
    case "rejected":
      return "danger";
    case "under_review":
      return "primary";
    default:
      return "neutral";
  }
}

export function statusLabel(status: ComplaintStatus): string {
  return status
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
