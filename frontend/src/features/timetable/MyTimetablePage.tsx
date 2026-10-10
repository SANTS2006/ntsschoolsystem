import { CalendarClock } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import type { DayOfWeek } from "./types";
import { useMyTimetable } from "./useTimetableCrud";

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

export function MyTimetablePage() {
  const { data: entries, isLoading, isError, error } = useMyTimetable();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">My Timetable</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your weekly schedule.</p>
        </div>
        <EmptyState icon={CalendarClock} title="No timetable yet" description="Nothing has been scheduled for you yet." />
      </div>
    );
  }

  const byDay = DAYS.map((day) => ({
    ...day,
    entries: entries
      .filter((entry) => entry.day_of_week === day.value)
      .sort((a, b) => a.period_start_time.localeCompare(b.period_start_time) || a.period_order - b.period_order),
  })).filter((day) => day.entries.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Timetable</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your weekly schedule.</p>
      </div>

      <div className="flex flex-col gap-4">
        {byDay.map((day) => (
          <Card key={day.value}>
            <CardHeader>
              <CardTitle>{day.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {entry.subject_name ?? <span className="text-[var(--color-text-muted)]">Free period</span>}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {entry.period_name} · {entry.period_start_time} – {entry.period_end_time}
                    </p>
                  </div>
                  <div className="text-right text-xs text-[var(--color-text-muted)]">
                    {entry.teacher_name && <p>{entry.teacher_name}</p>}
                    {entry.room_name && <p>{entry.room_name}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
