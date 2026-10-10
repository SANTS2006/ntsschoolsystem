import { Outlet } from "react-router-dom";

export function LibraryLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Library</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Books, copies, and circulation.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
