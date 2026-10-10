import { CheckCircle2, Megaphone, Plus, Search, Send, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { CardAction, ImageCard } from "@/components/ui/ImageCard";
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
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { publishedTone, targetTypeLabel } from "./statusTone";
import type { TargetType } from "./types";
import { useAnnouncementList, useDeleteAnnouncement, usePublishAnnouncement } from "./useCommunicationsCrud";

const PAGE_SIZE = 25;
const TARGET_TYPES: TargetType[] = [
  "school",
  "class",
  "section",
  "department",
  "staff",
  "students",
  "parents",
  "specific_users",
];

export function AnnouncementsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("communications.create");
  const canDelete = useHasPermission("communications.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [targetType, setTargetType] = useState<TargetType | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
    target_type: targetType || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useAnnouncementList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("communications/announcements", filterParams);
  const deleteAnnouncement = useDeleteAnnouncement();
  const publishAnnouncement = usePublishAnnouncement();

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Delete announcement "${title}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteAnnouncement.mutate(id, {
      onSuccess: () => showToast({ title: `"${title}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  const handlePublish = (id: string) => {
    publishAnnouncement.mutate(id, {
      onSuccess: (result) => showToast({ title: result.message }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not publish", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Communications</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">School-wide and targeted announcements.</p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total announcements", value: stats.total as number, icon: Megaphone },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by title or body"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as TargetType | "");
                setPage(1);
              }}
            >
              <option value="">All audiences</option>
              {TARGET_TYPES.map((option) => (
                <option key={option} value={option}>
                  {targetTypeLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/communications/announcements/" params={filterParams} filename="announcements.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/communications/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New announcement
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.results.map((announcement) => {
              const canPublish = canCreate && announcement.is_mine && !announcement.published_at;
              const canRemove = canDelete && announcement.is_mine;
              const hasRecipients = announcement.target_type === "specific_users";
              return (
                <ImageCard
                  key={announcement.id}
                  image={announcement.image}
                  fallbackIcon={Megaphone}
                  title={announcement.title}
                  subtitle={
                    [
                      targetTypeLabel(announcement.target_type),
                      announcement.target_class_name,
                      announcement.target_section_name,
                      announcement.target_department_name,
                    ]
                      .filter(Boolean)
                      .join(" — ")
                  }
                  chips={announcement.created_by_name ? [`By ${announcement.created_by_name}`] : undefined}
                  badge={
                    <Badge tone={publishedTone(announcement.published_at)}>
                      {announcement.published_at ? "Published" : "Draft"}
                    </Badge>
                  }
                  description={announcement.body}
                  onClick={() => navigate(`/communications/${announcement.id}/edit`)}
                  actions={
                    hasRecipients || canPublish || canRemove ? (
                      <>
                        {hasRecipients && (
                          <CardAction
                            label={`Manage recipients for ${announcement.title}`}
                            icon={Users}
                            onClick={() => navigate(`/communications/${announcement.id}/recipients`)}
                          />
                        )}
                        {canPublish && (
                          <CardAction
                            label={`Publish ${announcement.title}`}
                            icon={Send}
                            tone="success"
                            disabled={publishAnnouncement.isPending}
                            onClick={() => handlePublish(announcement.id)}
                          />
                        )}
                        {canRemove && (
                          <CardAction
                            label={`Delete ${announcement.title}`}
                            icon={Trash2}
                            tone="danger"
                            onClick={() => handleDelete(announcement.id, announcement.title)}
                          />
                        )}
                      </>
                    ) : undefined
                  }
                />
              );
            })}
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
