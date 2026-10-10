import { Outlet } from "react-router-dom";

export function MedicalLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Medical</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Student medical profiles and clinic visits.</p>
      </div>

      <Outlet />
    </div>
  );
}
