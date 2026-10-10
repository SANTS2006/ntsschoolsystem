import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { ApiError } from "@/lib/api-client";

import { acceptInvitation } from "./api";
import { AuthCard } from "./components/AuthCard";
import { BrandMark } from "./components/BrandMark";
import { authButtonClass, authInputClass } from "./components/authStyles";

/** Where the "Accept invitation" button in an invitation email lands — inside the inviting school's own
 * address, so it is dressed as that school. The invitee chooses their password and is sent to sign in. */
export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const accept = useMutation<void, ApiError, { uid: string; token: string; password: string }>({
    mutationFn: acceptInvitation,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setFieldError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setFieldError("Passwords do not match");
      return;
    }
    setFieldError(undefined);
    accept.mutate({ uid, token, password });
  };

  return (
    <AuthCard
      mark={<BrandMark />}
      subtitle="NTS School System"
      title="Set your password"
      footer={
        <Link to="/login" className="mt-5 inline-flex text-sm font-medium text-[var(--color-primary)]">
          Go to sign in
        </Link>
      }
    >
      {!uid || !token ? (
        <Alert tone="danger">This invitation link is invalid. Ask your administrator to send a new one.</Alert>
      ) : accept.isSuccess ? (
        <Alert tone="success">Your account is active. You can now sign in with your new password.</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {accept.isError && <Alert tone="danger">{accept.error.message}</Alert>}
          <PasswordInput
            label="Password"
            placeholder="Choose a password"
            autoComplete="new-password"
            className={authInputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordInput
            label="Confirm password"
            placeholder="Repeat the password"
            autoComplete="new-password"
            className={authInputClass}
            error={fieldError}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" isLoading={accept.isPending} className={authButtonClass}>
            {!accept.isPending && <KeyRound className="size-4" aria-hidden="true" />}
            Activate account
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
