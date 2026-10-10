import { Download, FileText, Lock } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";
import { triggerFileDownload } from "@/lib/fileDownload";

import { useMyDocuments } from "./useDocumentsCrud";

export function MyDocumentsPage() {
  const { data: documents, isLoading, isError, error } = useMyDocuments();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Documents</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Your personal documents, plus documents shared with the whole school.
        </p>
      </div>

      {!documents || documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" description="Nothing has been shared with you yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 transition-colors hover:border-[var(--color-primary)]"
            >
              <OpenFileButton
                url={document.file}
                title={document.title}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <FileText className="size-5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">{document.title}</p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {document.category_name ?? "Uncategorized"}
                    {document.description && ` · ${document.description}`}
                  </p>
                </div>
              </OpenFileButton>
              {document.is_confidential && (
                <Lock className="size-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => triggerFileDownload(document.file, document.title)}
                aria-label={`Download ${document.title}`}
                title="Download"
                className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]"
              >
                <Download className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
