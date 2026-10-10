import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useCurrentUser } from "@/features/auth/useAuth";
import { useMySchool } from "@/features/schools/useSchoolsCrud";
import type { ApiError } from "@/lib/api-client";

import { TermReportView } from "./TermReportView";
import { useMyResultDetail } from "./useAcademicsCrud";

export function MyResultDetailPage() {
  const { schoolClassId, termId } = useParams<{ schoolClassId: string; termId: string }>();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: school } = useMySchool();
  const { data: report, isLoading, isError, error } = useMyResultDetail(schoolClassId, termId);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !report) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Result not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/my-results")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to my results
      </button>
      <TermReportView report={report} studentName={user?.full_name ?? "Student"} school={school} />
    </div>
  );
}
