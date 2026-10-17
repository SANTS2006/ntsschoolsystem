import { CalendarRange, TriangleAlert } from "lucide-react";

import { useYearContext } from "./useYearContext";
import { hasEnded } from "./yearEnded";

/** The school's active academic year, shown in the shared header so everyone knows which year they are working in.
 * The value comes from the server; when there is none, that is said plainly instead of showing a guess. */
export function YearBadge() {
  const { data, isLoading, isError } = useYearContext();
  if (isLoading || isError || !data) return null;

  if (!data.active) {
    return (
      <span
        title="No academic year is active. An administrator needs to activate one under Academics → Academic years."
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-warning)]"
      >
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">No active year</span>
      </span>
    );
  }

  const ended = hasEnded(data.active);
  return (
    <span
      title={ended ? `${data.active.name} has ended — an administrator should run the year rollover.` : `Active academic year${data.current_term ? ` · ${data.current_term.name}` : ""}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)]"
    >
      <CalendarRange className="size-3.5 text-[var(--color-primary)]" aria-hidden="true" />
      <span>{data.active.name}</span>
      {data.current_term && !ended && <span className="hidden text-[var(--color-text-muted)] md:inline">· {data.current_term.name}</span>}
      {ended && <span className="rounded-full bg-[var(--color-warning)]/15 px-1.5 text-[10px] font-semibold uppercase text-[var(--color-warning)]">ended</span>}
    </span>
  );
}
