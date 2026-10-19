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

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
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
      {/* Our own button is what people see, so the look never depends on Google's stylesheet loading. Google's real button sits
          invisibly on top of it and receives the click; anything it draws is clipped to this box. */}
      <div className="relative h-11 w-full overflow-hidden rounded-full">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5 rounded-full border border-[var(--color-border)] bg-white text-sm font-semibold text-slate-800 shadow-sm"
        >
          <GoogleLogo className="size-5" />
          Continue with Google
        </div>
        <div
          ref={holder}
          className="absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.01]"
          aria-busy={googleLogin.isPending || undefined}
        />
      </div>
    </div>
  );
}
