import { CalendarClock, Play, Plus, Radio, Square, Trash2 } from "lucide-react";
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

import type { LiveSessionStatus } from "./types";
import { statusTone } from "./statusTone";
import { useDeleteLiveSession, useEndLiveSession, useLiveSessionList, useStartLiveSession } from "./useLiveSessionsCrud";

const PAGE_SIZE = 25;

export function LiveSessionsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("live_sessions.create");
  const canUpdate = useHasPermission("live_sessions.update");
  const canDelete = useHasPermission("live_sessions.delete");

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LiveSessionStatus | "">("");

  const filterParams = { status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useLiveSessionList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("live-sessions", filterParams);
  const startSession = useStartLiveSession();
  const endSession = useEndLiveSession();
  const deleteSession = useDeleteLiveSession();

  const handleStart = (id: string, title: string) => {
    startSession.mutate(id, {
      onSuccess: () => {
        showToast({ title: "Session started" });
        navigate(`/live-sessions/${id}/room`);
      },
      onError: (err) => showToast({ title: `Could not start "${title}"`, description: err.message, tone: "danger" }),
    });
  };

  const handleEnd = async (id: string, title: string) => {
    const ok = await confirm({ title: `End "${title}"?`, description: "This closes the session for everyone.", tone: "danger" });
    if (!ok) return;
    endSession.mutate(id, {
      onSuccess: () => showToast({ title: "Session ended" }),
      onError: (err) => showToast({ title: "Could not end session", description: err.message, tone: "danger" }),
    });
  };

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({ title: `Delete "${title}"?`, description: "This cannot be undone.", tone: "danger" });
    if (!ok) return;
    deleteSession.mutate(id, {
      onSuccess: () => showToast({ title: `"${title}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Live Sessions</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Schedule and run live online lessons.</p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total sessions", value: stats.total as number, icon: CalendarClock },
              { key: "live", label: "Live now", value: stats.live as number, tone: "success", icon: Radio },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-[180px]">
          <Select value={status} onChange={(e) => { setStatus(e.target.value as LiveSessionStatus | ""); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/live-sessions/" params={filterParams} filename="live_sessions.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/live-sessions/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Schedule session
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No live sessions found" description="Schedule one to get started." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Scheduled start</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((session) => (
                <TableRowLink key={session.id} onClick={() => navigate(`/live-sessions/${session.id}/room`)}>
                  <TableCell className="font-medium">{session.title}</TableCell>
                  <TableCell>
                    {session.school_class_name}
                    {session.section_name && ` — ${session.section_name}`}
                  </TableCell>
                  <TableCell>{session.subject_name}</TableCell>
                  <TableCell>{new Date(session.scheduled_start).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge tone={statusTone(session.status)}>{session.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canUpdate && session.status === "scheduled" && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleStart(session.id, session.title); }}
                          aria-label={`Start ${session.title}`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-success)]"
                        >
                          <Play className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      {canUpdate && session.status === "live" && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleEnd(session.id, session.title); }}
                          aria-label={`End ${session.title}`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <Square className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      {session.status === "live" && (
                        <span className="flex items-center p-1.5 text-[var(--color-success)]" title="Live now">
                          <Radio className="size-4 animate-pulse" aria-hidden="true" />
                        </span>
                      )}
                      {canDelete && session.status === "scheduled" && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(session.id, session.title); }}
                          aria-label={`Delete ${session.title}`}
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
