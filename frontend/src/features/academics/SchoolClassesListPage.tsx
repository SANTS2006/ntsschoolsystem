import { Award, LayoutGrid, Plus, Search, Trash2 } from "lucide-react";
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

import { useDeleteSchoolClass, useSchoolClassList } from "./useAcademicsCrud";

const PAGE_SIZE = 25;

export function SchoolClassesListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("academics.create");
  const canDelete = useHasPermission("academics.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useSchoolClassList({
    page,
    page_size: PAGE_SIZE,
    ordering: "order",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("academics/classes", filterParams);
  const deleteSchoolClass = useDeleteSchoolClass();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete class "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteSchoolClass.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total classes", value: stats.total as number, icon: LayoutGrid }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/academics/classes/" params={filterParams} filename="school_classes.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/academics/classes/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New class
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="No classes found" description="Try adjusting your search, or create one." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Order</TableHeaderCell>
                <TableHeaderCell>Next class</TableHeaderCell>
                <TableHeaderCell>Progression</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((schoolClass) => (
                <TableRowLink
                  key={schoolClass.id}
                  onClick={() => navigate(`/academics/classes/${schoolClass.id}/edit`)}
                >
                  <TableCell className="font-medium">{schoolClass.name}</TableCell>
                  <TableCell>{schoolClass.order}</TableCell>
                  <TableCell>
                    {schoolClass.next_class_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      {schoolClass.is_public_exam_transition && <Badge tone="warning">Public exam</Badge>}
                      {schoolClass.is_graduation_level && <Badge tone="success">Graduation</Badge>}
                      {!schoolClass.is_public_exam_transition && !schoolClass.is_graduation_level && (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/academics/classes/${schoolClass.id}/results`);
                        }}
                        aria-label={`Results and promotion for ${schoolClass.name}`}
                        title="Results & promotion"
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <Award className="size-4" aria-hidden="true" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(schoolClass.id, schoolClass.name);
                          }}
                          aria-label={`Delete ${schoolClass.name}`}
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
