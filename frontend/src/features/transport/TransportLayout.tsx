import { Outlet } from "react-router-dom";

export function TransportLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Transport</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Vehicles, routes, and student pickup assignments.</p>
      </div>

      <Outlet />
    </div>
  );
}
