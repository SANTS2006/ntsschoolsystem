import type { BadgeTone } from "@/components/ui/Badge";

import type { AuditSeverity } from "./types";

export function severityLabel(severity: AuditSeverity): string {
  return severity[0].toUpperCase() + severity.slice(1);
}

export function severityTone(severity: AuditSeverity): BadgeTone {
  switch (severity) {
    case "warning":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}
