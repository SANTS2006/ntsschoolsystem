import type { BadgeTone } from "@/components/ui/Badge";

import type { SchoolStatus } from "./types";

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function schoolStatusTone(status: SchoolStatus): BadgeTone {
  switch (status) {
    case "pending":
      return "warning";
    case "active":
      return "success";
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}
