import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { ApiError } from "@/lib/api-client";
import { useSchoolSlug } from "@/lib/schoolSlug";

import { authButtonClass, authInputClass } from "./components/authStyles";
import { useLogin } from "./useAuth";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/** The actual authenticate-with-email-and-password logic, shared verbatim by the generic
 * `/login` page and every per-school branded `/login/:slug` page — the slug is presentation-only
 * (which header/logo renders around this form), never part of the auth request itself. */
export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  // Which school's sign-in page this is (none on the platform's own page).
  const schoolSlug = useSchoolSlug();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const locationState = location.state as { from?: string; reason?: string } | null;
  const redirectTo = locationState?.from ?? "/";
  const signedOutForInactivity = locationState?.reason === "idle";

  const onSubmit = (values: LoginFormValues) => {
    login.mutate({ ...values, schoolSlug }, {
      onSuccess: (result) => {
        if (result.kind === "two-factor") {
          navigate("/two-factor", { replace: true, state: { token: result.token, mode: result.mode, from: redirectTo } });
        } else {
          navigate(redirectTo, { replace: true });
        }
      },
    });
  };

  return (
    <>
      {signedOutForInactivity && !login.isError && (
        <Alert tone="info" className="mb-4">
          You were signed out after a period of inactivity. Please sign in again.
        </Alert>
      )}
      {login.isError && (
        <Alert tone="danger" className="mb-4" role="alert">
          {(login.error as ApiError).message}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          type="email"
          label="Email"
          icon={Mail}
          placeholder="Enter your email"
          autoComplete="username"
          className={authInputClass}
          error={errors.email?.message}
          {...register("email")}
        />
        <PasswordInput
          label="Password"
          placeholder="Enter your password"
          autoComplete="current-password"
          className={authInputClass}
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="-mt-1 flex justify-end">
          <Link
            to="/forgot-password"
            className="rounded text-sm font-medium text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" isLoading={login.isPending} className={authButtonClass}>
          {!login.isPending && <LogIn className="size-4" aria-hidden="true" />}
          Sign In
        </Button>
      </form>
    </>
  );
}
