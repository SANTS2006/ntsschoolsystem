import { Archive, ArchiveRestore, CalendarRange, CheckCircle2, Plus, Search, Trash2 } from "lucide-react";
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

import { useAcademicYearList, useArchiveAcademicYear, useDeleteAcademicYear, useUnarchiveAcademicYear } from "./useAcademicsCrud";

const PAGE_SIZE = 25;

export function AcademicYearsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("academics.create");
  const canUpdate = useHasPermission("academics.update");
  const canDelete = useHasPermission("academics.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useAcademicYearList({
    page,
    page_size: PAGE_SIZE,
    ordering: "-start_date",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("academics/academic-years", filterParams);
  const deleteAcademicYear = useDeleteAcademicYear();
  const archiveAcademicYear = useArchiveAcademicYear();
  const unarchiveAcademicYear = useUnarchiveAcademicYear();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete academic year "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteAcademicYear.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  const handleArchive = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Archive "${name}"?`,
      description: "Its sections, terms, subject offerings, attendance, and timetable become read-only. You can unarchive it later.",
    });
    if (!ok) return;
    archiveAcademicYear.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" archived` }),
      onError: (err) => showToast({ title: "Could not archive", description: err.message, tone: "danger" }),
    });
  };

  const handleUnarchive = (id: string, name: string) => {
    unarchiveAcademicYear.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" unarchived` }),
      onError: (err) => showToast({ title: "Could not unarchive", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total academic years", value: stats.total as number, icon: CalendarRange },
              { key: "current", label: "Current", value: stats.current as number, tone: "success", icon: CheckCircle2 },
              { key: "archived", label: "Archived", value: stats.archived as number, tone: "neutral", icon: Archive },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input
            icon={Search}
            placeholder="Search by name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/academics/academic-years/" params={filterParams} filename="academic_years.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/academics/years/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New academic year
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No academic years found" description="Try adjusting your search, or create one." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Start date</TableHeaderCell>
                <TableHeaderCell>End date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {(canUpdate || canDelete) && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((year) => (
                <TableRowLink key={year.id} onClick={() => navigate(`/academics/years/${year.id}/edit`)}>
                  <TableCell className="font-medium">{year.name}</TableCell>
                  <TableCell>{year.start_date}</TableCell>
                  <TableCell>{year.end_date}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {year.is_current ? <Badge tone="primary">Current</Badge> : <Badge>Inactive</Badge>}
                      {year.is_archived && <Badge tone="warning">Archived</Badge>}
                    </div>
                  </TableCell>
                  {(canUpdate || canDelete) && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate && !year.is_archived && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(year.id, year.name);
                            }}
                            aria-label={`Archive ${year.name}`}
                            title="Archive"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                          >
                            <Archive className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {canUpdate && year.is_archived && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnarchive(year.id, year.name);
                            }}
                            aria-label={`Unarchive ${year.name}`}
                            title="Unarchive"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                          >
                            <ArchiveRestore className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(year.id, year.name);
                            }}
                            aria-label={`Delete ${year.name}`}
                            title="Delete"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
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
