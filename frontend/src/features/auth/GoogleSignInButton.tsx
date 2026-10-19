import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import type { ApiError } from "@/lib/api-client";
import { useSchoolSlug } from "@/lib/schoolSlug";

import { useGoogleConfig, useGoogleLogin } from "./useAuth";

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
      renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
    };
  };
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptPromise: Promise<GoogleIdentity | null> | null = null;

/** Loads Google's sign-in script once. Resolves to null when it can't load (offline, blocked), so the page still works. */
function loadGoogle(): Promise<GoogleIdentity | null> {
  const existing = (window as unknown as { google?: GoogleIdentity }).google;
  if (existing?.accounts?.id) return Promise.resolve(existing);
  scriptPromise ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve((window as unknown as { google?: GoogleIdentity }).google ?? null);
    script.onerror = () => {
      scriptPromise = null; // allow another try next time
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** "Continue with Google" for the sign-in forms. Shows nothing at all when the school/platform hasn't set Google up, and
 * only ever signs in an existing account whose email matches the Google account. */
export function GoogleSignInButton() {
  const { data: config } = useGoogleConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const schoolSlug = useSchoolSlug();
  const googleLogin = useGoogleLogin();
  const holder = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  // Always call the latest handler without re-initialising Google's button on every render.
  const handler = useRef<(credential: string) => void>(() => undefined);
  const signIn = (credential: string) =>
    googleLogin.mutate(
      { credential, schoolSlug },
      {
        onSuccess: (result) => {
          if (result.kind === "two-factor") {
            navigate("/two-factor", { replace: true, state: { token: result.token, mode: result.mode, from: redirectTo } });
          } else {
            navigate(redirectTo, { replace: true });
          }
        },
      },
    );

  useEffect(() => {
    handler.current = signIn;
  });

  const clientId = config?.enabled ? config.client_id : "";
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    void loadGoogle().then((google) => {
      if (cancelled) return;
      if (!google || !holder.current) {
        setUnavailable(true);
        return;
      }
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) handler.current(response.credential);
        },
      });
      holder.current.innerHTML = "";
      google.accounts.id.renderButton(holder.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: Math.min(holder.current.clientWidth || 320, 400),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId || unavailable) return null;

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        or
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
      {googleLogin.isError && (
        <Alert tone="danger" role="alert">
          {(googleLogin.error as ApiError).message}
        </Alert>
      )}
      <div ref={holder} className="flex min-h-11 w-full justify-center" aria-busy={googleLogin.isPending || undefined} />
    </div>
  );
}
