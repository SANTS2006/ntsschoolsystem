import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { GraduationStatusView } from "./GraduationStatusView";
import { useStudentGraduationStatus } from "./useAcademicsCrud";

export function StudentGraduationStatusPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: status, isLoading, isError, error } = useStudentGraduationStatus(id);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !status) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back
      </button>
      <GraduationStatusView status={status} />
    </div>
  );
}
