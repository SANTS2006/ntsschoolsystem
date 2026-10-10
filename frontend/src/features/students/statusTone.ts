import type { BadgeTone } from "@/components/ui/Badge";

import type { StudentStatus } from "./types";

export function studentStatusTone(status: StudentStatus): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "admitted":
    case "applicant":
      return "primary";
    case "transferred":
    case "graduated":
      return "neutral";
    case "withdrawn":
    case "archived":
      return "danger";
    default:
      return "neutral";
  }
}
