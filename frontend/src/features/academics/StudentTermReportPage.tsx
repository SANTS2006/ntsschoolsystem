import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useMySchool } from "@/features/schools/useSchoolsCrud";
import type { ApiError } from "@/lib/api-client";

import { TermReportView } from "./TermReportView";
import { useStudentTermReport } from "./useAcademicsCrud";

export function StudentTermReportPage() {
  const { studentId, schoolClassId, termId } = useParams<{
    studentId: string;
    schoolClassId: string;
    termId: string;
  }>();
  const navigate = useNavigate();
  const { data: school } = useMySchool();
  const { data: report, isLoading, isError, error } = useStudentTermReport(studentId, schoolClassId, termId);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !report) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Report not found."}</Alert>;
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
      <TermReportView report={report} studentName={report.student_name ?? "Student"} school={school} />
    </div>
  );
}
