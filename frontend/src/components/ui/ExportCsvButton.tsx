import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { downloadCsvExport } from "@/lib/exportCsv";

import { Button } from "./Button";
import { useToast } from "./toastContext";

/** Drop into any list page's toolbar next to "New X" — exports every row matching the page's current filters (not just the
 * current page) as a CSV or an Excel file. `path` is the same list endpoint the page already calls; `params` should be its
 * current filter params (search, status, etc.) minus `page`/`page_size`, so the export matches what's on screen. */
export function ExportCsvButton({
  path,
  params,
  filename,
}: {
  path: string;
  params?: Record<string, string | number | boolean | undefined>;
  filename: string;
}) {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const handleExport = async (format: "csv" | "xlsx") => {
    setOpen(false);
    setIsExporting(true);
    try {
      await downloadCsvExport(path, params ?? {}, filename, format);
    } catch {
      showToast({ title: "Export failed", description: "Could not download this export. Please try again.", tone: "danger" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)} isLoading={isExporting} aria-haspopup="menu" aria-expanded={open}>
        {!isExporting && <Download className="size-4" aria-hidden="true" />}
        Export
        <ChevronDown className="size-4" aria-hidden="true" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExport("csv")}
            className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]"
          >
            <FileText className="size-4" aria-hidden="true" />
            CSV file
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExport("xlsx")}
            className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]"
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            Excel file
          </button>
        </div>
      )}
    </div>
  );
}
