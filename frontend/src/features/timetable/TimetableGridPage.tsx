import { Plus, Wand2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useAllSections } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import { cn } from "@/lib/cn";

import type { DayOfWeek, TimetableEntry } from "./types";
import { useEntryList, usePeriodList } from "./useTimetableCrud";

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
];

function Cell({
  entry,
  canWrite,
  onClick,
}: {
  entry: TimetableEntry | undefined;
  canWrite: boolean;
  onClick: () => void;
}) {
  if (!entry) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!canWrite}
        aria-label="Add a lesson in this slot"
        className="flex h-full min-h-16 w-full items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] transition-colors duration-200 enabled:hover:bg-[var(--color-bg-subtle)] enabled:hover:text-[var(--color-primary)] disabled:cursor-default"
      >
        {canWrite && <Plus className="size-4" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canWrite}
      className="flex h-full min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] p-2 text-left transition-colors duration-200 enabled:hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]"
    >
      <span className="text-sm font-medium text-[var(--color-text)]">
        {entry.subject_name ?? <span className="text-[var(--color-text-muted)]">No subject</span>}
      </span>
      {entry.teacher_name && <span className="text-xs text-[var(--color-text-muted)]">{entry.teacher_name}</span>}
      {entry.room_name && <span className="text-xs text-[var(--color-text-muted)]">{entry.room_name}</span>}
    </button>
  );
}

export function TimetableGridPage() {
  const navigate = useNavigate();
  const canCreate = useHasPermission("timetable.create");
  const canUpdate = useHasPermission("timetable.update");

  const [sectionId, setSectionId] = useState("");
  const { data: sections } = useAllSections();
  const { data: periods, isLoading: isLoadingPeriods } = usePeriodList({ page_size: 100, ordering: "order" });
  const { data: entries, isLoading: isLoadingEntries } = useEntryList({ section: sectionId, page_size: 100 });

  const entryFor = (dayOfWeek: DayOfWeek, periodId: string) =>
    entries?.results.find((entry) => entry.day_of_week === dayOfWeek && entry.period === periodId);

  const openSlot = (dayOfWeek: DayOfWeek, periodId: string) => {
    const existing = entryFor(dayOfWeek, periodId);
    if (existing) {
      if (canUpdate) navigate(`/timetable/entries/${existing.id}/edit`);
      return;
    }
    if (canCreate) {
      navigate(
        `/timetable/entries/new?section=${sectionId}&day=${dayOfWeek}&period=${periodId}`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm">
          <Select label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Choose a section to view its schedule</option>
            {sections?.map((section) => (
              <option key={section.id} value={section.id}>
                {section.school_class_name} - {section.name} ({section.academic_year_name})
              </option>
            ))}
          </Select>
        </div>
        {canCreate && (
          <Button
            variant="secondary"
            onClick={() => navigate(sectionId ? `/timetable/build?section=${sectionId}` : "/timetable/build")}
          >
            <Wand2 className="size-4" aria-hidden="true" />
            Build timetable
          </Button>
        )}
      </div>

      {!sectionId ? (
        <EmptyState title="Pick a section" description="Choose a section above to view or edit its weekly schedule." />
      ) : isLoadingPeriods || isLoadingEntries ? (
        <FullPageSpinner />
      ) : !periods || periods.results.length === 0 ? (
        <Alert tone="warning">No periods have been set up yet — add them under the Periods tab first.</Alert>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-40 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Period
                </th>
                {DAYS.map((day) => (
                  <th
                    key={day.value}
                    className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                  >
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.results.map((period) => (
                <tr key={period.id} className={cn("border-b border-[var(--color-border)] last:border-0", period.is_break && "bg-[var(--color-bg-subtle)]")}>
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-[var(--color-text)]">{period.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {period.start_time.slice(0, 5)}–{period.end_time.slice(0, 5)}
                    </p>
                  </td>
                  {DAYS.map((day) => (
                    <td key={day.value} className="p-1 align-top">
                      <Cell
                        entry={entryFor(day.value, period.id)}
                        canWrite={canCreate || canUpdate}
                        onClick={() => openSlot(day.value, period.id)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
