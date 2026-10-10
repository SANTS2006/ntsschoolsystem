import { CheckCircle2, ExternalLink, Plus, School as SchoolIcon, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { schoolUrl } from "./schoolUrl";
import { schoolStatusTone, statusLabel } from "./statusTone";
import type { SchoolStatus } from "./types";
import { useSchoolList } from "./useSchoolsCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: SchoolStatus[] = ["pending", "active", "suspended"];

export function SchoolsListPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SchoolStatus | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined, status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useSchoolList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("schools", filterParams);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Schools"
        description="Every school on the platform, with a link to its own pages."
        actions={
          <>
            <ExportCsvButton path="/schools/" params={filterParams} filename="schools.csv" />
            <Button onClick={() => navigate("/platform/schools/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Add school
            </Button>
          </>
        }
      />

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total schools", value: stats.total as number, icon: SchoolIcon },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-full flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by name, slug, or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[160px]">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as SchoolStatus | "");
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
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={SchoolIcon} title="No schools found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Slug</TableHeaderCell>
                <TableHeaderCell>School page</TableHeaderCell>
                <TableHeaderCell>Country</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((school) => (
                <TableRowLink key={school.id} onClick={() => navigate(`/platform/schools/${school.id}`)}>
                  <TableCell className="font-medium">{school.name}</TableCell>
                  <TableCell>{school.slug}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <a
                      href={schoolUrl(school.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {schoolUrl(school.slug).replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  </TableCell>
                  <TableCell>{school.country || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    <Badge tone={schoolStatusTone(school.status)}>{statusLabel(school.status)}</Badge>
                  </TableCell>
                  <TableCell>{new Date(school.created_at).toLocaleDateString()}</TableCell>
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
