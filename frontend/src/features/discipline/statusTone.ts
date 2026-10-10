import type { BadgeTone } from "@/components/ui/Badge";

import type { DisciplineSeverity, DisciplineStatus } from "./types";

export function severityTone(severity: DisciplineSeverity): BadgeTone {
  switch (severity) {
    case "minor":
      return "neutral";
    case "moderate":
      return "warning";
    case "severe":
      return "danger";
    default:
      return "neutral";
  }
}

export function incidentStatusTone(status: DisciplineStatus): BadgeTone {
  switch (status) {
    case "reported":
      return "warning";
    case "under_review":
      return "primary";
    case "resolved":
      return "success";
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
