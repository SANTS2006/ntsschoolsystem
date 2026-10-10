import { Copy, Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

interface RecoveryCodesPanelProps {
  codes: string[];
  /** Label of the button that continues once the user confirms they've saved the codes. */
  continueLabel: string;
  onContinue: () => void;
}

/** Shows the one-time backup codes. They are never displayed again (only their hashes are stored),
 * so the user must confirm they've saved them before they can continue. */
export function RecoveryCodesPanel({ codes, continueLabel, onContinue }: RecoveryCodesPanelProps) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard unavailable (insecure context / denied) — the codes are still on screen */
    }
  };

  const download = () => {
    const blob = new Blob([`NTS School System - recovery codes\nEach code works once.\n\n${text}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nts-recovery-codes.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Save these recovery codes somewhere safe (a password manager or a printout). If you lose your phone, each
        code lets you sign in <strong>once</strong>. They won't be shown again.
      </p>
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 font-mono text-sm text-[var(--color-text)]"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          <Copy className="size-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={download}>
          <Download className="size-4" aria-hidden="true" />
          Download
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-[var(--color-primary)]"
        />
        I have saved my recovery codes
      </label>
      <Button type="button" disabled={!saved} onClick={onContinue} className="w-full">
        {continueLabel}
      </Button>
    </div>
  );
}
