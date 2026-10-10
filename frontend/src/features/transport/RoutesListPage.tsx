import { MapPin, Plus, Route as RouteIcon, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
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

import { useDeleteRoute, useRouteList } from "./useTransportCrud";

const PAGE_SIZE = 25;

export function RoutesListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("transport.create");
  const canDelete = useHasPermission("transport.delete");

  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, isFetching } = useRouteList({ page, page_size: PAGE_SIZE });
  const { data: stats } = useSummaryStats("transport/routes");
  const deleteRoute = useDeleteRoute();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete route "${name}"?`,
      description: "This also removes its stops and student assignments.",
      tone: "danger",
    });
    if (!ok) return;
    deleteRoute.mutate(id, {
      onSuccess: () => showToast({ title: `Route "${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Routes</h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/transport/routes/" params={{}} filename="transport_routes.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/transport/routes/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New route
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total routes", value: stats.total as number, icon: RouteIcon }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={RouteIcon} title="No routes found" description="Create a route to start adding stops." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Vehicle</TableHeaderCell>
                <TableHeaderCell>Stops</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((route) => (
                <TableRowLink key={route.id} onClick={() => navigate(`/transport/routes/${route.id}/edit`)}>
                  <TableCell className="font-medium">{route.name}</TableCell>
                  <TableCell>
                    {route.vehicle_registration ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={route.stops.length > 0 ? "success" : "neutral"}>{route.stops.length}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/transport/routes/${route.id}/stops`);
                        }}
                        aria-label={`Manage stops for ${route.name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <MapPin className="size-4" aria-hidden="true" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(route.id, route.name);
                          }}
                          aria-label={`Delete ${route.name}`}
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
