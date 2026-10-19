import { Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
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
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useDeleteGradeBoundary, useGradeBoundaryList, useGradingScale } from "./useExaminationsCrud";

export function GradeBoundariesListPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { scaleId } = useParams<{ scaleId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("examinations.create");
  const canDelete = useHasPermission("examinations.delete");

  const { data: scale, isLoading: isLoadingScale } = useGradingScale(scaleId);
  const { data, isLoading, isError, error } = useGradeBoundaryList({ search: debouncedSearch || undefined,
    grading_scale: scaleId as string,
    page_size: 100,
  });
  const { data: stats } = useSummaryStats("examinations/grade-boundaries", { grading_scale: scaleId });
  const deleteBoundary = useDeleteGradeBoundary();

  const handleDelete = async (id: string, grade: string) => {
    const ok = await confirm({
      title: `Delete grade boundary "${grade}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteBoundary.mutate(id, {
      onSuccess: () => showToast({ title: `"${grade}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingScale) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/examinations/scales")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to grading scales
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input icon={Search} placeholder="Search by grade" aria-label="Search by grade" value={search} onChange={(e) => { setSearch(e.target.value); }} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Grade boundaries for {scale?.name ?? "this scale"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            path="/examinations/grade-boundaries/"
            params={{ grading_scale: scaleId, search: debouncedSearch || undefined }}
            filename="grade_boundaries.csv"
          />
          {canCreate && (
            <Button onClick={() => navigate(`/examinations/scales/${scaleId}/boundaries/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New boundary
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total boundaries", value: stats.total as number, icon: SlidersHorizontal }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No grade boundaries yet"
          description="Add score ranges (e.g. A = 80-100) so results against this scale get a computed letter grade."
        />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Grade</TableHeaderCell>
                <TableHeaderCell>Min score</TableHeaderCell>
                <TableHeaderCell>Max score</TableHeaderCell>
                <TableHeaderCell>Grade points</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((boundary) => (
                <TableRowLink
                  key={boundary.id}
                  onClick={() => navigate(`/examinations/scales/${scaleId}/boundaries/${boundary.id}/edit`)}
                >
                  <TableCell className="font-medium">{boundary.grade}</TableCell>
                  <TableCell>{boundary.min_score}</TableCell>
                  <TableCell>{boundary.max_score}</TableCell>
                  <TableCell>{boundary.gpa_value ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(boundary.id, boundary.grade);
                        }}
                        aria-label={`Delete grade ${boundary.grade}`}
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
