import { CheckCircle2 } from "lucide-react";

import { Spinner } from "@/components/ui/Spinner";
import { useSignOutState } from "@/features/auth/signOutStore";
import { useBrand } from "@/lib/brandTheme";

/** Covers the whole screen while someone is being signed out: the logo-and-ring loader with a message,
 * then a quick confirmation. Mounted once at the top of the app so it survives the page changing underneath. */
export function SignOutOverlay() {
  const state = useSignOutState();
  const brand = useBrand();
  if (state.phase === "idle") return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#04081a]/70 p-4 backdrop-blur-md">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
        aria-label="Signing out"
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-8 text-center shadow-[var(--shadow-md)]"
      >
        {state.phase === "working" ? (
          <>
            <Spinner size="lg" label="Signing out" />
            <div>
              <p className="text-base font-semibold text-[var(--color-text)]">{state.message}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Please wait a moment.</p>
            </div>
          </>
        ) : (
          <>
            <span className="flex size-[72px] items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] text-[var(--color-success)]">
              <CheckCircle2 className="size-9" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-semibold text-[var(--color-text)]">You&apos;re signed out</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Thanks for using {brand.name}.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
