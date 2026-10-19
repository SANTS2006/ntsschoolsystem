import { ClipboardList, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
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

import { useDeleteExamSchedule, useExam, useExamScheduleList } from "./useExaminationsCrud";

const PAGE_SIZE = 25;

export function ExamSchedulesListPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("examinations.create");
  const canDelete = useHasPermission("examinations.delete");

  const [page, setPage] = useState(1);
  const { data: exam, isLoading: isLoadingExam } = useExam(examId);
  const filterParams = { search: debouncedSearch || undefined, exam: examId };
  const { data, isLoading, isError, error, isFetching } = useExamScheduleList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("examinations/schedules", filterParams);
  const deleteSchedule = useDeleteExamSchedule();

  const handleDelete = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Delete the schedule for ${label}?`,
      description: "This also removes any results entered against it.",
      tone: "danger",
    });
    if (!ok) return;
    deleteSchedule.mutate(id, {
      onSuccess: () => showToast({ title: "Schedule deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingExam) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/examinations/exams")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to exams
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input icon={Search} placeholder="Search by exam, subject or class" aria-label="Search by exam, subject or class" value={search} onChange={(e) => { setSearch(e.target.value); }} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Schedules for {exam?.name ?? "this exam"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/examinations/schedules/" params={filterParams} filename="exam_schedules.csv" />
          {canCreate && (
            <Button onClick={() => navigate(`/examinations/exams/${examId}/schedules/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New schedule
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total schedules", value: stats.total as number, icon: ClipboardList }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No schedules yet"
          description="Add a class/subject sitting for this exam to start entering marks."
        />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Max score</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((schedule) => (
                <TableRowLink
                  key={schedule.id}
                  onClick={() => navigate(`/examinations/exams/${examId}/schedules/${schedule.id}/edit`)}
                >
                  <TableCell className="font-medium">{schedule.school_class_name}</TableCell>
                  <TableCell>{schedule.subject_name}</TableCell>
                  <TableCell>{schedule.max_score}</TableCell>
                  <TableCell>{schedule.date ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(schedule.id, `${schedule.school_class_name} - ${schedule.subject_name}`);
                        }}
                        aria-label={`Delete schedule for ${schedule.school_class_name} - ${schedule.subject_name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </TableCell>
                  )}
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
