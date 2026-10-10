import { CheckCircle2, LogOut, Plus, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
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
  TableRow,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { allocationStatusTone, statusLabel } from "./statusTone";
import type { AllocationStatus } from "./types";
import { useAllocationList, useCheckOutAllocation } from "./useHostelCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: AllocationStatus[] = ["active", "checked_out"];

export function AllocationsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("hostel.create");
  const canUpdate = useHasPermission("hostel.update");

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AllocationStatus | "">("");

  const filterParams = { status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useAllocationList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("hostel/allocations", filterParams);
  const checkOut = useCheckOutAllocation();

  const handleCheckOut = async (id: string, student: string) => {
    const ok = await confirm({
      title: `Check out ${student} from the hostel?`,
      tone: "neutral",
    });
    if (!ok) return;
    checkOut.mutate(id, {
      onSuccess: () => showToast({ title: "Student checked out" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not check out", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total allocations", value: stats.total as number, icon: Users },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
              { key: "checked_out", label: "Checked out", value: stats.checked_out as number, icon: LogOut },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-[180px]">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AllocationStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/hostel/allocations/" params={filterParams} filename="hostel_allocations.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/hostel/allocations/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New allocation
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Users} title="No allocations found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Bed</TableHeaderCell>
                <TableHeaderCell>Check-in</TableHeaderCell>
                <TableHeaderCell>Check-out</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canUpdate && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((allocation) => (
                <TableRow key={allocation.id}>
                  <TableCell className="font-medium">{allocation.student_name}</TableCell>
                  <TableCell>{allocation.bed_label}</TableCell>
                  <TableCell>{allocation.check_in_date}</TableCell>
                  <TableCell>
                    {allocation.check_out_date ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={allocationStatusTone(allocation.status)}>{statusLabel(allocation.status)}</Badge>
                  </TableCell>
                  {canUpdate && (
                    <TableCell className="text-right">
                      {allocation.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleCheckOut(allocation.id, allocation.student_name)}
                          aria-label={`Check out ${allocation.student_name}`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <LogOut className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
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
