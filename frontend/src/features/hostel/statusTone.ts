import type { BadgeTone } from "@/components/ui/Badge";

import type { AllocationStatus } from "./types";

export function allocationStatusTone(status: AllocationStatus): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "checked_out":
      return "neutral";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
