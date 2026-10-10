import { Outlet } from "react-router-dom";

export function SalaryLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Salary</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Payroll structures, staff assignments, and salary payments.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
