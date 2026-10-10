import { CheckCircle2, ClipboardList, Search, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
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
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { AcceptApplicationsDialog, type Applicant } from "./AcceptApplicationsDialog";
import { InterviewInviteModal } from "./InterviewInviteModal";
import { applicationStatusLabel, applicationStatusTone } from "./statusTone";
import type { ApplicationKind, ApplicationStatus } from "./types";
import {
  useApplicationList,
  useBulkRejectApplications,
  useBulkShortlistApplications,
  useDeleteApplication,
} from "./useAdmissionsCrud";

const PAGE_SIZE = 25;
const KIND_OPTIONS: { value: ApplicationKind | ""; label: string }[] = [
  { value: "", label: "All applicants" },
  { value: "student", label: "Student" },
  { value: "staff", label: "Staff" },
];
const STATUS_OPTIONS: ApplicationStatus[] = [
  "submitted",
  "shortlisted",
  "interview_scheduled",
  "accepted",
  "rejected",
];

export function ApplicationsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("admissions.update");
  const canDelete = useHasPermission("admissions.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ApplicationKind | "">("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "">("");
  const debouncedSearch = useDebounce(search);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [interviewModalOpen, setInterviewModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const filterParams = {
    search: debouncedSearch || undefined,
    kind: kind || undefined,
    status: statusFilter || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useApplicationList({
    page,
    page_size: PAGE_SIZE,
    ordering: "-created_at",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("admissions/applications", filterParams);
  const deleteApplication = useDeleteApplication();
  const bulkShortlist = useBulkShortlistApplications();
  // What the Accept dialog needs about each selected applicant. Kept alongside the ids because a
  // selection can span pages, and only the current page's rows are in memory.
  const [selectedInfo, setSelectedInfo] = useState<Record<string, Applicant>>({});
  const [acceptOpen, setAcceptOpen] = useState(false);
  const bulkReject = useBulkRejectApplications();

  const pageIds = data?.results.map((application) => application.id) ?? [];
  const allSelectedOnPage = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const toggleOne = (application: { id: string; full_name: string; kind: ApplicationKind }) => {
    setSelectedInfo((info) => ({ ...info, [application.id]: { id: application.id, name: application.full_name, kind: application.kind } }));
    setSelectedIds((current) =>
      current.includes(application.id) ? current.filter((x) => x !== application.id) : [...current, application.id],
    );
  };

  const toggleAllOnPage = () => {
    setSelectedInfo((info) => ({
      ...info,
      ...Object.fromEntries(
        (data?.results ?? []).map((a) => [a.id, { id: a.id, name: a.full_name, kind: a.kind } satisfies Applicant]),
      ),
    }));
    setSelectedIds((current) =>
      allSelectedOnPage ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])],
    );
  };

  const handleShortlist = async () => {
    const ok = await confirm({
      title: `Shortlist ${selectedIds.length} applicant(s)?`,
      description: "They'll be marked as shortlisted, ready to invite for interview.",
    });
    if (!ok) return;
    bulkShortlist.mutate(selectedIds, {
      onSuccess: ({ updated }) => {
        showToast({ title: `Shortlisted ${updated} applicant(s)` });
        setSelectedIds([]);
      },
      onError: (err) => showToast({ title: "Could not shortlist", description: err.message, tone: "danger" }),
    });
  };

  const handleReject = () => {
    bulkReject.mutate(
      { applicationIds: selectedIds, reason: rejectReason },
      {
        onSuccess: ({ updated }) => {
          showToast({ title: `Rejected ${updated} applicant(s)` });
          setSelectedIds([]);
          setRejectModalOpen(false);
          setRejectReason("");
        },
        onError: (err) => showToast({ title: "Could not reject applicants", description: err.message, tone: "danger" }),
      },
    );
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete application from "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteApplication.mutate(id, {
      onSuccess: () => showToast({ title: "Application deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Applications</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Review student and staff applications submitted through the public application form.
        </p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total", value: stats.total as number, icon: Users },
              { key: "submitted", label: "New", value: stats.submitted as number, icon: ClipboardList },
              { key: "interview_scheduled", label: "Interviewing", value: stats.interview_scheduled as number, tone: "warning", icon: UserCheck },
              { key: "accepted", label: "Accepted", value: stats.accepted as number, tone: "success", icon: CheckCircle2 },
              { key: "rejected", label: "Rejected", value: stats.rejected as number, tone: "danger", icon: UserX },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[160px]">
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ApplicationKind | "");
                setPage(1);
              }}
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as ApplicationStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {applicationStatusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ExportCsvButton path="/admissions/applications/" params={filterParams} filename="applications.csv" />
      </div>

      {canUpdate && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--color-text)]">{selectedIds.length} selected</span>
          <Button variant="secondary" size="sm" onClick={handleShortlist} isLoading={bulkShortlist.isPending}>
            Shortlist
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setInterviewModalOpen(true)}>
            Invite to interview
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAcceptOpen(true)}>
            Accept
          </Button>
          <Button variant="danger" size="sm" onClick={() => setRejectModalOpen(true)}>
            Reject
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSelectedIds([])}>
            Clear selection
          </Button>
        </div>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Users} title="No applications found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  {canUpdate && (
                    <TableHeaderCell className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all applications on this page"
                        checked={allSelectedOnPage}
                        onChange={toggleAllOnPage}
                        className="size-4 rounded border-[var(--color-border)]"
                      />
                    </TableHeaderCell>
                  )}
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Kind</TableHeaderCell>
                  <TableHeaderCell>Applying for</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((application) => (
                  <TableRowLink
                    key={application.id}
                    onClick={() => navigate(`/admissions/applications/${application.id}`)}
                  >
                    {canUpdate && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${application.full_name}`}
                          checked={selectedIds.includes(application.id)}
                          onChange={() => toggleOne(application)}
                          className="size-4 rounded border-[var(--color-border)]"
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{application.full_name}</TableCell>
                    <TableCell className="capitalize">{application.kind}</TableCell>
                    <TableCell>
                      {application.kind === "student"
                        ? (application.applying_for_class_name ?? <span className="text-[var(--color-text-muted)]">—</span>)
                        : (application.applying_for_role_name ?? <span className="text-[var(--color-text-muted)]">—</span>)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={applicationStatusTone(application.status)}>
                        {applicationStatusLabel(application.status)}
                      </Badge>
                    </TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(application.id, application.full_name);
                          }}
                          aria-label={`Delete ${application.full_name}`}
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

      <AcceptApplicationsDialog
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        applicants={selectedIds.map((id) => selectedInfo[id]).filter(Boolean)}
        onDone={() => setSelectedIds([])}
      />

      <InterviewInviteModal
        open={interviewModalOpen}
        onClose={() => setInterviewModalOpen(false)}
        applicationIds={selectedIds}
        onDone={() => {
          setInterviewModalOpen(false);
          setSelectedIds([]);
        }}
      />

      <Modal open={rejectModalOpen} onClose={() => setRejectModalOpen(false)} title={`Reject ${selectedIds.length} applicant(s)`}>
        <div className="flex flex-col gap-4">
          <Textarea
            label="Reason (optional)"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Shared with the applicant in their notification email."
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={handleReject} isLoading={bulkReject.isPending}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
