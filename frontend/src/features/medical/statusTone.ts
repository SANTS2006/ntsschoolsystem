import type { BadgeTone } from "@/components/ui/Badge";

import type { VisitType } from "./types";

export function visitTypeTone(visitType: VisitType): BadgeTone {
  switch (visitType) {
    case "routine":
      return "neutral";
    case "incident":
      return "warning";
    case "emergency":
      return "danger";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string): string {
  return status[0].toUpperCase() + status.slice(1);
}
