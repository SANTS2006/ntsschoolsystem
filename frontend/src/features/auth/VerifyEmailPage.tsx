import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { confirmEmailVerification } from "./api";
import { AuthCard } from "./components/AuthCard";
import { BrandMark } from "./components/BrandMark";

/** Where the "Verify email" button in a verification email lands: confirms the address straight away. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const verify = useMutation<void, ApiError, { uid: string; token: string }>({ mutationFn: confirmEmailVerification });
  const started = useRef(false);

  useEffect(() => {
    if (uid && token && !started.current) {
      started.current = true;
      verify.mutate({ uid, token });
    }
  }, [uid, token, verify]);

  return (
    <AuthCard
      mark={<BrandMark />}
      subtitle="NTS School System"
      title="Verify your email"
      footer={
        <Link to="/login" className="mt-5 inline-flex text-sm font-medium text-[var(--color-primary)]">
          Go to sign in
        </Link>
      }
    >
      {!uid || !token ? (
        <Alert tone="danger">This verification link is invalid.</Alert>
      ) : verify.isError ? (
        <Alert tone="danger">{verify.error.message}</Alert>
      ) : verify.isSuccess ? (
        <Alert tone="success">
          <span className="inline-flex items-center gap-2">
            <MailCheck className="size-4" aria-hidden="true" /> Your email address is verified.
          </span>
        </Alert>
      ) : (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
    </AuthCard>
  );
}
