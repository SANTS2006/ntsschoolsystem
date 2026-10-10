import type { BadgeTone } from "@/components/ui/Badge";

import type { LiveSessionStatus } from "./types";

export function statusTone(status: LiveSessionStatus): BadgeTone {
  switch (status) {
    case "live":
      return "success";
    case "ended":
      return "neutral";
    case "cancelled":
      return "danger";
    default:
      return "primary";
  }
}
