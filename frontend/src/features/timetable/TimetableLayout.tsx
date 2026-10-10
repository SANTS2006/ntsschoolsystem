import { Outlet } from "react-router-dom";

export function TimetableLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Timetable</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Weekly class schedules, periods, and rooms.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
