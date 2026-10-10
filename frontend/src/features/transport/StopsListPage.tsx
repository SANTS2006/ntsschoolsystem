import { MapPin, Plus, Trash2 } from "lucide-react";
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

import { useDeleteStop, useRoute, useStopList } from "./useTransportCrud";

export function StopsListPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("transport.create");
  const canDelete = useHasPermission("transport.delete");

  const { data: route, isLoading: isLoadingRoute } = useRoute(routeId);
  const filterParams = { route: routeId };
  const { data, isLoading, isError, error } = useStopList(
    { ...filterParams, page_size: 100 },
    { enabled: !!routeId },
  );
  const { data: stats } = useSummaryStats("transport/stops", filterParams);
  const deleteStop = useDeleteStop();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete stop "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteStop.mutate(id, {
      onSuccess: () => showToast({ title: `Stop "${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingRoute) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/transport/routes")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to routes
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Stops on {route?.name ?? "this route"}</h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/transport/stops/" params={filterParams} filename="transport_stops.csv" />
          {canCreate && (
            <Button onClick={() => navigate(`/transport/routes/${routeId}/stops/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New stop
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total stops", value: stats.total as number, icon: MapPin }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={MapPin} title="No stops yet" description="Add a stop so students can be assigned to this route." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Order</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Pickup time</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((stop) => (
                <TableRowLink key={stop.id} onClick={() => navigate(`/transport/routes/${routeId}/stops/${stop.id}/edit`)}>
                  <TableCell className="font-medium">{stop.order}</TableCell>
                  <TableCell>{stop.name}</TableCell>
                  <TableCell>
                    {stop.pickup_time ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(stop.id, stop.name);
                        }}
                        aria-label={`Delete stop ${stop.name}`}
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
