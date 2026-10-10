import type { BadgeTone } from "@/components/ui/Badge";

import type { EmploymentStatus } from "./types";

export function employmentStatusTone(status: EmploymentStatus): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "on_leave":
      return "warning";
    case "terminated":
      return "danger";
    default:
      return "neutral";
  }
}
