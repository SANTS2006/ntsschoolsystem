import type { BadgeTone } from "@/components/ui/Badge";

import type { PurchaseOrderStatus, PurchaseRequestStatus } from "./types";

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function requestStatusTone(status: PurchaseRequestStatus): BadgeTone {
  switch (status) {
    case "draft":
      return "neutral";
    case "submitted":
      return "warning";
    case "approved":
      return "success";
    case "rejected":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function orderStatusTone(status: PurchaseOrderStatus): BadgeTone {
  switch (status) {
    case "draft":
      return "neutral";
    case "sent":
      return "warning";
    case "partially_received":
      return "primary";
    case "received":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}
