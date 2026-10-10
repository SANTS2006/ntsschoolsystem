import type { BadgeTone } from "@/components/ui/Badge";

import type { EventCategory, EventStatus, TargetType } from "./types";

/** Same shape/meaning as `features/communications/statusTone.ts`'s `targetTypeLabel` — the
 * backend's `TargetType` enum is identical for both domains. */
const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  school: "Entire school",
  class: "Class",
  section: "Section",
  department: "Department",
  staff: "All staff",
  students: "All students",
  parents: "All parents",
  specific_users: "Specific users",
};

export function targetTypeLabel(targetType: TargetType): string {
  return TARGET_TYPE_LABELS[targetType];
}

const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic",
  sports: "Sports",
  cultural: "Cultural",
  meeting: "Meeting",
  holiday: "Holiday",
  other: "Other",
};

export function categoryLabel(category: EventCategory): string {
  return CATEGORY_LABELS[category];
}

export function eventStatusTone(status: EventStatus): BadgeTone {
  switch (status) {
    case "published":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function eventStatusLabel(status: EventStatus): string {
  return status[0].toUpperCase() + status.slice(1);
}
