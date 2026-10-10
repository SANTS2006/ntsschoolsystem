import type { BadgeTone } from "@/components/ui/Badge";

import type { VehicleStatus } from "./types";

export function vehicleStatusTone(status: VehicleStatus): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "maintenance":
      return "warning";
    case "retired":
      return "danger";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string): string {
  return status[0].toUpperCase() + status.slice(1);
}
