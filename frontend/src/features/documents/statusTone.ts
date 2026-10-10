import type { BadgeTone } from "@/components/ui/Badge";

import type { OwnerType } from "./types";

const OWNER_TYPE_LABELS: Record<OwnerType, string> = {
  school: "School-wide",
  student: "Student",
  staff: "Staff",
};

export function ownerTypeLabel(ownerType: OwnerType): string {
  return OWNER_TYPE_LABELS[ownerType];
}

export function ownerTypeTone(ownerType: OwnerType): BadgeTone {
  switch (ownerType) {
    case "school":
      return "primary";
    case "student":
      return "success";
    case "staff":
      return "warning";
    default:
      return "neutral";
  }
}
