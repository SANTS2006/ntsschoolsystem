import { MessageCircle, Search, UserPlus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasRole } from "@/features/auth/useAuth";
import { useStudents } from "@/features/students/useStudents";
import type { ApiError } from "@/lib/api-client";

import { useSubjectsHomePath } from "./useSubjectsHomePath";
import {
  useCreateSubjectEnrollment,
  useDeleteSubjectEnrollment,
  useSubjectEnrollmentList,
  useSubjectOffering,
} from "./useAcademicsCrud";

export function SubjectOfferingRosterPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const subjectsHome = useSubjectsHomePath();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isTeacher = useHasRole("teacher");

  const { data: offering, isLoading: isLoadingOffering } = useSubjectOffering(id);
  const { data: enrollments, isLoading: isLoadingEnrollments } = useSubjectEnrollmentList({
    page_size: 200,
    subject_offering: id,
  });
  // Wait for the offering so the roster picker is never briefly the whole school's students.
  const { data: classStudents } = useStudents(
    { page_size: 500, current_class: offering?.school_class },
    { enabled: !!offering },
  );
  const createEnrollment = useCreateSubjectEnrollment();
  const deleteEnrollment = useDeleteSubjectEnrollment();

  const [search, setSearch] = useState("");
  const [enrolledSearch, setEnrolledSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [isEnrolling, setIsEnrolling] = useState(false);

  const enrolledStudentIds = useMemo(
    () => new Set(enrollments?.results.map((row) => row.student) ?? []),
    [enrollments],
  );
  const availableStudents = useMemo(
    () => classStudents?.results.filter((student) => !enrolledStudentIds.has(student.id)) ?? [],
    [classStudents, enrolledStudentIds],
  );
  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableStudents;
    return availableStudents.filter(
      (student) => student.full_name.toLowerCase().includes(q) || student.admission_number.toLowerCase().includes(q),
    );
  }, [availableStudents, search]);
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every((s) => selectedStudentIds.has(s.id));
  const visibleEnrollments = useMemo(() => {
    const q = enrolledSearch.trim().toLowerCase();
    const rows = enrollments?.results ?? [];
    if (!q) return rows;
    return rows.filter(
      (row) => row.student_name.toLowerCase().includes(q) || row.student_admission_number.toLowerCase().includes(q),
    );
  }, [enrollments, enrolledSearch]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleStudents.forEach((s) => next.delete(s.id));
      } else {
        visibleStudents.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const handleEnroll = async () => {
    if (!id || selectedStudentIds.size === 0) return;
    setIsEnrolling(true);
    const ids = [...selectedStudentIds];
    const results = await Promise.allSettled(
      ids.map((studentId) => createEnrollment.mutateAsync({ subject_offering: id, student: studentId })),
    );
    setIsEnrolling(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    if (succeeded > 0) {
      showToast({ title: `${succeeded} student${succeeded === 1 ? "" : "s"} enrolled` });
    }
    if (failed > 0) {
      showToast({
        title: `Could not enroll ${failed} student${failed === 1 ? "" : "s"}`,
        tone: "danger",
      });
    }
    setSelectedStudentIds(new Set());
  };

  const handleRemove = async (enrollmentId: string, studentName: string) => {
    const ok = await confirm({
      title: `Remove ${studentName} from this subject?`,
      description: "They will no longer see this subject or its results.",
      tone: "danger",
    });
    if (!ok) return;
    deleteEnrollment.mutate(enrollmentId, {
      onSuccess: () => showToast({ title: "Student removed" }),
      onError: (err: ApiError) => showToast({ title: "Could not remove student", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingOffering) {
    return <FullPageSpinner />;
  }

  if (!offering) {
    return <Alert tone="danger">Subject offering not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(subjectsHome)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        {subjectsHome === "/subjects" ? "Back to subjects" : "Back to subject offerings"}
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {offering.subject_name} — {offering.school_class_name}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {offering.term_name} · {offering.main_teacher_name}
          {offering.assistant_teacher_name && ` + ${offering.assistant_teacher_name}`} · Enrolled students only see
          this subject once added here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add students</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Showing students admitted to {offering.school_class_name} who aren't enrolled in this subject yet. Select
            one or more and enroll them at once.
          </p>

          {availableStudents.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No unenrolled students in this class"
              description="Every student admitted to this class is already enrolled in this subject."
            />
          ) : (
            <>
              <div className="max-w-sm">
                <Input
                  icon={Search}
                  placeholder="Search by name or admission number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search students"
                />
              </div>

              <div className="max-h-80 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
                <label className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm font-medium text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="size-4 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] accent-[var(--color-primary)]"
                  />
                  Select all ({visibleStudents.length})
                </label>
                {visibleStudents.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-[var(--color-text-muted)]">No students match "{search}".</p>
                ) : (
                  visibleStudents.map((student) => (
                    <label
                      key={student.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] last:border-b-0 hover:bg-[var(--color-bg-subtle)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.has(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        className="size-4 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] accent-[var(--color-primary)]"
                      />
                      <span className="font-medium">{student.full_name}</span>
                      <span className="text-[var(--color-text-muted)]">({student.admission_number})</span>
                    </label>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--color-text-muted)]">
                  {selectedStudentIds.size} student{selectedStudentIds.size === 1 ? "" : "s"} selected
                </p>
                <Button onClick={handleEnroll} disabled={selectedStudentIds.size === 0} isLoading={isEnrolling}>
                  {!isEnrolling && <UserPlus className="size-4" aria-hidden="true" />}
                  Enroll {selectedStudentIds.size > 0 ? selectedStudentIds.size : ""} student
                  {selectedStudentIds.size === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrolled students</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoadingEnrollments ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !enrollments || enrollments.results.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students enrolled yet"
              description="Add students to this subject using the picker above."
            />
          ) : (
            <>
            <div className="max-w-sm">
              <Input
                icon={Search}
                placeholder="Search by name or admission number"
                value={enrolledSearch}
                onChange={(e) => setEnrolledSearch(e.target.value)}
                aria-label="Search enrolled students"
              />
            </div>
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Student</TableHeaderCell>
                    <TableHeaderCell>Admission #</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {visibleEnrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell className="font-medium">{enrollment.student_name}</TableCell>
                      <TableCell>{enrollment.student_admission_number}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isTeacher && (
                            <button
                              type="button"
                              onClick={() => navigate(`/academics/subject-offerings/${id}/students/${enrollment.student}/messages`)}
                              aria-label={`Message ${enrollment.student_name}`}
                              title="Private message"
                              className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                            >
                              <MessageCircle className="size-4" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemove(enrollment.id, enrollment.student_name)}
                            aria-label={`Remove ${enrollment.student_name}`}
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
