import { useYearContext } from "./useYearContext";

const STATUS_LABEL = { active: "active", upcoming: "upcoming", closed: "closed" } as const;

/** A *viewing* year picker. Choosing a year only changes what the page shows (the value goes to the page's own
 * `academic_year` filter); it never changes the school's active year. An empty value means "the current view". */
export function YearSelect({
  value,
  onChange,
  label = "Academic year",
  allLabel = "Current",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  allLabel?: string;
}) {
  const { data } = useYearContext();
  if (!data || data.years.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
      >
        <option value="">{allLabel}</option>
        {data.years.map((year) => (
          <option key={year.id} value={year.id}>
            {year.name} ({STATUS_LABEL[year.status]})
          </option>
        ))}
      </select>
    </label>
  );
}
