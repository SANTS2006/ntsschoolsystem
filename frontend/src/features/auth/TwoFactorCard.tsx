import { ShieldCheck, ShieldOff } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import type { TwoFactorEnrollment } from "./api";
import { AuthenticatorSetup } from "./components/AuthenticatorSetup";
import { RecoveryCodesPanel } from "./components/RecoveryCodesPanel";
import {
  useDisableTwoFactor,
  useEnableTwoFactor,
  useEnrollTwoFactor,
  useRegenerateRecoveryCodes,
  useTwoFactorStatus,
} from "./useAuth";

type View =
  | { step: "status" }
  | { step: "password" }
  | { step: "scan"; enrollment: TwoFactorEnrollment }
  | { step: "codes"; codes: string[] }
  | { step: "disable" }
  | { step: "regenerate" };

/** Settings > Two-factor authentication. Turning it on/off or replacing the recovery codes always
 * re-asks for the password (and, when turning off / regenerating, a current code), so a hijacked
 * session can't quietly weaken the account. */
export function TwoFactorCard() {
  const { data: status, isLoading } = useTwoFactorStatus();
  const [view, setView] = useState<View>({ step: "status" });
  const { showToast } = useToast();
  const enroll = useEnrollTwoFactor();
  const enable = useEnableTwoFactor();
  const disable = useDisableTwoFactor();
  const regenerate = useRegenerateRecoveryCodes();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const back = () => {
    setView({ step: "status" });
    setPassword("");
    setCode("");
    enroll.reset();
    enable.reset();
    disable.reset();
    regenerate.reset();
  };

  const errorText = (err: unknown) => (err ? (err as ApiError).message : undefined);

  const startEnrollment = (event: FormEvent) => {
    event.preventDefault();
    enroll.mutate(password, { onSuccess: (enrollment) => setView({ step: "scan", enrollment }) });
  };

  const submitDisable = (event: FormEvent) => {
    event.preventDefault();
    disable.mutate(
      { password, code },
      {
        onSuccess: () => {
          showToast({ title: "Two-factor authentication turned off" });
          back();
        },
      },
    );
  };

  const submitRegenerate = (event: FormEvent) => {
    event.preventDefault();
    regenerate.mutate({ password, code }, { onSuccess: (codes) => setView({ step: "codes", codes }) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <p className="text-sm text-[var(--color-text-muted)]">
          A second step at sign-in — a 6-digit code from your phone — so a stolen password alone isn't enough.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading || !status ? (
          <Spinner />
        ) : view.step === "status" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={status.enabled ? "success" : "warning"}>{status.enabled ? "On" : "Off"}</Badge>
              {status.recommended && <Badge tone="primary">Recommended for your role</Badge>}
              {status.enabled && (
                <span className="text-sm text-[var(--color-text-muted)]">
                  {status.recovery_codes_remaining} recovery code{status.recovery_codes_remaining === 1 ? "" : "s"} left
                </span>
              )}
            </div>
            {status.recommended && !status.enabled && (
              <Alert tone="warning">
                Two-factor authentication is switched off for your account. Your role handles sensitive data, so it is
                recommended to turn it back on.
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {!status.enabled && (
                <Button onClick={() => setView({ step: "password" })}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Turn on
                </Button>
              )}
              {status.enabled && (
                <Button variant="secondary" onClick={() => setView({ step: "regenerate" })}>
                  New recovery codes
                </Button>
              )}
              {status.enabled && (
                <Button variant="danger" onClick={() => setView({ step: "disable" })}>
                  <ShieldOff className="size-4" aria-hidden="true" />
                  Turn off
                </Button>
              )}
            </div>
          </>
        ) : view.step === "password" ? (
          <form onSubmit={startEnrollment} className="flex max-w-sm flex-col gap-3">
            <p className="text-sm text-[var(--color-text-muted)]">Confirm your password to continue.</p>
            {enroll.isError && <Alert tone="danger">{errorText(enroll.error)}</Alert>}
            <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" isLoading={enroll.isPending} disabled={!password}>
                Continue
              </Button>
              <Button type="button" variant="secondary" onClick={back}>
                Cancel
              </Button>
            </div>
          </form>
        ) : view.step === "scan" ? (
          <div className="max-w-sm">
            <AuthenticatorSetup
              secret={view.enrollment.secret}
              otpauthUri={view.enrollment.otpauth_uri}
              isSubmitting={enable.isPending}
              errorMessage={errorText(enable.error)}
              onConfirm={(value) =>
                enable.mutate(value, { onSuccess: (codes) => setView({ step: "codes", codes }) })
              }
            />
            <Button variant="secondary" className="mt-3" onClick={back}>
              Cancel
            </Button>
          </div>
        ) : view.step === "codes" ? (
          <div className="max-w-sm">
            <RecoveryCodesPanel codes={view.codes} continueLabel="Done" onContinue={back} />
          </div>
        ) : (
          <form
            onSubmit={view.step === "disable" ? submitDisable : submitRegenerate}
            className="flex max-w-sm flex-col gap-3"
          >
            <p className="text-sm text-[var(--color-text-muted)]">
              {view.step === "disable"
                ? "Enter your password and a current code to turn two-factor authentication off."
                : "Enter your password and a current code. Your old recovery codes will stop working."}
            </p>
            {(disable.isError || regenerate.isError) && (
              <Alert tone="danger">{errorText(disable.error ?? regenerate.error)}</Alert>
            )}
            <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant={view.step === "disable" ? "danger" : "primary"}
                isLoading={disable.isPending || regenerate.isPending}
                disabled={!password || !code}
              >
                {view.step === "disable" ? "Turn off" : "Generate new codes"}
              </Button>
              <Button type="button" variant="secondary" onClick={back}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
