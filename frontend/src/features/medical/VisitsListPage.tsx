import { AlertTriangle, Plus, Siren, Stethoscope, Trash2 } from "lucide-react";
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

import { statusLabel, visitTypeTone } from "./statusTone";
import type { VisitType } from "./types";
import { useDeleteVisit, useVisitList } from "./useMedicalCrud";

const PAGE_SIZE = 25;
const VISIT_TYPES: VisitType[] = ["routine", "incident", "emergency"];

export function VisitsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("medical.create");
  const canDelete = useHasPermission("medical.delete");

  const [page, setPage] = useState(1);
  const [visitType, setVisitType] = useState<VisitType | "">("");

  const filterParams = { visit_type: visitType || undefined };
  const { data, isLoading, isError, error, isFetching } = useVisitList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("medical/visits", filterParams);
  const deleteVisit = useDeleteVisit();

  const handleDelete = async (id: string, student: string) => {
    const ok = await confirm({
      title: `Delete this visit record for ${student}?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteVisit.mutate(id, {
      onSuccess: () => showToast({ title: "Visit deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total visits", value: stats.total as number, icon: Stethoscope },
              { key: "incident", label: "Incidents", value: stats.incident as number, tone: "warning", icon: AlertTriangle },
              { key: "emergency", label: "Emergencies", value: stats.emergency as number, tone: "danger", icon: Siren },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-[180px]">
          <Select
            value={visitType}
            onChange={(e) => {
              setVisitType(e.target.value as VisitType | "");
              setPage(1);
            }}
          >
            <option value="">All visit types</option>
            {VISIT_TYPES.map((type) => (
              <option key={type} value={type}>
                {statusLabel(type)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/medical/visits/" params={filterParams} filename="medical_visits.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/medical/visits/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New visit
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Stethoscope} title="No visits found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Visited at</TableHeaderCell>
                <TableHeaderCell>Attended by</TableHeaderCell>
                <TableHeaderCell>Parent notified</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((visit) => (
                <TableRowLink key={visit.id} onClick={() => navigate(`/medical/visits/${visit.id}/edit`)}>
                  <TableCell className="font-medium">{visit.student_name}</TableCell>
                  <TableCell>
                    <Badge tone={visitTypeTone(visit.visit_type)}>{statusLabel(visit.visit_type)}</Badge>
                  </TableCell>
                  <TableCell>{new Date(visit.visited_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {visit.attended_by_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={visit.parent_notified ? "success" : "neutral"}>
                      {visit.parent_notified ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(visit.id, visit.student_name);
                        }}
                        aria-label={`Delete visit for ${visit.student_name}`}
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
