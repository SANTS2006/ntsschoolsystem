import { CalendarClock, Plus, Radio, Search, Video } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRowLink } from "@/components/ui/Table";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { formatMeetingTime, meetingStatusTone } from "./statusTone";
import type { MeetingStatus } from "./types";
import { useMeetingList } from "./useMeetingsCrud";

const PAGE_SIZE = 25;

export function MeetingsListPage() {
  const navigate = useNavigate();
  const canCreate = useHasPermission("meetings.create");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined, status: statusFilter || undefined };
  const { data, isLoading, isError, error } = useMeetingList({
    page,
    page_size: PAGE_SIZE,
    ordering: "-scheduled_start",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("meetings", filterParams);
  const rows = data?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Live meetings</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Call a video meeting for staff, parents, students — or everybody — and email them all the details.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/meetings/new")}>
            <Plus className="size-4" aria-hidden="true" /> New meeting
          </Button>
        )}
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "All meetings", value: stats.total as number, icon: Video },
              { key: "scheduled", label: "Upcoming", value: stats.scheduled as number, icon: CalendarClock },
              { key: "live", label: "Live now", value: stats.live as number, tone: "success", icon: Radio },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-xs">
          <Input
            icon={Search}
            placeholder="Search by title"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full max-w-[170px]">
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as MeetingStatus | "");
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No meetings yet"
          description={canCreate ? "Create one and everyone you invite is emailed straight away." : "Nothing has been scheduled."}
        />
      ) : (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Title</TableHeaderCell>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>Invited</TableHeaderCell>
                  <TableHeaderCell>People</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {rows.map((meeting) => (
                  <TableRowLink key={meeting.id} onClick={() => navigate(`/meetings/${meeting.id}`)}>
                    <TableCell className="font-medium">{meeting.title}</TableCell>
                    <TableCell>{formatMeetingTime(meeting.scheduled_start)}</TableCell>
                    <TableCell>{meeting.audience}</TableCell>
                    <TableCell>{meeting.invitee_counts.total}</TableCell>
                    <TableCell>
                      <Badge tone={meetingStatusTone(meeting.status)} className="capitalize">
                        {meeting.status}
                      </Badge>
                    </TableCell>
                  </TableRowLink>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-[var(--color-border)]">
              <Pagination page={page} pageSize={PAGE_SIZE} count={data?.count ?? 0} onPageChange={setPage} />
            </div>
          </TableContainer>
        </ScrollReveal>
      )}
    </div>
  );
}
