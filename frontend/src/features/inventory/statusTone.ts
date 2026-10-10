import type { BadgeTone } from "@/components/ui/Badge";

import type { TransactionType } from "./types";

export function transactionTypeLabel(type: TransactionType): string {
  return type === "stock_in" ? "Stock in" : "Stock out";
}

export function transactionTypeTone(type: TransactionType): BadgeTone {
  return type === "stock_in" ? "success" : "warning";
}
