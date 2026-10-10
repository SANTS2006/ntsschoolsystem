import { Outlet } from "react-router-dom";

export function DocumentsLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Documents</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          School, student, and staff files.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
