import { FolderClosed, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
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
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useCategoryList, useDeleteCategory } from "./useDocumentsCrud";

const PAGE_SIZE = 25;

export function CategoriesListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("documents.create");
  const canDelete = useHasPermission("documents.delete");

  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, isFetching } = useCategoryList({ page, page_size: PAGE_SIZE });
  const { data: stats } = useSummaryStats("document-categories", {});
  const deleteCategory = useDeleteCategory();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete category "${name}"?`,
      description: "Documents in this category will become uncategorized.",
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Categories</h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/document-categories/" params={{}} filename="document_categories.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/documents/categories/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New category
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total categories", value: stats.total as number, icon: FolderClosed }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={FolderClosed} title="No categories found" description="Create a category to organize documents." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Description</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((category) => (
                <TableRowLink key={category.id} onClick={() => navigate(`/documents/categories/${category.id}/edit`)}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    {category.description || <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
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
