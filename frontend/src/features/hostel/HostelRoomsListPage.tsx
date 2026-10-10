import { BedDouble, DoorClosed, Plus, Trash2 } from "lucide-react";
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

import { useDeleteRoom, useHostel, useRoomList } from "./useHostelCrud";

export function HostelRoomsListPage() {
  const { hostelId } = useParams<{ hostelId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("hostel.create");
  const canDelete = useHasPermission("hostel.delete");

  const { data: hostel, isLoading: isLoadingHostel } = useHostel(hostelId);
  const filterParams = { hostel: hostelId };
  const { data, isLoading, isError, error } = useRoomList(
    { ...filterParams, page_size: 100 },
    { enabled: !!hostelId },
  );
  const { data: stats } = useSummaryStats("hostel/rooms", filterParams);
  const deleteRoom = useDeleteRoom();

  const handleDelete = async (id: string, roomNumber: string) => {
    const ok = await confirm({
      title: `Delete room "${roomNumber}"?`,
      description: "This also removes its beds.",
      tone: "danger",
    });
    if (!ok) return;
    deleteRoom.mutate(id, {
      onSuccess: () => showToast({ title: `Room "${roomNumber}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingHostel) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/hostel/hostels")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to hostels
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Rooms in {hostel?.name ?? "this hostel"}</h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/hostel/rooms/" params={filterParams} filename="hostel_rooms.csv" />
          {canCreate && (
            <Button onClick={() => navigate(`/hostel/hostels/${hostelId}/rooms/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New room
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total rooms", value: stats.total as number, icon: DoorClosed }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={DoorClosed} title="No rooms yet" description="Add a room so beds can be assigned." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Room #</TableHeaderCell>
                <TableHeaderCell>Capacity</TableHeaderCell>
                <TableHeaderCell>Beds</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((room) => (
                <TableRowLink
                  key={room.id}
                  onClick={() => navigate(`/hostel/hostels/${hostelId}/rooms/${room.id}/edit`)}
                >
                  <TableCell className="font-medium">{room.room_number}</TableCell>
                  <TableCell>{room.capacity}</TableCell>
                  <TableCell>
                    <Badge tone={room.bed_count > 0 ? "success" : "neutral"}>{room.bed_count}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/hostel/hostels/${hostelId}/rooms/${room.id}/beds`);
                        }}
                        aria-label={`Manage beds for room ${room.room_number}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <BedDouble className="size-4" aria-hidden="true" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(room.id, room.room_number);
                          }}
                          aria-label={`Delete room ${room.room_number}`}
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
        </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
