import { Outlet } from "react-router-dom";

export function ProcurementLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Procurement</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Purchase requests, orders, and suppliers.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
