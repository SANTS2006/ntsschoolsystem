import type { BadgeTone } from "@/components/ui/Badge";

import type { InvoiceStatus, PaymentStatus } from "./types";

export function invoiceStatusTone(status: InvoiceStatus): BadgeTone {
  switch (status) {
    case "paid":
      return "success";
    case "partially_paid":
      return "warning";
    case "unpaid":
      return "neutral";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function paymentStatusTone(status: PaymentStatus): BadgeTone {
  switch (status) {
    case "completed":
      return "success";
    case "partially_refunded":
      return "warning";
    case "refunded":
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
