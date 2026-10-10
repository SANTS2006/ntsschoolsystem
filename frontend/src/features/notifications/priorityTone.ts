import type { BadgeTone } from "@/components/ui/Badge";

import type { NotificationPriority } from "./types";

export function priorityLabel(priority: NotificationPriority): string {
  return priority[0].toUpperCase() + priority.slice(1);
}

export function priorityTone(priority: NotificationPriority): BadgeTone {
  switch (priority) {
    case "high":
      return "danger";
    case "low":
      return "neutral";
    default:
      return "primary";
  }
}

/** `category` is free text, not an enum — this only prettifies the handful of real values this
 * codebase's own trigger points produce today (`assignment_graded` -> "Assignment graded"),
 * falling back to the raw value untouched for anything else rather than guessing. */
export function categoryLabel(category: string): string {
  return category.split("_").join(" ");
}
