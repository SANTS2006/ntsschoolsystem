import { BadgeCheck, Ban, Eye, IdCard as IdCardIcon, Printer, Search, UserCog, Users } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useSchoolClassList } from "@/features/academics/useAcademicsCrud";
import { useHasPermission } from "@/features/auth/useAuth";
import { useStaffList } from "@/features/staff/useStaffCrud";
import { useStudents } from "@/features/students/useStudents";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { IdCardSheet } from "./IdCardSheet";
import type { IdCard, IdCardHolderType, IdCardStatus } from "./types";
import { useBulkIssueIdCards, useIdCardList, useIssueIdCard, useRevokeIdCard } from "./useIdCardsCrud";

const PAGE_SIZE = 25;

function statusTone(card: IdCard): BadgeTone {
  if (card.status === "active") return card.is_valid ? "success" : "warning";
  return card.status === "revoked" ? "danger" : "neutral";
}

function statusLabel(card: IdCard): string {
  if (card.status === "active" && !card.is_valid) return "Expired";
  return card.status.charAt(0).toUpperCase() + card.status.slice(1);
}

export function IdCardsPage() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("idcards.create");
  const canUpdate = useHasPermission("idcards.update");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [holderType, setHolderType] = useState<IdCardHolderType | "">("");
  const [statusFilter, setStatusFilter] = useState<IdCardStatus | "">("active");
  const debouncedSearch = useDebounce(search);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewing, setViewing] = useState<IdCard[] | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const filterParams = {
    search: debouncedSearch || undefined,
    holder_type: holderType || undefined,
    status: statusFilter || undefined,
  };
  const { data, isLoading, isError, error } = useIdCardList({
    page,
    page_size: PAGE_SIZE,
    ordering: "-issued_at",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("idcards", filterParams);
  const revoke = useRevokeIdCard();

  const rows = data?.results ?? [];
  const pageIds = rows.map((card) => card.id);
  const allSelectedOnPage = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const selectedCards = rows.filter((card) => selectedIds.includes(card.id));

  const toggleOne = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const toggleAllOnPage = () =>
    setSelectedIds((current) =>
      allSelectedOnPage ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])],
    );

  const handleRevoke = async (card: IdCard) => {
    const ok = await confirm({
      title: `Revoke card ${card.card_number}?`,
      description: `${card.holder_name}'s card will stop verifying when scanned. You can issue a new one afterwards.`,
      tone: "danger",
    });
    if (!ok) return;
    revoke.mutate(card.id, {
      onSuccess: () => showToast({ title: "ID card revoked" }),
      onError: (err) => showToast({ title: "Could not revoke", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">ID cards</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Issue printable ID cards with a QR code for students and staff. Scanning the QR confirms the card is genuine
            and still valid.
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              Issue in bulk
            </Button>
            <Button onClick={() => setIssueOpen(true)}>Issue a card</Button>
          </div>
        )}
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "All cards", value: stats.total as number, icon: IdCardIcon },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: BadgeCheck },
              { key: "students", label: "Student cards", value: stats.students as number, icon: Users },
              { key: "staff", label: "Staff cards", value: stats.staff as number, icon: UserCog },
              { key: "revoked", label: "Revoked", value: stats.revoked as number, tone: "danger", icon: Ban },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-xs">
          <Input
            icon={Search}
            placeholder="Search by name, number or card no."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full max-w-[160px]">
          <Select
            aria-label="Filter by type"
            value={holderType}
            onChange={(e) => {
              setHolderType(e.target.value as IdCardHolderType | "");
              setPage(1);
            }}
          >
            <option value="">Students &amp; staff</option>
            <option value="student">Students</option>
            <option value="staff">Staff</option>
          </Select>
        </div>
        <div className="w-full max-w-[160px]">
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as IdCardStatus | "");
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="replaced">Replaced</option>
          </Select>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--color-text)]">{selectedIds.length} selected</span>
          <Button variant="secondary" size="sm" onClick={() => setViewing(selectedCards)} disabled={selectedCards.length === 0}>
            <Printer className="size-4" aria-hidden="true" /> Print selected
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSelectedIds([])}>
            Clear selection
          </Button>
        </div>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IdCardIcon}
          title="No ID cards yet"
          description={canCreate ? "Issue a card for one person, or issue for a whole class or all staff at once." : "Nothing has been issued."}
        />
      ) : (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all cards on this page"
                      checked={allSelectedOnPage}
                      onChange={toggleAllOnPage}
                      className="size-4 rounded border-[var(--color-border)]"
                    />
                  </TableHeaderCell>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Card no.</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Valid until</TableHeaderCell>
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {rows.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${card.holder_name}`}
                        checked={selectedIds.includes(card.id)}
                        onChange={() => toggleOne(card.id)}
                        className="size-4 rounded border-[var(--color-border)]"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{card.holder_name}</TableCell>
                    <TableCell className="capitalize">{card.holder_type}</TableCell>
                    <TableCell className="font-mono text-xs">{card.card_number}</TableCell>
                    <TableCell>
                      <Badge tone={statusTone(card)}>{statusLabel(card)}</Badge>
                    </TableCell>
                    <TableCell>{card.expires_at ? new Date(card.expires_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setViewing([card])} aria-label={`View card for ${card.holder_name}`}>
                          <Eye className="size-4" aria-hidden="true" /> View
                        </Button>
                        {canUpdate && card.status === "active" && (
                          <Button variant="ghost" size="sm" onClick={() => handleRevoke(card)} aria-label={`Revoke card for ${card.holder_name}`}>
                            <Ban className="size-4" aria-hidden="true" /> Revoke
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-[var(--color-border)]">
              <Pagination page={page} pageSize={PAGE_SIZE} count={data?.count ?? 0} onPageChange={setPage} />
            </div>
          </TableContainer>
        </ScrollReveal>
      )}

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing && viewing.length === 1 ? `ID card — ${viewing[0].holder_name}` : "Print ID cards"}
        maxWidthClassName="max-w-5xl"
      >
        {viewing && <IdCardSheet cards={viewing} />}
      </Modal>

      <IssueCardModal open={issueOpen} onClose={() => setIssueOpen(false)} onIssued={(card) => setViewing([card])} />
      <BulkIssueModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  );
}

function IssueCardModal({
  open,
  onClose,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  onIssued: (card: IdCard) => void;
}) {
  const { showToast } = useToast();
  const issue = useIssueIdCard();
  const [holderType, setHolderType] = useState<IdCardHolderType>("student");
  const [search, setSearch] = useState("");
  const [holderId, setHolderId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const debouncedSearch = useDebounce(search);

  const students = useStudents(
    { search: debouncedSearch || undefined, page_size: 20, status: "active" },
    { enabled: open && holderType === "student" },
  );
  const staff = useStaffList({ search: debouncedSearch || undefined, page_size: 20 });

  const options =
    holderType === "student"
      ? (students.data?.results ?? []).map((s) => ({ id: s.id, label: `${s.full_name} (${s.admission_number})` }))
      : (staff.data?.results ?? []).map((s) => ({ id: s.id, label: `${s.full_name}${s.staff_id ? ` (${s.staff_id})` : ""}` }));

  const reset = () => {
    setSearch("");
    setHolderId("");
    setExpiresAt("");
  };

  const submit = () => {
    issue.mutate(
      { holder_type: holderType, holder_id: holderId, expires_at: expiresAt || null },
      {
        onSuccess: (card) => {
          showToast({ title: "ID card issued", description: card.card_number });
          reset();
          onClose();
          onIssued(card);
        },
        onError: (err) => showToast({ title: "Could not issue card", description: err.message, tone: "danger" }),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Issue an ID card">
      <div className="flex flex-col gap-4">
        <Select
          label="Card for"
          value={holderType}
          onChange={(e) => {
            setHolderType(e.target.value as IdCardHolderType);
            setHolderId("");
          }}
        >
          <option value="student">Student</option>
          <option value="staff">Staff member</option>
        </Select>
        <Input icon={Search} placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Person" value={holderId} onChange={(e) => setHolderId(e.target.value)}>
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input
          label="Valid until (optional)"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          hint="Defaults to one year from today. Issuing again replaces any card this person already has."
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!holderId} isLoading={issue.isPending}>
            Issue card
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BulkIssueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const bulk = useBulkIssueIdCards();
  const [holderType, setHolderType] = useState<IdCardHolderType>("student");
  const [schoolClass, setSchoolClass] = useState("");
  const classes = useSchoolClassList({ page_size: 100 });

  const submit = () => {
    bulk.mutate(
      { holder_type: holderType, school_class: holderType === "student" && schoolClass ? schoolClass : null },
      {
        onSuccess: ({ issued, skipped }) => {
          showToast({
            title: `Issued ${issued} card(s)`,
            description: skipped.length > 0 ? `${skipped.length} skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}` : undefined,
            tone: skipped.length > 0 ? "danger" : "success",
          });
          onClose();
        },
        onError: (err) => showToast({ title: "Could not issue cards", description: err.message, tone: "danger" }),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Issue ID cards in bulk">
      <div className="flex flex-col gap-4">
        <Select label="Card for" value={holderType} onChange={(e) => setHolderType(e.target.value as IdCardHolderType)}>
          <option value="student">Active students</option>
          <option value="staff">Active staff</option>
        </Select>
        {holderType === "student" && (
          <Select label="Class" value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)}>
            <option value="">All classes</option>
            {(classes.data?.results ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <p className="text-sm text-[var(--color-text-muted)]">
          Only people without an active card get one — existing cards are left as they are.
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} isLoading={bulk.isPending}>
            Issue cards
          </Button>
        </div>
      </div>
    </Modal>
  );
}
