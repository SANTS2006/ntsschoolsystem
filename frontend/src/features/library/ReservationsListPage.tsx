import { BookmarkCheck, Check, CheckCircle2, Clock, Plus, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
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

import { reservationStatusTone, statusLabel } from "./statusTone";
import type { ReservationStatus } from "./types";
import {
  useApproveReservation,
  useCancelReservation,
  useFulfillReservation,
  useRejectReservation,
  useReservationList,
} from "./useLibraryCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: ReservationStatus[] = ["pending", "approved", "rejected", "fulfilled", "cancelled"];

export function ReservationsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("library.create");
  const canUpdate = useHasPermission("library.update");

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ReservationStatus | "">("");

  const filterParams = { status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useReservationList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("library/reservations", filterParams);
  const cancelReservation = useCancelReservation();
  const fulfillReservation = useFulfillReservation();
  const approveReservation = useApproveReservation();
  const rejectReservation = useRejectReservation();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const handleApprove = (id: string) =>
    approveReservation.mutate(
      { id },
      {
        onSuccess: () => showToast({ title: "Reservation approved", description: "The requester has been notified." }),
        onError: (err: ApiError) => showToast({ title: "Could not approve", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  const handleReject = () => {
    if (!rejecting) return;
    rejectReservation.mutate(
      { id: rejecting, note: reason },
      {
        onSuccess: () => {
          showToast({ title: "Reservation rejected", description: "The requester has been notified." });
          setRejecting(null);
          setReason("");
        },
        onError: (err: ApiError) => showToast({ title: "Could not reject", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  const handleCancel = async (id: string) => {
    const ok = await confirm({
      title: "Cancel this reservation?",
      tone: "danger",
    });
    if (!ok) return;
    cancelReservation.mutate(id, {
      onSuccess: () => showToast({ title: "Reservation cancelled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not cancel reservation", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleFulfill = (id: string) => {
    fulfillReservation.mutate(id, {
      onSuccess: () => showToast({ title: "Reservation fulfilled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not fulfill reservation", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total reservations", value: stats.total as number, icon: BookmarkCheck },
              { key: "pending", label: "Pending", value: stats.pending as number, tone: "warning", icon: Clock },
              { key: "fulfilled", label: "Fulfilled", value: stats.fulfilled as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-[180px]">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ReservationStatus | "");
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
          <ExportCsvButton path="/library/reservations/" params={filterParams} filename="library_reservations.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/library/reservations/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New reservation
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={BookmarkCheck} title="No reservations found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Book</TableHeaderCell>
                <TableHeaderCell>Requested by</TableHeaderCell>
                <TableHeaderCell>Reserved at</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canUpdate && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((reservation) => (
                <TableRow key={reservation.id}>
                  <TableCell className="font-medium">{reservation.book_title}</TableCell>
                  <TableCell>{reservation.requester_name ?? "—"}</TableCell>
                  <TableCell>{new Date(reservation.reserved_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge tone={reservationStatusTone(reservation.status)}>{statusLabel(reservation.status)}</Badge>
                  </TableCell>
                  {canUpdate && (
                    <TableCell className="text-right">
                      {reservation.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => handleApprove(reservation.id)} isLoading={approveReservation.isPending}>
                            <Check className="size-4" aria-hidden="true" /> Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setRejecting(reservation.id)}>
                            <X className="size-4" aria-hidden="true" /> Reject
                          </Button>
                        </div>
                      )}
                      {reservation.status === "approved" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => handleFulfill(reservation.id)}>
                            Picked up
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleCancel(reservation.id)}
                            aria-label="Cancel reservation"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        </div>
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
      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Reject this reservation">
        <div className="flex flex-col gap-4">
          <Input label="Reason (sent to the requester)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button onClick={handleReject} isLoading={rejectReservation.isPending}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
