import { BookOpen, Plus, Search, Trash2 } from "lucide-react";
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

import { useDeleteSubject, useDepartmentList, useSubjectList } from "./useAcademicsCrud";

const PAGE_SIZE = 25;

export function SubjectsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("academics.create");
  const canDelete = useHasPermission("academics.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const debouncedSearch = useDebounce(search);
  // A generous page_size keeps this a single request for the filter dropdown, same
  // reasoning as the read-only academics lookups used elsewhere.
  const { data: departments } = useDepartmentList({ page_size: 100 });

  const filterParams = {
    search: debouncedSearch || undefined,
    departments: department || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useSubjectList({
    page,
    page_size: PAGE_SIZE,
    ordering: "name",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("academics/subjects", filterParams);
  const deleteSubject = useDeleteSubject();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete subject "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteSubject.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total subjects", value: stats.total as number, icon: BookOpen }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by name or code"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[200px]">
            <Select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All departments</option>
              {departments?.results.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/academics/subjects/" params={filterParams} filename="subjects.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/academics/subjects/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New subject
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={BookOpen} title="No subjects found" description="Try adjusting your filters, or create one." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Department</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((subject) => (
                <TableRowLink key={subject.id} onClick={() => navigate(`/academics/subjects/${subject.id}/edit`)}>
                  <TableCell className="font-medium">{subject.name}</TableCell>
                  <TableCell>{subject.code || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    {subject.department_names.length > 0
                      ? subject.department_names.join(", ")
                      : <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(subject.id, subject.name);
                        }}
                        aria-label={`Delete ${subject.name}`}
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
