import { Outlet } from "react-router-dom";

export function HostelLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Hostel</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Hostels, rooms, beds, and student allocations.</p>
      </div>

      <Outlet />
    </div>
  );
}
