import type { BadgeTone } from "@/components/ui/Badge";

import type { AttendanceStatus } from "./types";

export function attendanceStatusTone(status: AttendanceStatus): BadgeTone {
  switch (status) {
    case "present":
      return "success";
    case "late":
    case "early_departure":
      return "warning";
    case "excused":
      return "primary";
    case "absent":
      return "danger";
    default:
      return "neutral";
  }
}

export function attendanceStatusLabel(status: AttendanceStatus): string {
  switch (status) {
    case "early_departure":
      return "Early departure";
    default:
      return status[0].toUpperCase() + status.slice(1);
  }
}
