import { MinusCircle, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import type { ApiError } from "@/lib/api-client";
import { money, monthLabel } from "@/lib/money";

import { useAdjustmentList, useDeleteAdjustment } from "./adjustments";

export function AdjustmentsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("salary.create");
  const canDelete = useHasPermission("salary.delete");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const debounced = useDebounce(search);
  const { data, isLoading, isError, error } = useAdjustmentList({ page_size: 100, search: debounced || undefined, kind: kind || undefined });
  const remove = useDeleteAdjustment();

  const handleDelete = async (id: string, staff: string) => {
    const ok = await confirm({
      title: `Cancel this change for ${staff}?`,
      description: "It is removed from their pay and they are told. It cannot be undone once the month has been paid.",
      tone: "danger",
    });
    if (!ok) return;
    remove.mutate(id, {
      onSuccess: () => showToast({ title: "Change cancelled" }),
      onError: (err) => showToast({ title: "Could not cancel", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
          <div className="w-full sm:w-64">
            <Input icon={Search} placeholder="Search staff or reason" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-full sm:w-44">
            <Select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All types</option>
              <option value="deduction">Deductions</option>
              <option value="addition">Additions</option>
            </Select>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/salary/adjustments/new")}>
            <Plus className="size-4" aria-hidden="true" />
            Deduct from a salary
          </Button>
        )}
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={MinusCircle} title="No deductions or additions" description="One-off changes to a staff member's pay for a month appear here." />
      ) : data ? (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Staff</TableHeaderCell>
                <TableHeaderCell>Month</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                <TableHeaderCell>Reason</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((a) => (
                <tr key={a.id}>
                  <TableCell className="font-medium">{a.staff_name}</TableCell>
                  <TableCell>{monthLabel(a.period_year, a.period_month)}</TableCell>
                  <TableCell>{a.kind === "deduction" ? "Deduction" : "Addition"}</TableCell>
                  <TableCell className="text-right">{money(a.amount)}</TableCell>
                  <TableCell className="max-w-xs truncate">{a.reason}</TableCell>
                  <TableCell>
                    <Badge tone={a.applied ? "success" : "warning"}>{a.applied ? "Applied" : "Waiting"}</Badge>
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id, a.staff_name)}
                        aria-label={`Cancel change for ${a.staff_name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </TableCell>
                  )}
                </tr>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}
    </div>
  );
}
