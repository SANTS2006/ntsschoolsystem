import type { YearSummary } from "./yearApi";

/** True when the active year's end date has passed: time to run the rollover. Dates are compared as plain YYYY-MM-DD strings (no time zones). */
export function hasEnded(year: Pick<YearSummary, "end_date" | "status"> | null | undefined, today: string = new Date().toLocaleDateString("en-CA")): boolean {
  return !!year && year.status === "active" && year.end_date < today;
}
