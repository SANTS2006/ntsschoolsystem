import { Download, Printer } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toastContext";
import { usePrintableSection } from "@/hooks/usePrintableSection";

/** A page that is one printable document (a receipt, a transcript): a heading with Download and Print
 * buttons, and the document itself below. Print and Download cover only the document — never the heading,
 * the buttons or the app around it. */
export function PrintableDocument({
  title,
  description,
  filename,
  children,
}: {
  title: string;
  description?: string;
  /** Name of the downloaded PDF. */
  filename: string;
  children: ReactNode;
}) {
  const { showToast } = useToast();
  const { printableRef, print, download, isDownloading, downloadError } = usePrintableSection(filename);

  useEffect(() => {
    if (downloadError) {
      showToast({ title: "Could not download the file", description: downloadError, tone: "danger" });
    }
  }, [downloadError, showToast]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
          {description && <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={download} isLoading={isDownloading}>
            {!isDownloading && <Download className="size-4" aria-hidden="true" />}
            Download
          </Button>
          <Button variant="secondary" onClick={print}>
            <Printer className="size-4" aria-hidden="true" />
            Print
          </Button>
        </div>
      </div>
      <div ref={printableRef} className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
}
