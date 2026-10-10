import { BookOpen, ClipboardCheck, GraduationCap } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRowLink,
} from "@/components/ui/Table";
import { useSubjectOfferingList, useTermList } from "@/features/academics/useAcademicsCrud";
import { useAcademicYears, useSchoolClasses, useSubjects } from "@/features/academics/useAcademicsLookups";
import type { ApiError } from "@/lib/api-client";

/** Examinations > Gradebook: for every subject taught to a class in a term, see the students' continuous
 * assessment (CA) grades and enter / review their exam grades and final results. It is only for grades — creating,
 * editing or deleting subject offerings belongs to Academics. */
export function GradebookPage() {
  const navigate = useNavigate();
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [subject, setSubject] = useState("");

  const { data: academicYears } = useAcademicYears();
  const { data: terms } = useTermList({ page_size: 100, academic_year: academicYear || undefined });
  const { data: classes } = useSchoolClasses();
  const { data: subjects } = useSubjects();

  const { data, isLoading, isError, error, isFetching } = useSubjectOfferingList({
    page_size: 100,
    academic_year: academicYear || undefined,
    term: term || undefined,
    school_class: schoolClass || undefined,
    subject: subject || undefined,
  });

  const open = (id: string, tab: "ca" | "results") => navigate(`/examinations/gradebook/${id}/${tab}`);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Gradebook"
        description="See students' CA grades and enter their exam grades, subject by subject."
      />

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

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={BookOpen} title="No subjects found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Subject</TableHeaderCell>
                  <TableHeaderCell>Class</TableHeaderCell>
                  <TableHeaderCell>Term</TableHeaderCell>
                  <TableHeaderCell>Teacher</TableHeaderCell>
                  <TableHeaderCell>CA / Exam</TableHeaderCell>
                  <TableHeaderCell>CA</TableHeaderCell>
                  <TableHeaderCell className="text-right">Grades</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((offering) => (
                  <TableRowLink key={offering.id} onClick={() => open(offering.id, "results")}>
                    <TableCell className="font-medium">{offering.subject_name}</TableCell>
                    <TableCell>{offering.school_class_name}</TableCell>
                    <TableCell>{offering.term_name}</TableCell>
                    <TableCell>{offering.main_teacher_name}</TableCell>
                    <TableCell>
                      {offering.ca_weight_percent}% / {offering.exam_weight_percent}%
                    </TableCell>
                    <TableCell>
                      <Badge tone={offering.ca_status === "closed" ? "danger" : "success"}>
                        {offering.ca_status === "closed" ? "Closed" : "Open"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(offering.id, "ca");
                          }}
                          aria-label={`CA grades for ${offering.subject_name}`}
                          title="CA grades"
                          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                        >
                          <ClipboardCheck className="size-4" aria-hidden="true" />
                          CA
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(offering.id, "results");
                          }}
                          aria-label={`Exam grades for ${offering.subject_name}`}
                          title="Exam grades & final results"
                          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                        >
                          <GraduationCap className="size-4" aria-hidden="true" />
                          Exam
                        </button>
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
