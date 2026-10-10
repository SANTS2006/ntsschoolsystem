import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileLink } from "@/components/ui/FileLink";
import { Spinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { useAssessmentSubmissions } from "./useAcademicsCrud";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** For the teacher, on the grading page: who has handed in what, with each file openable in the viewer, so the work
 * can be read and then marked in the grade table below. */
export function SubmissionsPanel({ assessmentId }: { assessmentId: string }) {
  const { data, isLoading, isError, error } = useAssessmentSubmissions(assessmentId);
  if (isLoading) return <Spinner />;
  if (isError || !data) {
    return <p className="text-sm text-[var(--color-danger)]">{(error as ApiError | null)?.message ?? "Could not load submissions."}</p>;
  }

  const stateBadge =
    data.upload_state === "open" ? (
      <Badge tone="success">Uploads open</Badge>
    ) : data.upload_state === "closed" ? (
      <Badge tone="warning">Uploads closed</Badge>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Student files{" "}
          <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
            {data.submitted_count} of {data.student_count} handed in
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
          {stateBadge}
          {data.upload_deadline ? <span>Deadline {when(data.upload_deadline)}.</span> : <span>No deadline set.</span>}
          <span>Edit the assessment to change the deadline or reopen uploads.</span>
        </div>
        {data.rows.length === 0 ? (
          <EmptyState title="No enrolled students" description="Enroll students to receive their work." />
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {data.rows.map((row) => (
              <li key={row.student} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="sm:w-56">
                  <p className="text-sm font-medium text-[var(--color-text)]">{row.student_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {row.student_admission_number}
                    {row.submitted_at && ` · ${when(row.submitted_at)}`}
                  </p>
                  {row.raw_score !== null && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Marked: {row.raw_score} / {data.max_score}
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {row.files.length === 0 ? (
                    <span className="text-sm text-[var(--color-text-muted)]">Nothing handed in</span>
                  ) : (
                    row.files.map((file) => <FileLink key={file.id} url={file.url} label={file.name} />)
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
