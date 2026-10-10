import { FileStack, ListChecks, Plus, Search, Trash2 } from "lucide-react";
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

import { useDeleteFeeStructure, useFeeStructureList } from "./useFeesCrud";

const PAGE_SIZE = 25;

export function FeeStructuresListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("fees.create");
  const canDelete = useHasPermission("fees.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useFeeStructureList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("finance/fee-structures", filterParams);
  const deleteStructure = useDeleteFeeStructure();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete fee structure "${name}"?`,
      description: "This also removes its line items.",
      tone: "danger",
    });
    if (!ok) return;
    deleteStructure.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total fee structures", value: stats.total as number, icon: FileStack }]} />
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
          <ExportCsvButton path="/finance/fee-structures/" params={filterParams} filename="fee_structures.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/finance/structures/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New fee structure
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={FileStack} title="No fee structures found" description="Try adjusting your search, or create one." />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Academic year</TableHeaderCell>
                  <TableHeaderCell>Term</TableHeaderCell>
                  <TableHeaderCell>Class</TableHeaderCell>
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((structure) => (
                  <TableRowLink
                    key={structure.id}
                    onClick={() => navigate(`/finance/structures/${structure.id}/edit`)}
                  >
                    <TableCell className="font-medium">{structure.name}</TableCell>
                    <TableCell>{structure.academic_year_name}</TableCell>
                    <TableCell>{structure.term_name ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                    <TableCell>
                      {structure.school_class_name ?? <span className="text-[var(--color-text-muted)]">All classes</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/finance/structures/${structure.id}/items`);
                          }}
                          aria-label={`Manage line items for ${structure.name}`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                        >
                          <ListChecks className="size-4" aria-hidden="true" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(structure.id, structure.name);
                            }}
                            aria-label={`Delete ${structure.name}`}
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
