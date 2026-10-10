import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { StudentUploadPanel } from "./StudentUploadPanel";
import { useMySubjectCA } from "./useAcademicsCrud";

/** A student's page for one assessment: what it is worth, the teacher's instructions and deadline, their uploaded
 * files (add several at once while uploads are open), and the grade once the teacher has submitted it. */
export function MyAssessmentDetailPage() {
  const { id, assessmentId } = useParams<{ id: string; assessmentId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useMySubjectCA(id);

  if (isLoading) return <FullPageSpinner />;
  if (isError) return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  const row = data?.assessments.find((a) => a.assessment === assessmentId);
  if (!row) return <Alert tone="danger">Assessment not found.</Alert>;

  const graded = row.raw_score !== null;

  return (
    <div className="flex flex-col gap-6">
      <button type="button" onClick={() => navigate(`/my-subjects/${id}/ca`)} className="back-button">
        <BackArrowIcon className="size-4" />
        Back to continuous assessment
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{row.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Worth {row.weight}% of your CA · Out of {row.max_score}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your grade</CardTitle>
        </CardHeader>
        <CardContent>
          {graded ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">Score</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {row.raw_score} <span className="text-sm font-normal text-[var(--color-text-muted)]">/ {row.max_score}</span>
                </p>
              </div>
              {row.discretionary_weight > 0 && (
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">From your teacher</p>
                  <p className="text-2xl font-bold text-[var(--color-text)]">
                    {row.discretionary_mark ?? "—"}{" "}
                    <span className="text-sm font-normal text-[var(--color-text-muted)]">/ {row.discretionary_weight}</span>
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">Counts towards your CA</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {row.weighted_score ?? "—"} <span className="text-sm font-normal text-[var(--color-text-muted)]">/ {row.weight}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <Badge tone="neutral">Not graded yet</Badge>
              Your teacher hasn&apos;t published a grade for this assessment.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hand in your work</CardTitle>
        </CardHeader>
        <CardContent>
          {row.allow_file_uploads ? (
            <StudentUploadPanel row={row} />
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">This assessment doesn&apos;t take file uploads.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
