import { BellRing, BellOff } from "lucide-react";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ui/toastContext";

import { currentPushState, disablePush, enablePush, fetchPushConfig, type PushState } from "./push";

/** "Turn on alerts for this device". Shown in the notification bell. Hidden when this browser can't do push or the
 * system has not been set up for it, so nobody is offered something that cannot work. */
export function PushToggle() {
  const { showToast } = useToast();
  const [state, setState] = useState<PushState | "hidden">("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [current, config] = await Promise.all([currentPushState(), fetchPushConfig().catch(() => ({ enabled: false, public_key: "" }))]);
      if (!cancelled) setState(current === "unsupported" || !config.enabled ? "hidden" : current);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "hidden") return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (state === "on") {
        await disablePush();
        setState("off");
      } else {
        const next = await enablePush();
        setState(next);
        if (next === "on") showToast({ title: "Alerts are on", description: "You will be notified on this device as things happen." });
        if (next === "blocked") showToast({ title: "Alerts are blocked", description: "Allow notifications for this site in your browser settings, then try again.", tone: "danger" });
      }
    } catch (error) {
      showToast({ title: "Could not change alerts", description: error instanceof Error ? error.message : "Please try again.", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const blocked = state === "blocked";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || blocked}
      title={blocked ? "Notifications are blocked for this site in your browser settings" : undefined}
      className="flex w-full items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-2.5 text-left text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="flex items-center gap-2">
        {state === "on" ? <BellRing className="size-4 text-[var(--color-primary)]" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
        {state === "on" ? "Alerts are on for this device" : blocked ? "Alerts are blocked in your browser" : "Get alerts on this device"}
      </span>
      {!blocked && <span className="font-medium text-[var(--color-primary)]">{state === "on" ? "Turn off" : "Turn on"}</span>}
    </button>
  );
}
