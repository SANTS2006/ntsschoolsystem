import { CheckCircle2, Clock, MessageSquareWarning, Plus, Search, Send } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { Badge } from "@/components/ui/Badge";
import { ImageCard } from "@/components/ui/ImageCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { categoryLabel, priorityLabel, statusLabel, statusTone } from "./statusTone";
import type { BuiltinComplaintCategory, ComplaintCategory, ComplaintPriority, ComplaintStatus } from "./types";
import { useComplaintList } from "./useComplaintsCrud";

const PAGE_SIZE = 25;
const CATEGORIES: BuiltinComplaintCategory[] = ["academic", "facility", "behavioral", "administrative", "other"];
const STATUSES: ComplaintStatus[] = ["submitted", "under_review", "resolved", "rejected"];
const PRIORITIES: ComplaintPriority[] = ["low", "normal", "high"];

export function ComplaintsListPage() {
  const navigate = useNavigate();
  const canViewAll = useHasPermission("complaints.view");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ComplaintCategory | "">("");
  const [status, setStatus] = useState<ComplaintStatus | "">("");
  const [priority, setPriority] = useState<ComplaintPriority | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
    category: category || undefined,
    status: status || undefined,
    priority: priority || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useComplaintList({
    page,
    page_size: PAGE_SIZE,
    ordering: "-created_at",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("complaints", filterParams);

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Complaints</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {canViewAll ? "Every complaint submitted in your school." : "Complaints and suggestions you've submitted."}
        </p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total", value: stats.total as number, icon: MessageSquareWarning },
              { key: "submitted", label: "Submitted", value: stats.submitted as number, icon: Send },
              { key: "under_review", label: "Under review", value: stats.under_review as number, icon: Clock },
              { key: "resolved", label: "Resolved", value: stats.resolved as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by subject or description"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[160px]">
            <CategorySelect
              field="complaints.category"
              allLabel="All categories"
              builtin={CATEGORIES.map((value) => ({ value, label: categoryLabel(value) }))}
              value={category}
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              otherText=""
              onOtherTextChange={() => undefined}
            />
          </div>
          <div className="w-full max-w-[160px]">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ComplaintStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[140px]">
            <Select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value as ComplaintPriority | "");
                setPage(1);
              }}
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {priorityLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/complaints/" params={filterParams} filename="complaints.csv" />
          <Button onClick={() => navigate("/complaints/new")}>
            <Plus className="size-4" aria-hidden="true" />
            New complaint
          </Button>
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title="No complaints found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.results.map((complaint) => (
              <ImageCard
                key={complaint.id}
                image={complaint.image}
                fallbackIcon={MessageSquareWarning}
                title={complaint.subject}
                subtitle={
                  canViewAll ? (complaint.submitted_by_name ?? "Anonymous") : new Date(complaint.created_at).toLocaleDateString()
                }
                chips={[complaint.category_label, `${priorityLabel(complaint.priority)} priority`]}
                badge={<Badge tone={statusTone(complaint.status)}>{statusLabel(complaint.status)}</Badge>}
                description={complaint.description}
                meta={
                  canViewAll ? <span>Submitted {new Date(complaint.created_at).toLocaleDateString()}</span> : undefined
                }
                onClick={() => navigate(`/complaints/${complaint.id}`)}
              />
            ))}
          </div>
          <div className="mt-5 overflow-hidden rounded-xl border border-[var(--color-border)]">
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </div>
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
