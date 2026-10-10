import { School } from "lucide-react";

import { Spinner } from "@/components/ui/Spinner";
import { useSchoolBranding } from "@/features/schools/useSchoolsCrud";
import { useSchoolSlug } from "@/lib/schoolSlug";

import { AuthCard } from "./components/AuthCard";
import { BrandMark } from "./components/BrandMark";
import { LoginForm } from "./LoginForm";

export function BrandedLoginPage() {
  const slug = useSchoolSlug() ?? undefined;
  const { data: school, isLoading, isError } = useSchoolBranding(slug);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (isError || !school) {
    return (
      <AuthCard mark={<BrandMark />} title="School not found">
        <div className="flex flex-col items-start gap-3">
          <School className="size-8 text-[var(--color-text-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-text)]">We couldn't find that school.</p>
          <a href="/login" className="text-sm font-medium text-[var(--color-primary)]">
            Go to the sign-in page
          </a>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      mark={<BrandMark logo={school.logo} name={school.name} />}
      subtitle={school.name}
      title="Sign in to your account"
      footer={
        <p className="mt-5 text-xs text-[var(--color-text-muted)]">
          Not your school?{" "}
          <a href="/find-school" className="font-medium text-[var(--color-primary)]">
            Find it here
          </a>
        </p>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
