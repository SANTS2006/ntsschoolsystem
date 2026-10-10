import { CalendarRange, ClipboardList, FileText, ListChecks, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
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
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import type { ExamType } from "./types";
import { useDeleteExam, useExamList } from "./useExaminationsCrud";

const PAGE_SIZE = 25;
const EXAM_TYPE_OPTIONS: ExamType[] = ["exam", "test", "quiz", "continuous_assessment", "practical"];

function examTypeLabel(type: ExamType): string {
  return type
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function ExamsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("examinations.create");
  const canDelete = useHasPermission("examinations.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [examType, setExamType] = useState<ExamType | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
    exam_type: examType || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useExamList({
    page,
    page_size: PAGE_SIZE,
    ordering: "-start_date",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("examinations/exams", filterParams);
  const deleteExam = useDeleteExam();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete exam "${name}"?`,
      description: "This also removes its schedules and results.",
      tone: "danger",
    });
    if (!ok) return;
    deleteExam.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total exams", value: stats.total as number, icon: CalendarRange },
              {
                key: "exam",
                label: examTypeLabel("exam"),
                value: (stats.by_exam_type as Record<string, number> | undefined)?.exam ?? 0,
                icon: FileText,
              },
              {
                key: "test",
                label: examTypeLabel("test"),
                value: (stats.by_exam_type as Record<string, number> | undefined)?.test ?? 0,
                icon: ClipboardList,
              },
              {
                key: "continuous_assessment",
                label: examTypeLabel("continuous_assessment"),
                value: (stats.by_exam_type as Record<string, number> | undefined)?.continuous_assessment ?? 0,
                icon: ListChecks,
              },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[200px]">
            <Select
              value={examType}
              onChange={(e) => {
                setExamType(e.target.value as ExamType | "");
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {EXAM_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {examTypeLabel(type)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/examinations/exams/" params={filterParams} filename="exams.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/examinations/exams/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New exam
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No exams found" description="Try adjusting your search or filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Term</TableHeaderCell>
                <TableHeaderCell>Grading scale</TableHeaderCell>
                <TableHeaderCell>Dates</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((exam) => (
                <TableRowLink key={exam.id} onClick={() => navigate(`/examinations/exams/${exam.id}/edit`)}>
                  <TableCell className="font-medium">{exam.name}</TableCell>
                  <TableCell>{examTypeLabel(exam.exam_type)}</TableCell>
                  <TableCell>{exam.term_name}</TableCell>
                  <TableCell>
                    {exam.grading_scale_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    {exam.start_date} – {exam.end_date}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/examinations/exams/${exam.id}/schedules`);
                        }}
                        aria-label={`Manage schedules for ${exam.name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <ClipboardList className="size-4" aria-hidden="true" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(exam.id, exam.name);
                          }}
                          aria-label={`Delete ${exam.name}`}
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
          <div className="border-t border-[var(--color-border)]">
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </div>
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
