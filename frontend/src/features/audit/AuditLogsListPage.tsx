import { History, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
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

import { severityLabel, severityTone } from "./statusTone";
import type { AuditSeverity } from "./types";
import { useAuditLogList } from "./useAuditCrud";

const PAGE_SIZE = 25;
const SEVERITIES: AuditSeverity[] = ["info", "warning", "critical"];

export function AuditLogsListPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<AuditSeverity | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined, severity: severity || undefined };
  const { data, isLoading, isError, error, isFetching } = useAuditLogList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("audit", filterParams);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Audit log</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          A record of who did what, across this school. Entries are append-only.
        </p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total entries", value: stats.total as number, icon: History }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by action, actor, or entity"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[160px]">
            <Select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value as AuditSeverity | "");
                setPage(1);
              }}
            >
              <option value="">All severities</option>
              {SEVERITIES.map((option) => (
                <option key={option} value={option}>
                  {severityLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ExportCsvButton path="/audit/" params={filterParams} filename="audit_logs.csv" />
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={History} title="No audit entries found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
                <TableHeaderCell>Severity</TableHeaderCell>
                <TableHeaderCell>Actor</TableHeaderCell>
                <TableHeaderCell>Entity</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((log) => (
                <TableRowLink key={log.id} onClick={() => navigate(`/audit/${log.id}`)}>
                  <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell>
                    <Badge tone={severityTone(log.severity)}>{severityLabel(log.severity)}</Badge>
                  </TableCell>
                  <TableCell>
                    {log.actor_email || <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    {log.entity_type ? (
                      <span>
                        {log.entity_type}
                        {log.entity_id && (
                          <span className="text-[var(--color-text-muted)]"> #{log.entity_id.slice(0, 8)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
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
