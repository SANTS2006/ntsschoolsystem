import { useRef, useState } from "react";

import { captureNode } from "@/lib/capture";
import { printNode } from "@/lib/printPortal";

// A4 at 72dpi, in points.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 28;

/**
 * Scopes both "Print" and "Download" to one DOM node, so the app's own shell (sidebar, nav, buttons)
 * never ends up in the printed page or the downloaded file — only the marked section does.
 *
 * Print: the section is copied onto a plain block on <body> and the browser's print dialog opened (see
 * lib/printPortal.ts), so it paginates properly and prints in light colours whatever theme is on screen.
 *
 * Download: the section is rendered by the browser itself (lib/capture.ts) and laid onto as many A4
 * pages as it needs (jsPDF), saved as `filename`. Both libraries load on demand.
 */
export function usePrintableSection(filename: string) {
  const printableRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const print = () => {
    if (printableRef.current) printNode(printableRef.current);
    else window.print();
  };

  const download = async () => {
    const node = printableRef.current;
    if (!node) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const [{ jsPDF }, canvas] = await Promise.all([import("jspdf"), captureNode(node, { scale: 2 })]);
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const usableWidth = PAGE_WIDTH - MARGIN * 2;
      const usableHeight = PAGE_HEIGHT - MARGIN * 2;
      // How many canvas pixels fit on one page at that width.
      const sliceHeight = Math.floor((usableHeight / usableWidth) * canvas.width);
      const pages = Math.max(1, Math.ceil(canvas.height / sliceHeight));

      for (let page = 0; page < pages; page += 1) {
        const top = page * sliceHeight;
        const height = Math.min(sliceHeight, canvas.height - top);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = height;
        const context = slice.getContext("2d");
        if (!context) throw new Error("Could not prepare the page.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, slice.width, slice.height);
        context.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN, MARGIN, usableWidth, (height / canvas.width) * usableWidth);
      }
      pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Could not generate the file.");
    } finally {
      setIsDownloading(false);
    }
  };

  return { printableRef, print, download, isDownloading, downloadError };
}
