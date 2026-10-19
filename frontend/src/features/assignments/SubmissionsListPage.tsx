import { CheckCircle2, FileCheck, Paperclip, Pencil, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { statusLabel, submissionStatusTone } from "./statusTone";
import { useAssignment, useDeleteSubmission, useSubmissionList } from "./useAssignmentsCrud";

export function SubmissionsListPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("assignments.update");
  const canDelete = useHasPermission("assignments.delete");

  const { data: assignment, isLoading: isLoadingAssignment } = useAssignment(assignmentId);
  const { data, isLoading, isError, error } = useSubmissionList(
    { search: debouncedSearch || undefined, assignment: assignmentId, page_size: 100 },
    { enabled: !!assignmentId },
  );
  const { data: stats } = useSummaryStats("assignment-submissions", { assignment: assignmentId });
  const deleteSubmission = useDeleteSubmission();

  const handleDelete = async (id: string, student: string) => {
    const ok = await confirm({
      title: `Delete ${student}'s submission?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteSubmission.mutate(id, {
      onSuccess: () => showToast({ title: "Submission deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingAssignment) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/assignments")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to assignments
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input icon={Search} placeholder="Search by student or assignment" aria-label="Search by student or assignment" value={search} onChange={(e) => { setSearch(e.target.value); }} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Submissions for {assignment?.title ?? "this assignment"}
        </h2>
        <ExportCsvButton
          path="/assignment-submissions/"
          params={{ assignment: assignmentId, search: debouncedSearch || undefined }}
          filename="assignment_submissions.csv"
        />
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total submissions", value: stats.total as number, icon: FileCheck },
              {
                key: "graded",
                label: "Graded",
                value: (stats.by_status as Record<string, number> | undefined)?.graded ?? 0,
                tone: "success",
                icon: CheckCircle2,
              },
            ]}
          />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={FileCheck} title="No submissions yet" description="Submissions will appear here once students turn in work." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Submitted at</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Score</TableHeaderCell>
                <TableHeaderCell>Attachment</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium">{submission.student_name}</TableCell>
                  <TableCell>{new Date(submission.submitted_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge tone={submissionStatusTone(submission.status)}>{statusLabel(submission.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    {submission.score !== null ? (
                      `${submission.score}/${assignment?.max_score ?? "—"}`
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <OpenFileButton
                      url={submission.attachment}
                      title={`${submission.student_name ?? "Submission"} attachment`}
                      className="flex items-center gap-1 text-[var(--color-primary)]"
                    >
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      View
                    </OpenFileButton>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => navigate(`/assignments/${assignmentId}/submissions/${submission.id}/grade`)}
                          aria-label={`Grade ${submission.student_name}'s submission`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(submission.id, submission.student_name)}
                          aria-label={`Delete ${submission.student_name}'s submission`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
