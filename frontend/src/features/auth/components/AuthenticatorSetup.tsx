import { ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface AuthenticatorSetupProps {
  secret: string;
  otpauthUri: string;
  isSubmitting: boolean;
  errorMessage?: string;
  onConfirm: (code: string) => void;
}

/** Step shared by first-login enrolment and Settings: scan the QR code (or type the key), then prove
 * the app works by entering its current 6-digit code. */
export function AuthenticatorSetup({ secret, otpauthUri, isSubmitting, errorMessage, onConfirm }: AuthenticatorSetupProps) {
  const [code, setCode] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm(code.replace(/\s/g, ""));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password...).</li>
        <li>Scan this QR code, or enter the key below by hand.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex justify-center rounded-[var(--radius-md)] bg-white p-3">
        <QRCodeSVG value={otpauthUri} size={168} marginSize={1} title="Authenticator QR code" />
      </div>
      <p className="break-all text-center font-mono text-xs text-[var(--color-text-muted)]" aria-label="Setup key">
        {secret.match(/.{1,4}/g)?.join(" ")}
      </p>
      {errorMessage && <Alert tone="danger">{errorMessage}</Alert>}
      <Input
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button type="submit" isLoading={isSubmitting} disabled={code.replace(/\s/g, "").length !== 6} className="w-full">
        {!isSubmitting && <ShieldCheck className="size-4" aria-hidden="true" />}
        Turn on two-factor authentication
      </Button>
    </form>
  );
}
