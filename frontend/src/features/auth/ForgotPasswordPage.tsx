import { useMutation } from "@tanstack/react-query";
import { Mail, Send } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ApiError } from "@/lib/api-client";

import { requestPasswordReset } from "./api";
import { AuthCard } from "./components/AuthCard";
import { BrandMark } from "./components/BrandMark";
import { authButtonClass, authInputClass } from "./components/authStyles";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const request = useMutation<string, ApiError, string>({ mutationFn: requestPasswordReset });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFieldError("Enter a valid email address");
      return;
    }
    setFieldError(undefined);
    request.mutate(email);
  };

  return (
    <AuthCard
      mark={<BrandMark />}
      subtitle="NTS School System"
      title="Reset your password"
      footer={
        <Link
          to="/login"
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to sign in
        </Link>
      }
    >
      {request.isSuccess ? (
        <Alert tone="success">{request.data}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter your account email and we'll send you a link to choose a new password.
          </p>
          {request.isError && <Alert tone="danger">{request.error.message}</Alert>}
          <Input
            type="email"
            label="Email"
            icon={Mail}
            placeholder="Enter your email"
            autoComplete="username"
            className={authInputClass}
            error={fieldError}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" isLoading={request.isPending} className={authButtonClass}>
            {!request.isPending && <Send className="size-4" aria-hidden="true" />}
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
