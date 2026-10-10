import { Navigate, Outlet } from "react-router-dom";

import { FullPageSpinner } from "@/components/ui/Spinner";
import { useCurrentUser } from "@/features/auth/useAuth";

/** Roles that work from Examinations and have no business in Academics. */
const EXAMS_ONLY_ROLES = new Set(["exams-director"]);

export function AcademicsLayout() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <FullPageSpinner />;

  // The exams team sees grades through Examinations; the Academics module (years, terms, subjects, classes,
  // offerings) isn't theirs, even by typing its address.
  if (user && user.roles.length > 0 && user.roles.every((role) => EXAMS_ONLY_ROLES.has(role.slug))) {
    return <Navigate to="/examinations" replace />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Academics</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Academic years, terms, departments, subjects, classes and sections.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
