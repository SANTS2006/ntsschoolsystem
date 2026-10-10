import { BedSingle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
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
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useBedList, useDeleteBed, useRoom } from "./useHostelCrud";

export function BedsListPage() {
  const { hostelId, roomId } = useParams<{ hostelId: string; roomId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("hostel.create");
  const canDelete = useHasPermission("hostel.delete");

  const { data: room, isLoading: isLoadingRoom } = useRoom(roomId);
  const filterParams = { room: roomId };
  const { data, isLoading, isError, error } = useBedList({ ...filterParams, page_size: 100 }, { enabled: !!roomId });
  const { data: stats } = useSummaryStats("hostel/beds", filterParams);
  const deleteBed = useDeleteBed();

  const handleDelete = async (id: string, bedNumber: string) => {
    const ok = await confirm({
      title: `Delete bed "${bedNumber}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteBed.mutate(id, {
      onSuccess: () => showToast({ title: `Bed "${bedNumber}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingRoom) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate(`/hostel/hostels/${hostelId}/rooms`)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to rooms
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Beds in room {room?.room_number ?? ""}</h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/hostel/beds/" params={filterParams} filename="hostel_beds.csv" />
          {canCreate && (
            <Button onClick={() => navigate(`/hostel/hostels/${hostelId}/rooms/${roomId}/beds/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New bed
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total beds", value: stats.total as number, icon: BedSingle },
              { key: "occupied", label: "Occupied", value: stats.occupied as number, icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={BedSingle} title="No beds yet" description="Add a bed so a student can be allocated to this room." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Bed #</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((bed) => (
                <TableRowLink
                  key={bed.id}
                  onClick={() => navigate(`/hostel/hostels/${hostelId}/rooms/${roomId}/beds/${bed.id}/edit`)}
                >
                  <TableCell className="font-medium">{bed.bed_number}</TableCell>
                  <TableCell>
                    <Badge tone={bed.is_occupied ? "primary" : "success"}>
                      {bed.is_occupied ? "Occupied" : "Available"}
                    </Badge>
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(bed.id, bed.bed_number);
                        }}
                        aria-label={`Delete bed ${bed.bed_number}`}
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
        </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
