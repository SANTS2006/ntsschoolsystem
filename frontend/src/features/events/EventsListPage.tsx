import { Calendar, CalendarClock, Plus, Search, Send, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { CategorySelect } from "@/components/ui/CategorySelect";
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

import { categoryLabel, eventStatusLabel, eventStatusTone } from "./statusTone";
import type { BuiltinEventCategory, EventCategory, EventStatus } from "./types";
import { useCancelEvent, useDeleteEvent, useEventList, usePublishEvent } from "./useEventsCrud";

const PAGE_SIZE = 25;
const CATEGORIES: BuiltinEventCategory[] = ["academic", "sports", "cultural", "meeting", "holiday", "other"];
const STATUSES: EventStatus[] = ["draft", "published", "cancelled"];

export function EventsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("events.create");
  const canUpdate = useHasPermission("events.update");
  const canDelete = useHasPermission("events.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EventCategory | "">("");
  const [status, setStatus] = useState<EventStatus | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
    category: category || undefined,
    status: status || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useEventList({
    page,
    page_size: PAGE_SIZE,
    ordering: "-start_datetime",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("events", filterParams);
  const deleteEvent = useDeleteEvent();
  const publishEvent = usePublishEvent();
  const cancelEvent = useCancelEvent();

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Delete event "${title}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteEvent.mutate(id, {
      onSuccess: () => showToast({ title: `"${title}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  const handlePublish = (id: string) => {
    publishEvent.mutate(id, {
      onSuccess: (result) => showToast({ title: result.message }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not publish", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleCancel = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Cancel "${title}"?`,
      description: "Registered attendees will see it as cancelled.",
      tone: "danger",
    });
    if (!ok) return;
    cancelEvent.mutate(id, {
      onSuccess: () => showToast({ title: "Event cancelled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not cancel", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Events</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">School events, meetings, and activities.</p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total events", value: stats.total as number, icon: Calendar },
              { key: "published", label: "Published", value: stats.published as number, icon: Send },
              { key: "upcoming", label: "Upcoming", value: stats.upcoming as number, icon: CalendarClock },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by title or location"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[160px]">
            <CategorySelect
              field="events.category"
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
                setStatus(e.target.value as EventStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {eventStatusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/events/" params={filterParams} filename="events.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/events/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New event
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Calendar} title="No events found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.results.map((event) => {
              const canPublish = canUpdate && event.is_mine && event.status === "draft";
              const canCancel = canUpdate && event.is_mine && event.status === "published";
              const canRemove = canDelete && event.is_mine;
              return (
                <ImageCard
                  key={event.id}
                  image={event.image}
                  fallbackIcon={Calendar}
                  title={event.title}
                  subtitle={new Date(event.start_datetime).toLocaleString()}
                  chips={[
                    event.category_label,
                    `${event.registered_count}${event.capacity !== null ? ` / ${event.capacity}` : ""} attending`,
                  ]}
                  badge={<Badge tone={eventStatusTone(event.status)}>{eventStatusLabel(event.status)}</Badge>}
                  description={event.description}
                  meta={event.location ? <span>{event.location}</span> : undefined}
                  dimmed={event.status === "cancelled"}
                  onClick={() => navigate(`/events/${event.id}`)}
                  actions={
                    canPublish || canCancel || canRemove ? (
                      <>
                        {canPublish && (
                          <CardAction
                            label={`Publish ${event.title}`}
                            icon={Send}
                            tone="success"
                            disabled={publishEvent.isPending}
                            onClick={() => handlePublish(event.id)}
                          />
                        )}
                        {canCancel && (
                          <CardAction
                            label={`Cancel ${event.title}`}
                            icon={XCircle}
                            tone="danger"
                            disabled={cancelEvent.isPending}
                            onClick={() => handleCancel(event.id, event.title)}
                          />
                        )}
                        {canRemove && (
                          <CardAction
                            label={`Delete ${event.title}`}
                            icon={Trash2}
                            tone="danger"
                            onClick={() => handleDelete(event.id, event.title)}
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
