import { Home, Search } from "lucide-react";

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
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)]"
          >
            <Search className="size-4" aria-hidden="true" />
            Find your school
          </a>
          {/* A full page load on purpose: "/" is the public website, which is served by the server, not this app's router. */}
          <a
            href="/"
            className="mt-2 inline-flex w-fit items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
          >
            <Home className="size-4" aria-hidden="true" />
            Back to website
          </a>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
