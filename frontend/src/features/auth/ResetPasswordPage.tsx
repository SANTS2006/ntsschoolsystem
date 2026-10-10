import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { ApiError } from "@/lib/api-client";

import { confirmPasswordReset } from "./api";
import { AuthCard } from "./components/AuthCard";
import { BrandMark } from "./components/BrandMark";
import { authButtonClass, authInputClass } from "./components/authStyles";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const reset = useMutation<void, ApiError, { uid: string; token: string; new_password: string }>({
    mutationFn: confirmPasswordReset,
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
    reset.mutate({ uid, token, new_password: password });
  };

  const backLink = (
    <Link
      to="/login"
      className="back-button"
    >
      <BackArrowIcon className="size-4" />
      Back to sign in
    </Link>
  );

  return (
    <AuthCard mark={<BrandMark />} subtitle="NTS School System" title="Choose a new password" footer={backLink}>
      {!uid || !token ? (
        <Alert tone="danger">This reset link is invalid. Request a new one from the sign-in page.</Alert>
      ) : reset.isSuccess ? (
        <Alert tone="success">Your password has been updated. You can now sign in.</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {reset.isError && <Alert tone="danger">{reset.error.message}</Alert>}
          <PasswordInput
            label="New password"
            placeholder="Enter a new password"
            autoComplete="new-password"
            className={authInputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordInput
            label="Confirm password"
            placeholder="Repeat the new password"
            autoComplete="new-password"
            className={authInputClass}
            error={fieldError}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" isLoading={reset.isPending} className={authButtonClass}>
            {!reset.isPending && <KeyRound className="size-4" aria-hidden="true" />}
            Update password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
