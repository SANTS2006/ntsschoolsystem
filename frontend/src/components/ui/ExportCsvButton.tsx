import { Download } from "lucide-react";
import { useState } from "react";

import { downloadCsvExport } from "@/lib/exportCsv";

import { Button } from "./Button";
import { useToast } from "./toastContext";

/** Drop into any list page's toolbar next to "New X" — exports every row matching the page's
 * current filters (not just the current page) as a CSV download. `path` is the same list
 * endpoint the page already calls; `params` should be its current filter params (search,
 * status, etc.) minus `page`/`page_size`, so the export matches what's on screen. */
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

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadCsvExport(path, params ?? {}, filename);
    } catch {
      showToast({ title: "Export failed", description: "Could not download this export. Please try again.", tone: "danger" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button type="button" variant="secondary" onClick={handleExport} isLoading={isExporting}>
      {!isExporting && <Download className="size-4" aria-hidden="true" />}
      Export CSV
    </Button>
  );
}
