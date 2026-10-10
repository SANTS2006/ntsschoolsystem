import { ListChecks, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { FullPageSpinner } from "@/components/ui/Spinner";
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

import { useDeleteFeeStructureItem, useFeeStructure, useFeeStructureItemList } from "./useFeesCrud";

export function FeeStructureItemsListPage() {
  const { structureId } = useParams<{ structureId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("fees.create");
  const canDelete = useHasPermission("fees.delete");

  const { data: structure, isLoading: isLoadingStructure } = useFeeStructure(structureId);
  const filterParams = {
    fee_structure: structureId as string,
  };
  const { data, isLoading, isError, error } = useFeeStructureItemList({
    ...filterParams,
    page_size: 100,
  });
  const { data: stats } = useSummaryStats("finance/fee-structure-items", filterParams);
  const deleteItem = useDeleteFeeStructureItem();

  const handleDelete = async (id: string, category: string) => {
    const ok = await confirm({
      title: `Remove the "${category}" line item?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteItem.mutate(id, {
      onSuccess: () => showToast({ title: "Line item removed" }),
      onError: (err) => showToast({ title: "Failed to remove", description: err.message, tone: "danger" }),
    });
  };

  const total = data?.results.reduce((sum, item) => sum + Number(item.amount), 0) ?? 0;

  if (isLoadingStructure) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/finance/structures")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to fee structures
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Line items for {structure?.name ?? "this structure"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            path="/finance/fee-structure-items/"
            params={filterParams}
            filename="fee_structure_items.csv"
          />
          {canCreate && (
            <Button onClick={() => navigate(`/finance/structures/${structureId}/items/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New line item
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total line items", value: stats.total as number, icon: ListChecks }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No line items yet"
          description="Add a fee category and amount so invoices generated from this structure have charges."
        />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Category</TableHeaderCell>
                  <TableHeaderCell>Amount</TableHeaderCell>
                  {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((item) => (
                  <TableRowLink
                    key={item.id}
                    onClick={() => navigate(`/finance/structures/${structureId}/items/${item.id}/edit`)}
                  >
                    <TableCell className="font-medium">{item.fee_category_name}</TableCell>
                    <TableCell>{item.amount}</TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id, item.fee_category_name);
                          }}
                          aria-label={`Remove ${item.fee_category_name}`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </TableCell>
                    )}
                  </TableRowLink>
                ))}
              </TableBody>
              <tfoot>
                <tr className="border-t border-[var(--color-border)] font-medium">
                  <TableCell>Total</TableCell>
                  <TableCell colSpan={canDelete ? 2 : 1}>{total.toFixed(2)}</TableCell>
                </tr>
              </tfoot>
            </Table>
          </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
