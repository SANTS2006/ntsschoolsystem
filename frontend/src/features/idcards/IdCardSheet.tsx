import { Download, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toastContext";
import { captureNode } from "@/lib/capture";
import { printWithPortal } from "@/lib/printPortal";

import { IdCardBack, IdCardFront } from "./IdCardFaces";
import type { IdCard } from "./types";

function CardPair({ card }: { card: IdCard }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <IdCardFront card={card} />
      <IdCardBack card={card} />
    </div>
  );
}

/** Shows one or more cards (front + back side by side) with Print and — for a single card —
 * Download PNG. Printing goes through the browser's own dialog, which also offers "Save as PDF". */
export function IdCardSheet({ cards }: { cards: IdCard[] }) {
  const { showToast } = useToast();
  const captureRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const downloadPng = async () => {
    if (!captureRef.current || cards.length !== 1) return;
    setDownloading(true);
    const capture = async (skipImages: boolean) => {
      // Loaded on demand — it's only needed when someone actually downloads a card.
      // A photo/logo host without CORS headers can make the capture fail; the retry leaves the
      // photos out (the card still carries the name, number and QR) rather than failing outright.
      return captureNode(captureRef.current as HTMLElement, { scale: 3, skipImages });
    };
    try {
      let canvas: HTMLCanvasElement;
      let photosLeftOut = false;
      try {
        canvas = await capture(false);
        canvas.toDataURL("image/png"); // throws if the canvas was tainted by a cross-origin image
      } catch {
        canvas = await capture(true);
        photosLeftOut = true;
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("empty image");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${cards[0].card_number}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (photosLeftOut) {
        showToast({ title: "Downloaded without the photo", description: "The photo couldn't be embedded in the image." });
      }
    } catch (err) {
      console.error("ID card image export failed", err);
      showToast({ title: "Could not create the image", description: "Please try again, or use Print.", tone: "danger" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={printWithPortal}>
          <Printer className="size-4" aria-hidden="true" /> Print
        </Button>
        {cards.length === 1 && (
          <Button type="button" size="sm" variant="secondary" onClick={downloadPng} isLoading={downloading}>
            <Download className="size-4" aria-hidden="true" /> Download PNG
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-5 overflow-x-auto">
        {cards.map((card, index) => (
          <div key={card.id} ref={index === 0 ? captureRef : undefined} className="w-fit bg-white p-2">
            <CardPair card={card} />
          </div>
        ))}
      </div>

      {createPortal(
        <div className="idcard-print-root" data-printable-root>
          {cards.map((card) => (
            <div key={card.id} className="idcard-print-pair">
              <IdCardFront card={card} />
              <IdCardBack card={card} />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
