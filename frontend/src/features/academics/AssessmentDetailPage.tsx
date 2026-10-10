import { ClipboardCheck } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { SubmissionsPanel } from "./SubmissionsPanel";
import { useAssessment, useSubjectOffering } from "./useAcademicsCrud";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

/** One assessment, for the teacher: what it is, whether students can still upload and until when, and every
 * enrolled student with the files they handed in (open any of them), then straight on to marking. */
export function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: assessment, isLoading, isError, error } = useAssessment(id);
  const { data: offering, isLoading: isLoadingOffering } = useSubjectOffering(assessment?.subject_offering);

  if (isLoading || (assessment && isLoadingOffering)) return <FullPageSpinner />;
  // This page belongs to the subject's own teacher. Anyone else — administrators, the principal, the exams director —
  // is told it doesn't exist rather than that it is off limits.
  if (isError || !assessment || !offering?.is_my_subject) {
    return <Alert tone="danger">{isError ? ((error as ApiError | null)?.message ?? "Page not found.") : "Page not found."}</Alert>;
  }

  const uploadBadge =
    assessment.upload_state === "open" ? (
      <Badge tone="success">Uploads open</Badge>
    ) : assessment.upload_state === "closed" ? (
      <Badge tone="warning">Uploads closed</Badge>
    ) : (
      <Badge tone="neutral">No file uploads</Badge>
    );

  return (
    <div className="flex flex-col gap-6">
      <button type="button" onClick={() => navigate(`/academics/subject-offerings/${assessment.subject_offering}/ca`)} className="back-button">
        <BackArrowIcon className="size-4" />
        Back to continuous assessment
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{assessment.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {assessment.subject_offering_name} — {assessment.school_class_name} · {assessment.term_name}
          </p>
        </div>
        <Button onClick={() => navigate(`/academics/assessments/${assessment.id}/scores`)}>
          <ClipboardCheck className="size-4" aria-hidden="true" />
          Mark / enter scores
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Weight</p>
            <p className="text-lg font-semibold text-[var(--color-text)]">{assessment.weight}%</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Max score</p>
            <p className="text-lg font-semibold text-[var(--color-text)]">{Number(assessment.max_score)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Reserved for discretion</p>
            <p className="text-lg font-semibold text-[var(--color-text)]">{assessment.discretionary_weight || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Status</p>
            <Badge tone={assessment.status === "active" ? "success" : "neutral"}>{assessment.status === "active" ? "Active" : "Inactive"}</Badge>
          </div>
          {assessment.allow_file_uploads && (
            <div className="col-span-2 flex flex-col gap-1 sm:col-span-4">
              <div className="flex flex-wrap items-center gap-2">
                {uploadBadge}
                <span className="text-sm text-[var(--color-text-muted)]">
                  {assessment.upload_deadline ? `Deadline ${when(assessment.upload_deadline)}` : "No deadline"}
                </span>
              </div>
              {assessment.upload_instructions && <p className="text-sm text-[var(--color-text)]">{assessment.upload_instructions}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {assessment.allow_file_uploads ? (
        <SubmissionsPanel assessmentId={assessment.id} />
      ) : (
        <Alert tone="info">
          This assessment doesn&apos;t take file uploads. Edit it from the continuous assessment page and turn on &ldquo;Students upload files&rdquo; to
          receive students&apos; work here.
        </Alert>
      )}
    </div>
  );
}
