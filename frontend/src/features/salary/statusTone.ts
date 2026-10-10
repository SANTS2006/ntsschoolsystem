import type { BadgeTone } from "@/components/ui/Badge";

import type { SalaryPaymentStatus } from "./types";

export function salaryPaymentStatusTone(status: SalaryPaymentStatus): BadgeTone {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
      return "warning";
    case "cancelled":
      return "danger";
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
