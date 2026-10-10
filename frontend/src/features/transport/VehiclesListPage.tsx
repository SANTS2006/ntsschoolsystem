import { Car, CheckCircle2, Plus, Search, Trash2, Wrench } from "lucide-react";
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
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { statusLabel, vehicleStatusTone } from "./statusTone";
import type { VehicleStatus } from "./types";
import { useDeleteVehicle, useVehicleList } from "./useTransportCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: VehicleStatus[] = ["active", "maintenance", "retired"];

export function VehiclesListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("transport.create");
  const canDelete = useHasPermission("transport.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VehicleStatus | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined, status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useVehicleList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("transport/vehicles", filterParams);
  const deleteVehicle = useDeleteVehicle();

  const handleDelete = async (id: string, registration: string) => {
    const ok = await confirm({
      title: `Delete vehicle "${registration}"?`,
      description: "This also removes its maintenance history.",
      tone: "danger",
    });
    if (!ok) return;
    deleteVehicle.mutate(id, {
      onSuccess: () => showToast({ title: `Vehicle "${registration}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total vehicles", value: stats.total as number, icon: Car },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
              { key: "in_maintenance", label: "In maintenance", value: stats.in_maintenance as number, tone: "warning", icon: Wrench },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by registration or make/model"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as VehicleStatus | "");
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
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/transport/vehicles/" params={filterParams} filename="vehicles.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/transport/vehicles/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New vehicle
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Search} title="No vehicles found" description="Try adjusting your search or filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Registration</TableHeaderCell>
                <TableHeaderCell>Make / model</TableHeaderCell>
                <TableHeaderCell>Capacity</TableHeaderCell>
                <TableHeaderCell>Driver</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((vehicle) => (
                <TableRowLink key={vehicle.id} onClick={() => navigate(`/transport/vehicles/${vehicle.id}/edit`)}>
                  <TableCell className="font-medium">{vehicle.registration_number}</TableCell>
                  <TableCell>{vehicle.make_model || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>{vehicle.capacity}</TableCell>
                  <TableCell>
                    {vehicle.driver_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={vehicleStatusTone(vehicle.status)}>{statusLabel(vehicle.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/transport/vehicles/${vehicle.id}/maintenance`);
                        }}
                        aria-label={`Manage maintenance for ${vehicle.registration_number}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <Wrench className="size-4" aria-hidden="true" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(vehicle.id, vehicle.registration_number);
                          }}
                          aria-label={`Delete ${vehicle.registration_number}`}
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
