import { CalendarX2, ClipboardList, Plus, Trash2 } from "lucide-react";
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
import { useHasPermission } from "@/features/auth/useAuth";
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { attendanceStatusLabel, attendanceStatusTone } from "./statusTone";
import type { AttendanceStatus } from "./types";
import { useDeleteStaffAttendance, useStaffAttendanceList } from "./useAttendanceCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "late", "excused", "early_departure"];

export function StaffAttendanceListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("staff_attendance.create");
  const canDelete = useHasPermission("staff_attendance.delete");

  const [page, setPage] = useState(1);
  const [date, setDate] = useState("");
  const [staffId, setStaffId] = useState("");
  const [status, setStatus] = useState<AttendanceStatus | "">("");
  const { data: staff } = useStaffLookup();

  const filterParams = {
    date: date || undefined,
    staff: staffId || undefined,
    status: status || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useStaffAttendanceList({
    page,
    page_size: PAGE_SIZE,
    ordering: "-date",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("attendance/staff", filterParams);
  const deleteRecord = useDeleteStaffAttendance();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete this attendance record for ${name}?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteRecord.mutate(id, {
      onSuccess: () => showToast({ title: "Record deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total records", value: stats.total as number, icon: ClipboardList }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-[160px]">
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-xs">
            <Select
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All staff</option>
              {staff?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as AttendanceStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {attendanceStatusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/attendance/staff/" params={filterParams} filename="staff_attendance.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/attendance/staff/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New record
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={CalendarX2} title="No attendance records found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Staff</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Check-in</TableHeaderCell>
                <TableHeaderCell>Check-out</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((record) => (
                <TableRowLink key={record.id} onClick={() => navigate(`/attendance/staff/${record.id}/edit`)}>
                  <TableCell className="font-medium">{record.date}</TableCell>
                  <TableCell>{record.staff_name}</TableCell>
                  <TableCell>
                    <Badge tone={attendanceStatusTone(record.status)}>{attendanceStatusLabel(record.status)}</Badge>
                  </TableCell>
                  <TableCell>{record.check_in_time?.slice(0, 5) ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>{record.check_out_time?.slice(0, 5) ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(record.id, record.staff_name);
                        }}
                        aria-label={`Delete attendance record for ${record.staff_name}`}
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
