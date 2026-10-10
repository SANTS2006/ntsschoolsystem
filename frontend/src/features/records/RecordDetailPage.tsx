import { Download, FileText, Pencil, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { triggerFileDownload } from "@/lib/fileDownload";

import { isImageFile } from "./recordUtils";
import { useDeleteRecord, useRecord } from "./useRecordsCrud";

export function RecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdateAny = useHasPermission("records.update");
  const canDeleteAny = useHasPermission("records.delete");

  const { data: record, isLoading, isError, error } = useRecord(id);
  // Only the person who created a record can edit or delete it.
  const canUpdate = canUpdateAny && !!record?.is_mine;
  const canDelete = canDeleteAny && !!record?.is_mine;
  const deleteRecord = useDeleteRecord();

  const handleDelete = async () => {
    if (!record) return;
    const ok = await confirm({
      title: `Delete "${record.title}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteRecord.mutate(record.id, {
      onSuccess: () => {
        showToast({ title: "Record deleted" });
        navigate("/records");
      },
      onError: (err: ApiError) => showToast({ title: "Could not delete record", description: err.message, tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !record) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Record not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/records")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to records
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{record.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {record.created_by_name && `Added by ${record.created_by_name} · `}
            {new Date(record.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {canUpdate && (
            <Button variant="secondary" onClick={() => navigate(`/records/${record.id}/edit`)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={handleDelete} isLoading={deleteRecord.isPending}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {record.category && <Badge tone="primary">{record.category}</Badge>}

      {record.body && (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">{record.body}</p>
          </CardContent>
        </Card>
      )}

      {record.file && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Attachment</CardTitle>
            <button
              type="button"
              onClick={() => triggerFileDownload(record.file!, record.title)}
              aria-label={`Download ${record.title}`}
              title="Download"
              className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
            >
              <Download className="size-4" aria-hidden="true" />
            </button>
          </CardHeader>
          <CardContent>
            {isImageFile(record.file) ? (
              <OpenFileButton url={record.file} title={record.title} className="block w-full cursor-zoom-in">
                <img
                  src={record.file}
                  alt={record.title}
                  className="max-h-96 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] object-contain"
                />
              </OpenFileButton>
            ) : (
              <OpenFileButton
                url={record.file}
                title={record.title}
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3 text-sm font-medium text-[var(--color-primary)] hover:underline"
              >
                <FileText className="size-5" aria-hidden="true" />
                Open attachment
              </OpenFileButton>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
