import { Archive, Paperclip, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import type { ApiError } from "@/lib/api-client";

import { isImageFile } from "./recordUtils";
import { useDeleteRecord, useRecordList } from "./useRecordsCrud";

const PAGE_SIZE = 24;

export function RecordsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("records.create");
  const canUpdate = useHasPermission("records.update");
  const canDelete = useHasPermission("records.delete");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, isError, error, isFetching } = useRecordList({
    page_size: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });
  const deleteRecord = useDeleteRecord();

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Delete "${title}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteRecord.mutate(id, {
      onSuccess: () => showToast({ title: "Record deleted" }),
      onError: (err: ApiError) => showToast({ title: "Could not delete record", description: err.message, tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Records</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Important school information — policies, notices and documents kept in one shared place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            path="/records/"
            params={{ search: debouncedSearch || undefined }}
            filename="records.csv"
          />
          {canCreate && (
            <Button onClick={() => navigate("/records/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Add record
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-sm">
        <Input
          icon={Search}
          placeholder="Search records"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search records"
        />
      </div>

      {isError ? (
        <Alert tone="danger">{(error as ApiError).message}</Alert>
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No records yet"
          description={
            canCreate
              ? "Add the school's first record using the button above."
              : "Nothing has been added here yet — check back later."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {isFetching && (
            <div className="col-span-full flex justify-center">
              <Spinner />
            </div>
          )}
          {data.results.map((record) => (
            <article
              key={record.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
            >
              <div className="h-1.5 bg-[image:var(--gradient-primary)]" aria-hidden="true" />
              <button
                type="button"
                onClick={() => navigate(`/records/${record.id}`)}
                className="flex flex-1 flex-col gap-3 p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-white shadow-[0_8px_20px_-8px_rgba(21,101,192,0.7)]">
                    {record.file && isImageFile(record.file) ? (
                      <img src={record.file} alt="" className="size-full rounded-xl object-cover" />
                    ) : (
                      <Archive className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-[var(--color-text)]">{record.title}</h2>
                    {record.category && (
                      <span className="mt-1 inline-block rounded-full bg-[var(--color-bg-subtle)] px-2.5 py-0.5 text-xs text-[var(--color-text-muted)]">
                        {record.category}
                      </span>
                    )}
                  </div>
                </div>
                {record.body && (
                  <p className="line-clamp-3 text-sm text-[var(--color-text-muted)]">{record.body}</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-1 text-xs text-[var(--color-text-muted)]">
                  <span>
                    {record.created_by_name && `Added by ${record.created_by_name}`}
                  </span>
                  {record.file && (
                    <span className="flex items-center gap-1">
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      Attachment
                    </span>
                  )}
                </div>
              </button>
              {record.is_mine && (canUpdate || canDelete) && (
                <div className="flex justify-end gap-1 border-t border-[var(--color-border)] px-3 py-2">
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => navigate(`/records/${record.id}/edit`)}
                      aria-label={`Edit ${record.title}`}
                      className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(record.id, record.title)}
                      aria-label={`Delete ${record.title}`}
                      className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
