import { Outlet } from "react-router-dom";

export function FinanceLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Finance</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Fee structures, invoices, and payments.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
