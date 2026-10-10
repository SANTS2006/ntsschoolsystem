import { BookOpen, CheckCircle2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
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
import { useSubjects } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useDeleteLesson, useLessonList } from "./useEducationCrud";

const PAGE_SIZE = 25;

export function LessonsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("education.create");
  const canUpdate = useHasPermission("education.update");
  const canDelete = useHasPermission("education.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const debouncedSearch = useDebounce(search);

  const { data: subjects } = useSubjects();
  const filterParams = { search: debouncedSearch || undefined, subject: subject || undefined };
  const { data, isLoading, isError, error, isFetching } = useLessonList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("education/lessons", filterParams);
  const deleteLesson = useDeleteLesson();

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Delete lesson "${title}"?`,
      description: "This also removes every document and video attached to it.",
      tone: "danger",
    });
    if (!ok) return;
    deleteLesson.mutate(id, {
      onSuccess: () => showToast({ title: `"${title}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Lessons</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Notes, documents, and videos organized by subject and class.
        </p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total lessons", value: stats.total as number, icon: BookOpen },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by title or description"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All subjects</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/education/lessons/" params={filterParams} filename="lessons.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/education/lessons/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New lesson
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={BookOpen} title="No lessons found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Materials</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((lesson) => (
                <TableRowLink key={lesson.id} onClick={() => navigate(`/education/lessons/${lesson.id}`)}>
                  <TableCell className="font-medium">{lesson.title}</TableCell>
                  <TableCell>
                    {lesson.school_class_name}
                    {lesson.section_name && ` — ${lesson.section_name}`}
                  </TableCell>
                  <TableCell>{lesson.subject_name}</TableCell>
                  <TableCell>
                    <Badge tone={lesson.material_count > 0 ? "primary" : "neutral"}>{lesson.material_count}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone={lesson.is_active ? "success" : "neutral"}>
                      {lesson.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/education/lessons/${lesson.id}/edit`);
                          }}
                          aria-label={`Edit ${lesson.title}`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(lesson.id, lesson.title);
                          }}
                          aria-label={`Delete ${lesson.title}`}
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
