import { Plus, Repeat, Search, Tags, Trash2 } from "lucide-react";
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

import { useDeleteFeeCategory, useFeeCategoryList } from "./useFeesCrud";

const PAGE_SIZE = 25;

export function FeeCategoriesListPage() {
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
  const { data, isLoading, isError, error, isFetching } = useFeeCategoryList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("finance/fee-categories", filterParams);
  const deleteCategory = useDeleteFeeCategory();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete fee category "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteCategory.mutate(id, {
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
              { key: "total", label: "Total categories", value: stats.total as number, icon: Tags },
              { key: "recurring", label: "Recurring", value: stats.recurring as number, icon: Repeat },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/finance/fee-categories/" params={filterParams} filename="fee_categories.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/finance/categories/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New category
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Tags} title="No fee categories found" description="Try adjusting your search, or create one." />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Code</TableHeaderCell>
                  <TableHeaderCell>Recurring</TableHeaderCell>
                  {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((category) => (
                  <TableRowLink key={category.id} onClick={() => navigate(`/finance/categories/${category.id}/edit`)}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>{category.code || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                    <TableCell>{category.is_recurring ? <Badge tone="primary">Recurring</Badge> : <Badge>One-off</Badge>}</TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(category.id, category.name);
                          }}
                          aria-label={`Delete ${category.name}`}
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
