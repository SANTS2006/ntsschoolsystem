import { ListChecks, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
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
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { statusLabel } from "./statusTone";
import { useDeleteSalaryStructureItem, useSalaryStructure, useSalaryStructureItemList } from "./useSalaryCrud";

function lineTypeTone(lineType: string): "success" | "warning" | "neutral" {
  if (lineType === "deduction") return "warning";
  if (lineType === "basic") return "neutral";
  return "success";
}

export function SalaryStructureItemsListPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { structureId } = useParams<{ structureId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("salary.create");
  const canDelete = useHasPermission("salary.delete");

  const { data: structure, isLoading: isLoadingStructure } = useSalaryStructure(structureId);
  const filterParams = { search: debouncedSearch || undefined, salary_structure: structureId as string };
  const { data, isLoading, isError, error } = useSalaryStructureItemList({ ...filterParams, page_size: 100 });
  const { data: stats } = useSummaryStats("salary/salary-structure-items", filterParams);
  const deleteItem = useDeleteSalaryStructureItem();

  const handleDelete = async (id: string, description: string) => {
    const ok = await confirm({
      title: `Remove the "${description}" line item?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteItem.mutate(id, {
      onSuccess: () => showToast({ title: "Line item removed" }),
      onError: (err) => showToast({ title: "Failed to remove", description: err.message, tone: "danger" }),
    });
  };

  const gross = data?.results.reduce((sum, item) => sum + (item.line_type === "deduction" ? 0 : Number(item.amount)), 0) ?? 0;
  const deductions = data?.results.reduce((sum, item) => sum + (item.line_type === "deduction" ? Number(item.amount) : 0), 0) ?? 0;

  if (isLoadingStructure) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/salary/structures")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to salary structures
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input icon={Search} placeholder="Search by description" aria-label="Search by description" value={search} onChange={(e) => { setSearch(e.target.value); }} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Line items for {structure?.name ?? "this structure"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            path="/salary/salary-structure-items/"
            params={filterParams}
            filename="salary_structure_items.csv"
          />
          {canCreate && (
            <Button onClick={() => navigate(`/salary/structures/${structureId}/items/new`)}>
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
          description="Add basic pay, allowances, and deductions so staff assigned this structure get a computed net salary."
        />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell>Amount</TableHeaderCell>
                  {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((item) => (
                  <TableRowLink
                    key={item.id}
                    onClick={() => navigate(`/salary/structures/${structureId}/items/${item.id}/edit`)}
                  >
                    <TableCell>
                      <Badge tone={lineTypeTone(item.line_type)}>{statusLabel(item.line_type)}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell>{item.amount}</TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id, item.description);
                          }}
                          aria-label={`Remove ${item.description}`}
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
                  <TableCell colSpan={2}>Net (gross − deductions)</TableCell>
                  <TableCell colSpan={canDelete ? 2 : 1}>{(gross - deductions).toFixed(2)}</TableCell>
                </tr>
              </tfoot>
            </Table>
          </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
