import type { BadgeTone } from "@/components/ui/Badge";

const SUCCESS = new Set(["active", "paid", "present", "published", "locked"]);
const WARNING = new Set(["partially_paid", "late", "early_departure", "pending", "applicant", "admitted"]);
const DANGER = new Set(["absent", "cancelled", "withdrawn", "archived", "overdue"]);

/** Every report's `by_status` breakdown mixes rows from a different domain's own status enum
 * (Student, Attendance, Invoice) — rather than importing and matching each domain's own
 * `*StatusTone` helper one-by-one, a single keyword-based mapping covers every value seen across
 * all four report endpoints, since this is a summary badge, not a domain page in its own right. */
export function reportStatusTone(status: string): BadgeTone {
  if (SUCCESS.has(status)) return "success";
  if (WARNING.has(status)) return "warning";
  if (DANGER.has(status)) return "danger";
  return "neutral";
}

export function reportStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
