import { Search } from "lucide-react";

import { AuthCard } from "./components/AuthCard";
import { BrandMark } from "./components/BrandMark";
import { LoginForm } from "./LoginForm";

/** The platform's own sign-in page: only platform administrators sign in here. Everyone else signs in from
 * their school's page, which "Find your school" leads them to. */
export function LoginPage() {
  return (
    <AuthCard
      mark={<BrandMark />}
      subtitle="NTS School System"
      title="Platform sign in"
      footer={
        <div className="mt-6 flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            This page is for platform administrators. Students, staff and parents sign in from their own school&apos;s page.
          </p>
          <a
            href="/find-school"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:underline"
          >
            <Search className="size-4" aria-hidden="true" />
            Find your school
          </a>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
