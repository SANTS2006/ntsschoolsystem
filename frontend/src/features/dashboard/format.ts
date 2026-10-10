import type { KpiFormat } from "./types";

export function formatValue(value: number | string | null, format: KpiFormat): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  switch (format) {
    case "percent":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case "currency":
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    default:
      return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
}
