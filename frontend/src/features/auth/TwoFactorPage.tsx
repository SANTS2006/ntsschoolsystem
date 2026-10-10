import { KeyRound } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { AuthCard } from "./components/AuthCard";
import { AuthenticatorSetup } from "./components/AuthenticatorSetup";
import { BrandMark } from "./components/BrandMark";
import { RecoveryCodesPanel } from "./components/RecoveryCodesPanel";
import { authButtonClass, authInputClass } from "./components/authStyles";
import { useBeginTwoFactorSetup, useConfirmTwoFactorSetup, useVerifyTwoFactor } from "./useAuth";

interface ChallengeState {
  token?: string;
  mode?: "verify" | "setup";
  from?: string;
}

/** Second step of sign-in. The password was right but no session exists yet: either enter the
 * authenticator code ("verify") or, for an account that must have 2FA and doesn't yet, enrol one
 * ("setup"). Reached only via LoginForm, which passes the short-lived token in router state. */
export function TwoFactorPage() {
  const state = (useLocation().state as ChallengeState | null) ?? {};
  if (!state.token || !state.mode) {
    return <Navigate to="/login" replace />;
  }
  return (
    <AuthCard
      mark={<BrandMark />}
      subtitle="NTS School System"
      title={state.mode === "setup" ? "Set up two-factor authentication" : "Two-factor authentication"}
    >
      {state.mode === "setup" ? (
        <SetupStep token={state.token} redirectTo={state.from ?? "/"} />
      ) : (
        <VerifyStep token={state.token} redirectTo={state.from ?? "/"} />
      )}
    </AuthCard>
  );
}

function VerifyStep({ token, redirectTo }: { token: string; redirectTo: string }) {
  const navigate = useNavigate();
  const verify = useVerifyTwoFactor();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    verify.mutate({ token, code }, { onSuccess: () => navigate(redirectTo, { replace: true }) });
  };

  const error = verify.error as ApiError | null;
  // The token lives 5 minutes: once it has expired the only way forward is to sign in again.
  const expired = error?.code === "TWO_FACTOR_TOKEN_INVALID";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        {useRecovery
          ? "Enter one of your recovery codes. Each one works only once."
          : "Open your authenticator app and enter the 6-digit code for NTS School System."}
      </p>
      {error && (
        <Alert tone="danger">
          {expired ? "This sign-in step has expired. Please sign in again." : error.message}
        </Alert>
      )}
      <Input
        label={useRecovery ? "Recovery code" : "6-digit code"}
        icon={KeyRound}
        inputMode={useRecovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoFocus
        placeholder={useRecovery ? "XXXXX-XXXXX" : "123456"}
        className={authInputClass}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button type="submit" isLoading={verify.isPending} disabled={!code.trim() || expired} className={authButtonClass}>
        Verify
      </Button>
      <div className="flex flex-col items-start gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setUseRecovery((value) => !value);
            setCode("");
            verify.reset();
          }}
          className="font-medium text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {useRecovery ? "Use my authenticator app instead" : "Lost your phone? Use a recovery code"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/login", { replace: true })}
          className="text-[var(--color-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          Back to sign in
        </button>
      </div>
    </form>
  );
}

function SetupStep({ token, redirectTo }: { token: string; redirectTo: string }) {
  const navigate = useNavigate();
  const begin = useBeginTwoFactorSetup();
  const confirm = useConfirmTwoFactorSetup();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const { mutate: startSetup } = begin;
  // React StrictMode runs effects twice in development; each call would replace the server-side
  // secret, so the QR code on screen could end up not matching the stored one.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startSetup(token);
  }, [token, startSetup]);

  if (recoveryCodes) {
    return (
      <RecoveryCodesPanel
        codes={recoveryCodes}
        continueLabel="Continue to the app"
        onContinue={() => navigate(redirectTo, { replace: true })}
      />
    );
  }

  if (begin.isError) {
    return (
      <Alert tone="danger">
        {(begin.error as ApiError).code === "TWO_FACTOR_TOKEN_INVALID"
          ? "This sign-in step has expired. Please sign in again."
          : (begin.error as ApiError).message}
      </Alert>
    );
  }

  if (!begin.data) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">Your role requires two-factor authentication before you can use the system.</Alert>
      <AuthenticatorSetup
        secret={begin.data.secret}
        otpauthUri={begin.data.otpauth_uri}
        isSubmitting={confirm.isPending}
        errorMessage={confirm.isError ? (confirm.error as ApiError).message : undefined}
        onConfirm={(code) => confirm.mutate({ token, code }, { onSuccess: (r) => setRecoveryCodes(r.recovery_codes) })}
      />
    </div>
  );
}
