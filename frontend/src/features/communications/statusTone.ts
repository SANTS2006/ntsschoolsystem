import type { BadgeTone } from "@/components/ui/Badge";

import type { TargetType } from "./types";

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

export function publishedTone(publishedAt: string | null): BadgeTone {
  return publishedAt ? "success" : "neutral";
}
