import { Download, FileText } from "lucide-react";

import { OpenFileButton } from "@/components/ui/FileViewer";
import { cn } from "@/lib/cn";
import { triggerFileDownload } from "@/lib/fileDownload";

/** One uploaded file, shown as a clickable name (opens it in the in-app viewer) with a separate
 * Download button next to it that saves the file to the device. Used everywhere a document/material/attachment is listed. */
export function FileLink({
  url,
  label,
  className,
}: {
  url: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3", className)}>
      <FileText className="size-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
      <OpenFileButton
        url={url}
        title={label}
        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
      >
        {label}
      </OpenFileButton>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerFileDownload(url, label);
        }}
        aria-label={`Download ${label}`}
        title="Download"
        className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]"
      >
        <Download className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
