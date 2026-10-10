import { BookOpen, ClipboardCheck, GraduationCap, MessageSquare, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission, useHasRole } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useAcademicYears, useSchoolClasses, useSubjects } from "./useAcademicsLookups";
import { useDeleteSubjectOffering, useSubjectOfferingList, useTermList } from "./useAcademicsCrud";

export function SubjectOfferingsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("academics.create");
  const canDelete = useHasPermission("academics.delete");
  const canViewResults = useHasPermission("examinations.view");
  const isTeacher = useHasRole("teacher");

  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [subject, setSubject] = useState("");

  const { data: academicYears } = useAcademicYears();
  const { data: terms } = useTermList({ page_size: 100, academic_year: academicYear || undefined });
  const { data: classes } = useSchoolClasses();
  const { data: subjects } = useSubjects();

  const filterParams = {
    academic_year: academicYear || undefined,
    term: term || undefined,
    school_class: schoolClass || undefined,
    subject: subject || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useSubjectOfferingList({
    page_size: 100,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("academics/subject-offerings", filterParams);
  const deleteOffering = useDeleteSubjectOffering();

  const handleDelete = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Delete "${label}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteOffering.mutate(id, {
      onSuccess: () => showToast({ title: "Subject offering deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Subject Offerings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          A subject as taught to a specific class, for a specific term — with its teacher(s), CA/exam split, and pass mark.
        </p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total offerings", value: stats.total as number, icon: BookOpen }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-[180px]">
            <Select value={academicYear} onChange={(e) => { setAcademicYear(e.target.value); setTerm(""); }}>
              <option value="">All academic years</option>
              {academicYears?.map((year) => (
                <option key={year.id} value={year.id}>{year.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[160px]">
            <Select value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">All terms</option>
              {terms?.results.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[160px]">
            <Select value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)}>
              <option value="">All classes</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[180px]">
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/academics/subject-offerings/" params={filterParams} filename="subject_offerings.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/academics/subject-offerings/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New offering
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subject offerings found"
          description="Try adjusting your filters, or create one to assign a teacher and grading split."
        />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Term</TableHeaderCell>
                <TableHeaderCell>Main teacher</TableHeaderCell>
                <TableHeaderCell>CA / Exam</TableHeaderCell>
                <TableHeaderCell>Pass mark</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((offering) => (
                <TableRowLink
                  key={offering.id}
                  onClick={() => navigate(`/academics/subject-offerings/${offering.id}/edit`)}
                >
                  <TableCell className="font-medium">{offering.subject_name}</TableCell>
                  <TableCell>{offering.school_class_name}</TableCell>
                  <TableCell>{offering.term_name}</TableCell>
                  <TableCell>
                    {offering.main_teacher_name}
                    {offering.assistant_teacher_name && (
                      <span className="text-[var(--color-text-muted)]"> + {offering.assistant_teacher_name}</span>
                    )}
                  </TableCell>
                  <TableCell>{offering.ca_weight_percent}% / {offering.exam_weight_percent}%</TableCell>
                  <TableCell>{offering.pass_mark}%</TableCell>
                  <TableCell>
                    <Badge tone={offering.status === "active" ? "success" : "neutral"}>
                      {offering.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/academics/subject-offerings/${offering.id}/students`);
                        }}
                        aria-label={`Manage students for ${offering.subject_name}`}
                        title="Manage students"
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <Users className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/academics/subject-offerings/${offering.id}/ca`);
                        }}
                        aria-label={`Manage continuous assessment for ${offering.subject_name}`}
                        title="Continuous assessment"
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <ClipboardCheck className="size-4" aria-hidden="true" />
                      </button>
                      {isTeacher && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/academics/subject-offerings/${offering.id}/communications`);
                          }}
                          aria-label={`Messages for ${offering.subject_name}`}
                          title="Messages"
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                        >
                          <MessageSquare className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      {canViewResults && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/academics/subject-offerings/${offering.id}/results`);
                          }}
                          aria-label={`Manage exam results for ${offering.subject_name}`}
                          title="Exam & final results"
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                        >
                          <GraduationCap className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(offering.id, `${offering.subject_name} — ${offering.school_class_name}`);
                          }}
                          aria-label={`Delete ${offering.subject_name} offering`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRowLink>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </ScrollReveal>
      ) : null}

      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
