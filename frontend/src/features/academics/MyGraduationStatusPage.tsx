import { Alert } from "@/components/ui/Alert";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { GraduationStatusView } from "./GraduationStatusView";
import { useMyGraduationStatus } from "./useAcademicsCrud";

export function MyGraduationStatusPage() {
  const { data: status, isLoading, isError, error } = useMyGraduationStatus();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !status) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Graduation Status</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Your progress toward graduation, based on your school's class structure and your academic history.
        </p>
      </div>
      <GraduationStatusView status={status} />
    </div>
  );
}
