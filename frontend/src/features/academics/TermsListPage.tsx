import { CalendarDays, CheckCircle2, Plus, Search, Trash2 } from "lucide-react";
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
import { useAcademicYears } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useDeleteTerm, useTermList } from "./useAcademicsCrud";

const PAGE_SIZE = 25;

export function TermsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("academics.create");
  const canDelete = useHasPermission("academics.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data: academicYears } = useAcademicYears();

  const filterParams = {
    search: debouncedSearch || undefined,
    academic_year: academicYear || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useTermList({
    page,
    page_size: PAGE_SIZE,
    ordering: "sequence",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("academics/terms", filterParams);
  const deleteTerm = useDeleteTerm();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete term "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteTerm.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total terms", value: stats.total as number, icon: CalendarDays },
              { key: "current", label: "Current", value: stats.current as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
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
          <div className="w-full max-w-[200px]">
            <Select
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All academic years</option>
              {academicYears?.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/academics/terms/" params={filterParams} filename="terms.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/academics/terms/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New term
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No terms found" description="Try adjusting your filters, or create one." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Seq</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Academic year</TableHeaderCell>
                <TableHeaderCell>Start date</TableHeaderCell>
                <TableHeaderCell>End date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((term) => (
                <TableRowLink key={term.id} onClick={() => navigate(`/academics/terms/${term.id}/edit`)}>
                  <TableCell className="text-[var(--color-text-muted)]">{term.sequence}</TableCell>
                  <TableCell className="font-medium">{term.name}</TableCell>
                  <TableCell>{term.academic_year_name}</TableCell>
                  <TableCell>{term.start_date}</TableCell>
                  <TableCell>{term.end_date}</TableCell>
                  <TableCell>
                    {term.is_current ? <Badge tone="primary">Current</Badge> : <Badge>Inactive</Badge>}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(term.id, term.name);
                        }}
                        aria-label={`Delete ${term.name}`}
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
