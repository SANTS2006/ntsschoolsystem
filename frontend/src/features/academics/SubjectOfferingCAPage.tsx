import { ChevronDown, Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { ordinal, rankByScore } from "@/lib/ranking";
import type { ApiError } from "@/lib/api-client";

import { AssessmentFormModal } from "./AssessmentFormModal";
import type { Assessment } from "./types";
import { useSubjectsHomePath } from "./useSubjectsHomePath";
import {
  useAssessmentList,
  useCloseSubjectOfferingCA,
  useDeleteAssessment,
  useReopenSubjectOfferingCA,
  useSubjectOffering,
  useSubjectOfferingCaSummary,
} from "./useAcademicsCrud";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{value}</p>
    </div>
  );
}

export function SubjectOfferingCAPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const subjectsHome = useSubjectsHomePath();
  const { showToast } = useToast();
  const confirm = useConfirm();
  // Opening and closing CA is its own permission (`ca.manage`): the school administrator, principal and exams director hold it.
  const canManageCA = useHasPermission("ca.manage");

  const { data: offering, isLoading: isLoadingOffering } = useSubjectOffering(id);
  // Only the teacher assigned to this subject adds, edits, deletes and grades its assessments; everyone else
  // (administrators, exams staff) sees the CA but gets no edit controls.
  const isTeacher = !!offering?.is_my_subject;
  const canEdit = isTeacher;
  const { data: assessments, isLoading: isLoadingAssessments } = useAssessmentList({
    page_size: 100,
    subject_offering: id,
  });
  const { data: caSummary, isLoading: isLoadingSummary } = useSubjectOfferingCaSummary(id);
  // Highest total CA first (1st, 2nd, ...); equal totals share a position, and students with no score yet come last.
  const rankedStudents = useMemo(() => {
    const students = caSummary?.students ?? [];
    const positions = rankByScore(students, (student) => (student.total_ca === null ? null : Number(student.total_ca)));
    return students
      .map((student) => ({ ...student, position: positions.get(student) ?? null }))
      .sort((x, y) => (x.position ?? Infinity) - (y.position ?? Infinity) || x.student_name.localeCompare(y.student_name));
  }, [caSummary]);
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const deleteAssessment = useDeleteAssessment();
  const closeCA = useCloseSubjectOfferingCA();
  const reopenCA = useReopenSubjectOfferingCA();

  // null = dialog closed; "new" = adding; an Assessment = editing it.
  const [editing, setEditing] = useState<Assessment | "new" | null>(null);
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const handleDelete = async (assessmentId: string, label: string) => {
    const ok = await confirm({ title: `Delete "${label}"?`, description: "This cannot be undone.", tone: "danger" });
    if (!ok) return;
    deleteAssessment.mutate(assessmentId, {
      onSuccess: () => showToast({ title: "Assessment deleted" }),
      onError: (err: ApiError) => showToast({ title: "Could not delete assessment", description: err.message, tone: "danger" }),
    });
  };

  const handleClose = async () => {
    if (!id) return;
    const ok = await confirm({
      title: "Close CA for this subject?",
      description: "Teachers will no longer be able to add or edit assessments or scores until it's reopened.",
      tone: "danger",
    });
    if (!ok) return;
    closeCA.mutate(id, {
      onSuccess: () => showToast({ title: "CA closed" }),
      onError: (err: ApiError) => showToast({ title: "Could not close CA", description: err.message, tone: "danger" }),
    });
  };

  const handleReopen = () => {
    if (!id || !reopenReason.trim()) return;
    reopenCA.mutate(
      { id, reason: reopenReason.trim() },
      {
        onSuccess: () => {
          showToast({ title: "CA reopened" });
          setShowReopenForm(false);
          setReopenReason("");
        },
        onError: (err: ApiError) => showToast({ title: "Could not reopen CA", description: err.message, tone: "danger" }),
      },
    );
  };

  if (isLoadingOffering) {
    return <FullPageSpinner />;
  }

  if (!offering) {
    return <Alert tone="danger">Subject offering not found.</Alert>;
  }

  const isClosed = offering.ca_status === "closed";
  const allocatedShare = Math.min(100, (offering.ca_allocated_percent / Math.max(offering.ca_weight_percent, 1)) * 100);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(subjectsHome)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        {subjectsHome === "/subjects" ? "Back to subjects" : subjectsHome === "/examinations/gradebook" ? "Back to gradebook" : "Back to subject offerings"}
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold text-[var(--color-text)]">
            {offering.subject_name} — {offering.school_class_name}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Continuous assessment · {offering.term_name} · {offering.main_teacher_name}
          </p>
        </div>
        <Badge tone={isClosed ? "danger" : "success"}>{isClosed ? "CA closed" : "CA open"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CA allocation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Configured" value={`${offering.ca_weight_percent}%`} />
            <Stat label="Allocated" value={`${offering.ca_allocated_percent}%`} />
            <Stat label="Remaining" value={`${offering.ca_remaining_percent}%`} />
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]"
            role="progressbar"
            aria-label="CA allocated"
            aria-valuenow={Math.round(allocatedShare)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-all" style={{ width: `${allocatedShare}%` }} />
          </div>

          {canManageCA && (
            <div className="flex flex-wrap items-end gap-3">
              {!isClosed ? (
                <Button variant="secondary" size="sm" onClick={handleClose} isLoading={closeCA.isPending}>
                  <Lock className="size-4" aria-hidden="true" />
                  Close CA
                </Button>
              ) : !showReopenForm ? (
                <Button variant="secondary" size="sm" onClick={() => setShowReopenForm(true)}>
                  <LockOpen className="size-4" aria-hidden="true" />
                  Reopen CA
                </Button>
              ) : (
                <div className="flex w-full flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 basis-56">
                    <Input label="Reason for reopening" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                  </div>
                  <Button size="sm" onClick={handleReopen} disabled={!reopenReason.trim()} isLoading={reopenCA.isPending}>
                    Confirm reopen
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowReopenForm(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
          {offering.ca_closed_at && isClosed && (
            <p className="text-xs text-[var(--color-text-muted)]">Closed on {new Date(offering.ca_closed_at).toLocaleString()}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Assessments</CardTitle>
          {!isClosed && isTeacher && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden="true" /> Add assessment
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoadingAssessments ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !assessments || assessments.results.length === 0 ? (
            <EmptyState
              title="No assessments yet"
              description={isTeacher ? "Add one to start entering continuous assessment scores." : "The subject's teacher hasn't added any yet."}
            />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Weight</TableHeaderCell>
                    <TableHeaderCell>Discretionary</TableHeaderCell>
                    <TableHeaderCell>Max score</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    {canEdit && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
                  </tr>
                </TableHead>
                <TableBody>
                  {assessments.results.map((assessment) => (
                    <TableRowLink key={assessment.id} onClick={isTeacher ? () => navigate(`/academics/assessments/${assessment.id}`) : undefined}>
                      <TableCell className="card-title-cell font-medium">
                        <span className={isTeacher ? "text-[var(--color-primary)]" : undefined}>{assessment.name}</span>
                        {assessment.allow_file_uploads && (
                          <span className="ml-2 inline-flex"><Badge tone={assessment.upload_state === "open" ? "success" : "neutral"}>{assessment.upload_state === "open" ? "Uploads open" : "Uploads closed"}</Badge></span>
                        )}
                      </TableCell>
                      <TableCell>{assessment.weight}%</TableCell>
                      <TableCell>{assessment.discretionary_weight > 0 ? assessment.discretionary_weight : "—"}</TableCell>
                      <TableCell>{Number(assessment.max_score)}</TableCell>
                      <TableCell>
                        <Badge tone={assessment.status === "active" ? "success" : "neutral"}>
                          {assessment.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="secondary" size="sm" onClick={() => navigate(`/academics/assessments/${assessment.id}`)}>
                              Details
                            </Button>
                            {isTeacher && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => navigate(`/academics/assessments/${assessment.id}/scores`)}
                              >
                                Grade entry
                              </Button>
                            )}
                            {!isClosed && isTeacher && (
                              <button
                                type="button"
                                onClick={() => setEditing(assessment)}
                                aria-label={`Edit ${assessment.name}`}
                                title="Edit"
                                className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                              >
                                <Pencil className="size-4" aria-hidden="true" />
                              </button>
                            )}
                            {isTeacher && (
                              <button
                                type="button"
                                onClick={() => handleDelete(assessment.id, assessment.name)}
                                aria-label={`Delete ${assessment.name}`}
                                title="Delete"
                                className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRowLink>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Students&apos; CA</CardTitle>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Each student&apos;s total so far (submitted scores only, out of {offering.ca_weight_percent}). Ranked from the highest total down. Select a student to see the
            full breakdown.
          </p>
        </CardHeader>
        <CardContent>
          {isLoadingSummary ? (
            <Spinner />
          ) : !caSummary || caSummary.students.length === 0 ? (
            <EmptyState title="No students yet" description="No students are registered for this subject." />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell className="w-20">Position</TableHeaderCell>
                    <TableHeaderCell>Student</TableHeaderCell>
                    <TableHeaderCell>Admission #</TableHeaderCell>
                    <TableHeaderCell className="text-right">Total CA</TableHeaderCell>
                    <TableHeaderCell className="w-10">
                      <span className="sr-only">Details</span>
                    </TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {rankedStudents.map((student) => {
                    const isOpen = openStudentId === student.student;
                    return (
                      <Fragment key={student.student}>
                        <TableRow
                          className="cursor-pointer hover:bg-[var(--color-bg-subtle)]"
                          onClick={() => setOpenStudentId(isOpen ? null : student.student)}
                          aria-expanded={isOpen}
                        >
                          <TableCell className="font-semibold text-[var(--color-primary)]">
                            {student.position === null ? <span className="font-normal text-[var(--color-text-muted)]">—</span> : ordinal(student.position)}
                          </TableCell>
                          <TableCell className="font-medium">{student.student_name}</TableCell>
                          <TableCell>{student.admission_number}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {student.total_ca ?? <span className="text-[var(--color-text-muted)]">—</span>}
                          </TableCell>
                          <TableCell>
                            <ChevronDown
                              className={`size-4 text-[var(--color-text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={5} className="max-w-none whitespace-normal bg-[var(--color-bg-subtle)]">
                              {/* One row per assessment — stacks neatly on a phone instead of a wide nested table. */}
                              <ul className="flex flex-col divide-y divide-[var(--color-border)]">
                                {student.breakdown.map((row) => (
                                  <li key={row.assessment} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                                    <div className="min-w-0">
                                      <p className="break-words text-sm font-medium text-[var(--color-text)]">
                                        {row.name} <span className="font-normal text-[var(--color-text-muted)]">· {row.weight}%</span>
                                      </p>
                                      <p className="text-xs text-[var(--color-text-muted)]">
                                        {row.raw_score !== null ? `${row.raw_score} / ${row.max_score}` : "Not scored"}
                                        {row.discretionary_weight > 0 &&
                                          ` + ${row.discretionary_mark ?? "—"} / ${row.discretionary_weight} discretion`}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-semibold text-[var(--color-text)]">{row.weighted_score ?? "—"}</span>
                                      {row.status === "submitted" ? (
                                        <Badge tone="success">Submitted</Badge>
                                      ) : row.status === "draft" ? (
                                        <Badge tone="warning">Draft</Badge>
                                      ) : (
                                        <Badge tone="neutral">Not graded</Badge>
                                      )}
                                    </div>
                                  </li>
                                ))}
                                <li className="flex items-center justify-between gap-4 py-2 text-sm font-semibold text-[var(--color-text)]">
                                  <span>Total CA</span>
                                  <span>{student.total_ca ?? "—"}</span>
                                </li>
                              </ul>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {id && editing !== null && (
        <AssessmentFormModal
          key={editing === "new" ? "new" : editing.id}
          open
          onClose={() => setEditing(null)}
          subjectOfferingId={id}
          assessment={editing === "new" ? null : editing}
          availablePercent={offering.ca_remaining_percent}
        />
      )}
    </div>
  );
}
