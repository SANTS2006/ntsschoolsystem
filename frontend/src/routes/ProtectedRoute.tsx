import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useCurrentUser, useHeartbeat } from "@/features/auth/useAuth";
import { useSignOut } from "@/features/auth/useSignOut";
import { LiveUpdates } from "@/features/notifications/LiveUpdates";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { goTo, schoolPath, useSchoolSlug } from "@/lib/schoolSlug";

/** Shown only when the app cannot even find out who is signed in. It keeps trying by itself (the server may be waking up
 * or the connection slow), so the person usually never has to press anything. */
function UnreachableScreen({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  useEffect(() => {
    const timer = window.setInterval(onRetry, 6000);
    return () => window.clearInterval(timer);
  }, [onRetry]);
  return (
    <div role="alert" className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">We can&apos;t reach the server right now</h2>
      <p className="max-w-md text-sm text-[var(--color-text-muted)]">
        Your connection may have dropped, or the service is starting up. You haven&apos;t been signed out. We&apos;ll keep trying and carry on by
        ourselves as soon as it is back.
      </p>
      <Button onClick={onRetry} isLoading={retrying}>
        Try again
      </Button>
    </div>
  );
}

export function ProtectedRoute() {
  const location = useLocation();
  const { data: user, isLoading, isError, error, refetch, isFetching } = useCurrentUser();
  const signOut = useSignOut();
  const slug = useSchoolSlug();

  // A school's people belong under their school's address. Arriving anywhere else — the generic sign-in,
  // an old bookmark without the school in it, another school's address — moves them to the right place.
  const ownSlug = user && !user.is_platform_admin ? (user.school?.slug ?? null) : null;
  const misplaced = !!ownSlug && ownSlug !== slug;
  useEffect(() => {
    if (!ownSlug || !misplaced) return;
    const here = location.pathname === "/" || location.pathname === "/login" ? "/dashboard" : location.pathname;
    goTo(`${schoolPath(ownSlug, here)}${location.search}`, { replace: true });
  }, [misplaced, ownSlug, location.pathname, location.search]);

  // Only once there's a real authenticated session — an anonymous visitor bouncing off
  // /login has no session for the backend to attach a heartbeat to.
  useHeartbeat(!!user);

  // Shared school computers: end an abandoned session instead of leaving it open for the next person.
  const { secondsLeft, stayActive } = useIdleLogout(!!user, () => {
    void signOut({ reason: "idle", message: "You were inactive — signing you out…" });
  });

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (misplaced) {
    return <FullPageSpinner />;
  }

  // Signed out / session expired -> the sign-in page. But "couldn't reach the server" (offline, timeout, a 5xx)
  // is NOT the same as signed out: sending someone to /login because the API hiccupped looks like a logout,
  // and bouncing back and forth looks like a redirect loop. They get a retry screen instead.
  const status = (error as { status?: number } | null)?.status;
  const sessionProblem = isError && (status === 401 || status === 403);
  // A hiccup while refreshing who is signed in must never take the page away from someone who is already working: only a
  // person we have never managed to identify (no cached user at all) gets the "can't reach the server" screen.
  if (isError && !sessionProblem && !user) {
    return <UnreachableScreen onRetry={() => void refetch()} retrying={isFetching} />;
  }

  if (sessionProblem || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <>
      <LiveUpdates />
      <Outlet />
      {secondsLeft !== null && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="idle-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
            <h2 id="idle-title" className="text-base font-semibold text-[var(--color-text)]">
              Still there?
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              For your security you'll be signed out in <strong>{secondsLeft}</strong> second
              {secondsLeft === 1 ? "" : "s"} because there's been no activity.
            </p>
            <div className="mt-5 flex justify-end">
              <Button onClick={stayActive} autoFocus>
                Stay signed in
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
