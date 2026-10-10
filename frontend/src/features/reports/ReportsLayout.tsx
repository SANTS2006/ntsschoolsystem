import { Outlet } from "react-router-dom";

export function ReportsLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Reports</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          School-wide summaries across enrollment, attendance, academic performance, and finance.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
