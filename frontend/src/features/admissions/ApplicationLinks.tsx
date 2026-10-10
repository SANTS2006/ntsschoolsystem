import { Check, Copy, Download, ExternalLink, GraduationCap, Briefcase } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

import type { ApplicationKind } from "./types";

const KINDS: { kind: ApplicationKind; title: string; blurb: string; icon: typeof GraduationCap }[] = [
  { kind: "student", title: "Student applications", blurb: "For parents and guardians applying for a place.", icon: GraduationCap },
  { kind: "staff", title: "Staff applications", blurb: "For teachers and other staff applying for a role.", icon: Briefcase },
];

/** The address of one public application form: `<base>/<kind>`. */
function applyLink(baseUrl: string, kind: ApplicationKind): string {
  return `${baseUrl.replace(/\/+$/, "")}/${kind}`;
}

function LinkCard({ baseUrl, kind, title, blurb, icon: Icon }: (typeof KINDS)[number] & { baseUrl: string }) {
  const url = applyLink(baseUrl, kind);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure origin) — the link is in the box to copy by hand.
    }
  };

  const download = () => {
    const canvas = canvasWrap.current?.querySelector("canvas");
    if (!canvas) return;
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = `${kind}-application-qr.png`;
    anchor.click();
  };

  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-[var(--color-text)]">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{blurb}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* White tile so the code stays scannable in dark mode. */}
          <div ref={canvasWrap} className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-2">
            <QRCodeCanvas value={url} size={132} marginSize={0} title={`${title} QR code`} />
          </div>
          <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
            <input
              readOnly
              aria-label={`${title} link`}
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full min-w-0 truncate rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button variant="secondary" size="sm" onClick={download}>
                <Download className="size-4" aria-hidden="true" /> QR code
              </Button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]"
              >
                <ExternalLink className="size-4" aria-hidden="true" /> Open
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** One shareable link and QR code per kind of applicant — students and staff each get their own form. */
export function ApplicationLinks({ baseUrl }: { baseUrl: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {KINDS.map((item) => (
        <LinkCard key={item.kind} baseUrl={baseUrl} {...item} />
      ))}
    </div>
  );
}
