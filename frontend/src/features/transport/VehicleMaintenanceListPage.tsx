import { Plus, Trash2, Wrench } from "lucide-react";
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

import { useDeleteMaintenanceRecord, useMaintenanceList, useVehicle } from "./useTransportCrud";

export function VehicleMaintenanceListPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("transport.create");
  const canDelete = useHasPermission("transport.delete");

  const { data: vehicle, isLoading: isLoadingVehicle } = useVehicle(vehicleId);
  const filterParams = { vehicle: vehicleId };
  const { data, isLoading, isError, error } = useMaintenanceList(
    { ...filterParams, page_size: 100 },
    { enabled: !!vehicleId },
  );
  const { data: stats } = useSummaryStats("transport/maintenance", filterParams);
  const deleteRecord = useDeleteMaintenanceRecord();

  const handleDelete = async (id: string, description: string) => {
    const ok = await confirm({
      title: `Delete maintenance record "${description}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteRecord.mutate(id, {
      onSuccess: () => showToast({ title: "Maintenance record deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingVehicle) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/transport/vehicles")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to vehicles
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Maintenance for {vehicle?.registration_number ?? "this vehicle"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/transport/maintenance/" params={filterParams} filename="vehicle_maintenance.csv" />
          {canCreate && (
            <Button onClick={() => navigate(`/transport/vehicles/${vehicleId}/maintenance/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New record
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total records", value: stats.total as number, icon: Wrench }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Wrench} title="No maintenance records yet" description="Log a service to track this vehicle's history." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Description</TableHeaderCell>
                <TableHeaderCell>Cost</TableHeaderCell>
                <TableHeaderCell>Next service</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((record) => (
                <TableRowLink
                  key={record.id}
                  onClick={() => navigate(`/transport/vehicles/${vehicleId}/maintenance/${record.id}/edit`)}
                >
                  <TableCell className="font-medium">{record.date}</TableCell>
                  <TableCell>{record.description}</TableCell>
                  <TableCell>{record.cost}</TableCell>
                  <TableCell>
                    {record.next_service_date ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(record.id, record.description);
                        }}
                        aria-label={`Delete maintenance record from ${record.date}`}
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
