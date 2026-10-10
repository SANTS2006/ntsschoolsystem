import type { BadgeTone } from "@/components/ui/Badge";

import type { BookCopyStatus, LoanStatus, ReservationStatus } from "./types";

export function copyStatusTone(status: BookCopyStatus): BadgeTone {
  switch (status) {
    case "available":
      return "success";
    case "borrowed":
      return "primary";
    case "reserved":
      return "warning";
    case "lost":
    case "damaged":
      return "danger";
    default:
      return "neutral";
  }
}

export function loanStatusTone(status: LoanStatus): BadgeTone {
  switch (status) {
    case "borrowed":
      return "primary";
    case "returned":
      return "success";
    case "lost":
      return "danger";
    default:
      return "neutral";
  }
}

export function reservationStatusTone(status: ReservationStatus): BadgeTone {
  switch (status) {
    case "pending":
      return "warning";
    case "approved":
    case "fulfilled":
      return "success";
    case "rejected":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string): string {
  return status[0].toUpperCase() + status.slice(1);
}
