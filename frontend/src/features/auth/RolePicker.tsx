import { ChevronRight, UserCog } from "lucide-react";

import { useBrand } from "@/lib/brandTheme";

import { useActiveRole, useCurrentUser } from "./useAuth";
import { useSignOut } from "./useSignOut";

/** Shown to someone who holds more than one role until they choose which to work as. Nothing of the app — not the
 * menu, not a single page — is shown before the choice, and after it they see only that role's modules. */
export function RolePicker() {
  const { data: user } = useCurrentUser();
  const { setActiveRoleSlug } = useActiveRole();
  const signOut = useSignOut();
  const brand = useBrand();
  if (!user) return null;

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--color-bg-subtle)] px-4 py-10">
      <div className="w-full max-w-md rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]">
          <UserCog className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-[var(--color-text)]">How do you want to work today?</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Hi {user.first_name}, you have more than one role at {brand.name}. Choose one — you&apos;ll see and be able to do
          only what that role allows, and you can switch from the menu at any time.
        </p>
        <ul className="mt-5 flex flex-col gap-2">
          {user.available_roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => setActiveRoleSlug(role.slug)}
                className="group flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-3 text-left transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-subtle)]"
              >
                <span className="text-sm font-semibold text-[var(--color-text)]">{role.name}</span>
                <ChevronRight className="size-4 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-5 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
