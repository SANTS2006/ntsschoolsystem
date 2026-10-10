import { AlertTriangle, CheckCircle2, Plus, ShieldAlert, Trash2 } from "lucide-react";
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
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { incidentStatusTone, severityTone, statusLabel } from "./statusTone";
import type { DisciplineSeverity, DisciplineStatus } from "./types";
import { useDeleteIncident, useIncidentList } from "./useDisciplineCrud";

const PAGE_SIZE = 25;
const SEVERITIES: DisciplineSeverity[] = ["minor", "moderate", "severe"];
const STATUSES: DisciplineStatus[] = ["reported", "under_review", "resolved"];

export function IncidentsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("discipline.create");
  const canDelete = useHasPermission("discipline.delete");

  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState<DisciplineSeverity | "">("");
  const [status, setStatus] = useState<DisciplineStatus | "">("");

  const filterParams = { severity: severity || undefined, status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useIncidentList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("discipline/incidents", filterParams);
  const deleteIncident = useDeleteIncident();

  const handleDelete = async (id: string, student: string) => {
    const ok = await confirm({
      title: `Delete this discipline record for ${student}?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteIncident.mutate(id, {
      onSuccess: () => showToast({ title: "Discipline record deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Discipline</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Student discipline incidents and follow-up.</p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total incidents", value: stats.total as number, icon: ShieldAlert },
              { key: "reported", label: "Reported", value: stats.reported as number, tone: "warning", icon: AlertTriangle },
              { key: "resolved", label: "Resolved", value: stats.resolved as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-[180px]">
            <Select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value as DisciplineSeverity | "");
                setPage(1);
              }}
            >
              <option value="">All severities</option>
              {SEVERITIES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as DisciplineStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/discipline/incidents/" params={filterParams} filename="discipline_incidents.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/discipline/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New incident
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No discipline records found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Severity</TableHeaderCell>
                <TableHeaderCell>Incident date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((incident) => (
                <TableRowLink key={incident.id} onClick={() => navigate(`/discipline/${incident.id}/edit`)}>
                  <TableCell className="font-medium">{incident.student_name}</TableCell>
                  <TableCell>{incident.category_label}</TableCell>
                  <TableCell>
                    <Badge tone={severityTone(incident.severity)}>{statusLabel(incident.severity)}</Badge>
                  </TableCell>
                  <TableCell>{new Date(incident.incident_date).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge tone={incidentStatusTone(incident.status)}>{statusLabel(incident.status)}</Badge>
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(incident.id, incident.student_name);
                        }}
                        aria-label={`Delete discipline record for ${incident.student_name}`}
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
